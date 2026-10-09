import type { Task, Plan } from "../../domain/contracts";
import type { ApplicationStore } from "../ports";
import type { ValidationPort } from "../validation";
import { evidenceExclusions } from "../../domain/evidence";
import { createDelivery } from "./service";
import type { DeliveryDependencies, StoryCheckpoint } from "./types";
export async function createStoryCheckpoint(
  store: ApplicationStore,
  io: DeliveryDependencies,
  validation: ValidationPort,
  task: Task,
  signal: AbortSignal,
  context: { plan: Plan; storyId: string },
): Promise<StoryCheckpoint> {
  const { plan, storyId } = context,
    prefix = `${task.id}:story:${plan.version}:${storyId}`;
  const head = await io.git.head(task.worktree!);
  if (head !== task.sourceCommit) {
    const fingerprint = await io.git.fingerprint(
      task.worktree!,
      evidenceExclusions(plan),
      task.sourceCommit,
    );
    const effect = store.effects.get(`${prefix}:commit:${fingerprint}`) as {
      state: string;
      parent: string;
      commit?: string;
    } | null;
    const known = effect?.state === "confirmed" && effect.commit === head;
    const pending =
      effect?.state === "intent" &&
      effect.parent === task.sourceCommit &&
      (await io.git.headParent(task.worktree!)) === effect.parent &&
      (await io.git.headMessage(task.worktree!)) ===
        `feat: ${task.title}\n\nHarness-Task: ${task.id}\nHarness-Story: ${storyId}`;
    if (!known && !pending) throw new Error("story_head_changed");
  }
  const delivery = await createDelivery(store, io, validation, {
    plan,
    effectPrefix: prefix,
    commitMessage: `feat: ${task.title}\n\nHarness-Task: ${task.id}\nHarness-Story: ${storyId}`,
    reportName: `story-${plan.version}-${storyId}.md`,
  })({ ...task, deliveryMode: "local" }, signal);
  signal.throwIfAborted();
  const checkpoint = {
    featureId: task.id,
    storyId: storyId,
    planVersion: plan.version,
    planHash: io.artifacts.hash(JSON.stringify(plan)),
    baselineCommit: task.sourceCommit,
    commit: delivery.commit,
    checks: store.checks.get(task.id),
    review: store.reviews.get(task.id),
    reportPath: delivery.reportPath,
  };
  const path = await io.artifacts.checkpoint(
    task,
    `${plan.version}-${storyId}.json`,
    checkpoint,
  );
  signal.throwIfAborted();
  store.artifacts.put(prefix, {
    id: prefix,
    taskId: task.id,
    path,
    type: "checkpoint",
  });
  return {
    commit: delivery.commit,
    checkpointPath: path,
    checkpointArtifactId: prefix,
  };
}
