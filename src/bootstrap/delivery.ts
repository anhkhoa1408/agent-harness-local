import {
  createDelivery as deliver,
  createStoryCheckpoint as checkpoint,
} from "../application/delivery";
import type { Task, Plan } from "../domain/contracts";
import type { Store } from "../infrastructure/persistence/store";
import { createRepositories } from "../infrastructure/persistence/repositories";
import { validation } from "../infrastructure/validation/gateway";
import { deliveryIO } from "../infrastructure/delivery/adapters";
export type { GitHubPort, Delivery } from "../application/delivery";
export {
  githubCli,
  githubRepository,
} from "../infrastructure/delivery/github-cli";
export function createDelivery(
  store: Store,
  data: string,
  options: Parameters<typeof deliver>[3] = {},
) {
  return deliver(
    createRepositories(store),
    deliveryIO(data),
    validation,
    options,
  );
}
export function createStoryCheckpoint(
  store: Store,
  data: string,
  task: Task,
  signal: AbortSignal,
  context: { plan: Plan; storyId: string },
) {
  return checkpoint(
    createRepositories(store),
    deliveryIO(data),
    validation,
    task,
    signal,
    context,
  );
}
