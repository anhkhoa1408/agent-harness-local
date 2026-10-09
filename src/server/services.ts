import {createStoryGit} from "../infrastructure/repositories/story-git";
import {createRepositories} from "../infrastructure/persistence/repositories";
import {validation} from "../infrastructure/validation/gateway";
import {systemRuntime} from "../infrastructure/runtime/system";
import type { Store } from "../storage/store";
import { inspectRepository, gitText } from "../repositories/inspect";
import { fingerprintWorktree } from "../repositories/fingerprint";
import { PlanService } from "../application/planning";
import { StoryService } from "../application/stories";
export function createServices(store: Store) {
  const stories = new StoryService(createRepositories(store), createStoryGit(),validation,systemRuntime);
  return {
    stories,
    plans: new PlanService(createRepositories(store), stories,validation,systemRuntime),
    async registerRepository(input: {
      path: string;
      baseBranch: string;
      remote: string | null;
    }) {
      const repo = await inspectRepository(
        input.path,
        input.baseBranch,
        input.remote,
      );
      store.putRecord("repository", repo.id, repo);
      return repo;
    },
  };
}
