import type {ApplicationStore} from "./ports";
import type {ValidationPort} from "./validation";
import type {ModelService} from "./models";
import {
} from "../domain/contracts";
import {
  applyEffortPolicy,
} from "../domain/model-policy";
import type { StoryRepositoryPort } from "./ports";
export class TaskService {
  constructor(
    private readonly store: ApplicationStore,
    private readonly repository: Pick<StoryRepositoryPort, "resolveCommit"|"validateBranch">,
    private readonly models:ModelService,
    private readonly validation:ValidationPort,
  ) {}
  async createTask(raw: Record<string, unknown>) {
    const settings = this.models.getSettings();
    const repo = this.validation.repository(
      this.store.repositories.get(raw.repositoryId as string),
    );
    const sourceCommit = await this.repository.resolveCommit(repo.root,repo.baseBranch);
    const task = this.validation.newTask({
      ...raw,
      featureId: undefined,
      storyId: undefined,
      sourceCommit,
      executionMode: raw.executionMode ?? settings.executionMode,
      targetBranch: raw.targetBranch ?? repo.baseBranch,
      models: applyEffortPolicy(
        this.validation.models(raw.models ?? settings.models),
      ),
    });
    await this.repository.validateBranch(repo.root,task.targetBranch);
    await this.models.validateModels(task.models);
    return this.store.atomic(() => {
      if (!this.store.repositories.get(task.repositoryId))
        throw new Error("repository_not_found");
      return this.store.tasks.create(task);
    });
  }
}
