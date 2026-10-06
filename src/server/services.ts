import type { Store } from "../storage/store";
import { inspectRepository, gitText } from "../repositories/inspect";
import { fingerprintWorktree } from "../repositories/fingerprint";
import { PlanService } from "../application/plan-service";
import { StoryService } from "../application/story-service";
export function createServices(store: Store) {
  const stories = new StoryService(store, {
    readGit: gitText,
    fingerprintWorktree,
  });
  return {
    stories,
    plans: new PlanService(store, stories),
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
