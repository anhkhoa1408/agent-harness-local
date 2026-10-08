import {
  ModelMapSchema,
  NewTaskSchema,
  RepositorySchema,
  aiStages,
} from "../core/contracts";
import {
  resolveModel,
  applyEffortPolicy,
  type ModelInfo,
} from "../core/model-policy";
import { SettingsSchema } from "../core/settings";
import type { Store } from "../storage/store";
import type { StoryRepositoryPort } from "./ports";
export class TaskService {
  constructor(
    private readonly store: Pick<Store, "getRecord" | "createTask" | "atomic">,
    private readonly repository: Pick<StoryRepositoryPort, "readGit">,
    private readonly listModels: () => Promise<ModelInfo[]>,
  ) {}
  async createTask(raw: Record<string, unknown>) {
    const settings = SettingsSchema.parse(
      this.store.getRecord("settings", "current") ?? {},
    );
    const repo = RepositorySchema.parse(
      this.store.getRecord("repository", raw.repositoryId as string),
    );
    const sourceCommit = await this.repository.readGit(repo.root, [
      "rev-parse",
      "--verify",
      `${repo.baseBranch}^{commit}`,
    ]);
    const task = NewTaskSchema.parse({
      ...raw,
      featureId: undefined,
      storyId: undefined,
      sourceCommit,
      executionMode: raw.executionMode ?? settings.executionMode,
      targetBranch: raw.targetBranch ?? repo.baseBranch,
      models: applyEffortPolicy(
        ModelMapSchema.parse(raw.models ?? settings.models),
      ),
    });
    await this.repository.readGit(repo.root, [
      "check-ref-format",
      "--branch",
      task.targetBranch,
    ]);
    const catalog = await this.listModels();
    for (const stage of aiStages) resolveModel(stage, task.models, {}, catalog);
    return this.store.atomic(() => {
      if (!this.store.getRecord("repository", task.repositoryId))
        throw new Error("repository_not_found");
      return this.store.createTask(task);
    });
  }
}
