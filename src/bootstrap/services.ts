import type { Store } from "../infrastructure/persistence/store";
import { createRepositories } from "../infrastructure/persistence/repositories";
import { createStoryGit } from "../infrastructure/repositories/story-git";
import { validation } from "../infrastructure/validation/gateway";
import { systemRuntime } from "../infrastructure/runtime/system";
import { ModelService } from "../application/models";
import type { ModelCatalogPort } from "../application/models";
import { StoryService } from "../application/stories";
import { PlanService } from "../application/planning";
import { TaskService } from "../application/tasks";
import { RepositoryService } from "../application/repositories";
import {
  registration,
  repositoryArtifacts,
} from "../infrastructure/repositories/registration";
export function createServices(
  store: Store,
  data = ".harness",
  catalog: ModelCatalogPort = { listModels: async () => [] },
) {
  const repositories = createRepositories(store),
    git = createStoryGit();
  const models = new ModelService(
    {
      get: () =>
        validation.settings(repositories.settings.get("current") ?? {}),
      put: (value) => repositories.settings.put("current", value),
    },
    catalog,
  );
  const stories = new StoryService(
    repositories,
    git,
    validation,
    systemRuntime,
  );
  return {
    store: repositories,
    models,
    stories,
    plans: new PlanService(repositories, stories, validation, systemRuntime),
    tasks: new TaskService(repositories, git, models, validation),
    repositories: new RepositoryService(
      repositories,
      registration,
      repositoryArtifacts(data),
    ),
  };
}
