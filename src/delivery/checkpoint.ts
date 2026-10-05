import { gitText } from "../repositories/inspect";
import { fingerprintWorktree } from "../repositories/fingerprint";
import { evidenceExclusions } from "../execution/ui-verification";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Store } from "../storage/store";
import type { Task } from "../core/contracts";
import { contentHash } from "../context/rules";
import { createDelivery } from "./github";
import {
  executionOf,
  executionPlan,
  requireStoryEvidence,
} from "../worker/stories";

export type StoryCheckpoint = {
  commit: string;
  checkpointPath: string;
  checkpointArtifactId: string;
};
export async function createStoryCheckpoint(
  store: Store,
  data: string,
  task: Task,
  signal: AbortSignal,
): Promise<StoryCheckpoint> {
  requireStoryEvidence(store, task);
  const e = executionOf(store, task.id);
  if (e?.selection.mode !== "shared_pr" || e.aggregate || !e.activeStoryId)
    throw new Error("story_checkpoint_unavailable");
  const plan = executionPlan(store, task),
    prefix = `${task.id}:story:${plan.version}:${e.activeStoryId}`;
  const head = await gitText(task.worktree!, ["rev-parse", "HEAD"]);
  if (head !== task.sourceCommit) {
    const fingerprint = await fingerprintWorktree(
      task.worktree!,
      evidenceExclusions(plan),
      task.sourceCommit,
    );
    const effect = store.getRecord(
      "effect",
      `${prefix}:commit:${fingerprint}`,
    ) as { state: string; parent: string; commit?: string } | null;
    const known = effect?.state === "confirmed" && effect.commit === head;
    const pending =
      effect?.state === "intent" &&
      effect.parent === task.sourceCommit &&
      (await gitText(task.worktree!, ["rev-parse", "HEAD^"])) ===
        effect.parent &&
      (await gitText(task.worktree!, ["show", "-s", "--format=%B", "HEAD"])) ===
        `feat: ${task.title}\n\nHarness-Task: ${task.id}\nHarness-Story: ${e.activeStoryId}`;
    if (!known && !pending) throw new Error("story_head_changed");
  }
  const delivery = await createDelivery(store, data, {
    plan,
    effectPrefix: prefix,
    commitMessage: `feat: ${task.title}\n\nHarness-Task: ${task.id}\nHarness-Story: ${e.activeStoryId}`,
    reportName: `story-${plan.version}-${e.activeStoryId}.md`,
  })({ ...task, deliveryMode: "local" }, signal);
  signal.throwIfAborted();
  const dir = join(data, "artifacts", task.id, "checkpoints");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${plan.version}-${e.activeStoryId}.json`),
    temp = `${path}.${randomUUID()}.tmp`;
  const checkpoint = {
    featureId: task.id,
    storyId: e.activeStoryId,
    planVersion: plan.version,
    planHash: contentHash(JSON.stringify(plan)),
    baselineCommit: task.sourceCommit,
    commit: delivery.commit,
    checks: store.getRecord("checks", task.id),
    review: store.getRecord("review", task.id),
    reportPath: delivery.reportPath,
  };
  await writeFile(temp, JSON.stringify(checkpoint, null, 2), { mode: 0o600 });
  await rename(temp, path);
  signal.throwIfAborted();
  store.putRecord("artifact", prefix, {
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
