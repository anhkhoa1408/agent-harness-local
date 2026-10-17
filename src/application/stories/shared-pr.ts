import { StoryRunState } from "../../domain/constants/story-run-state";
import { TaskStatus } from "../../domain/constants/task-status";
import { PipelineStage } from "../../domain/constants/pipeline-stage";
import { planKey, storyKey } from "../../domain/utils/record-key";
import { selectedStories } from "../../domain/stories";
import { evidenceExclusions } from "../../domain/evidence";
import { ApplicationErrorCode, EventType } from "../constants/index";
import type { Task } from "../../domain/contracts";
import type { ApplicationStore, StoryRepositoryPort } from "../ports";
import type { ValidationPort } from "../validation";
import type { RuntimePort } from "../runtime";
import type { StoryStatePort } from "./state";

export function assertEvidence(
  store: ApplicationStore,
  stories: StoryStatePort,
  task: Task,
) {
  const e = stories.getExecution(task.id);
  if (!e || e.selection.mode !== "shared_pr") return;
  const expected = {
    storyId: e.aggregate ? null : e.activeStoryId,
    planVersion: task.planVersion,
    baselineCommit: task.sourceCommit,
  };
  if (
    JSON.stringify(store.storyEvidence.get(task.id)) !==
    JSON.stringify(expected)
  )
    throw new Error(ApplicationErrorCode.STALE_STORY_EVIDENCE);
}

export function recordEvidence(
  store: ApplicationStore,
  stories: StoryStatePort,
  task: Task,
) {
  const e = stories.getExecution(task.id);
  if (e?.selection.mode === "shared_pr")
    store.storyEvidence.put(task.id, {
      storyId: e.aggregate ? null : e.activeStoryId,
      planVersion: task.planVersion,
      baselineCommit: task.sourceCommit,
    });
}

export function completeSharedStory(
  store: ApplicationStore,
  stories: StoryStatePort,
  validation: ValidationPort,
  runtime: RuntimePort,
  task: Task,
  checkpoint: {
    commit: string;
    checkpointPath: string;
    checkpointArtifactId?: string;
  },
) {
  const e = stories.getExecution(task.id)!;
  const run = stories
    .listStoryRuns(task.id)
    .find((r) => r.storyId === e.activeStoryId)!;
  return store.atomic(() => {
    store.storyRuns.put(storyKey(run), {
      ...run,
      state: StoryRunState.COMPLETED,
      ...checkpoint,
      updatedAt: runtime.now(),
    });
    const plan = validation.plan(
      store.plans.get(planKey(task.id, task.planVersion)),
    );
    const next = selectedStories(plan, e.selection).find(
      (s) =>
        !stories
          .listStoryRuns(task.id)
          .some(
            (r) => r.storyId === s.id && r.state === StoryRunState.COMPLETED,
          ),
    );
    store.storyExecutions.put(task.id, {
      ...e,
      activeStoryId: next?.id ?? null,
      baselineCommit: checkpoint.commit,
      aggregate: !next,
    });
    store.checks.delete(task.id);
    store.reviews.delete(task.id);
    store.acceptance.delete(task.id);
    store.storyEvidence.delete(task.id);
    store.events.add(task.id, EventType.STORY_CHECKPOINT, {
      storyId: run.storyId,
      ...checkpoint,
    });
    const result = {
      stage: next ? PipelineStage.PREPARE : PipelineStage.VERIFY,
      status: e.selection.continueAutomatically
        ? TaskStatus.QUEUED
        : TaskStatus.PAUSED,
      reason: e.selection.continueAutomatically ? null : "story_checkpoint",
      output: checkpoint,
    };
    const current = store.tasks.get(task.id);
    store.tasks.update(
      task.id,
      current.revision,
      {
        stage: result.stage,
        status: result.status,
        reason: result.reason,
        resumeStage: null,
      },
      {
        type: EventType.STORY_ADVANCED,
        data: { storyId: next?.id ?? null, aggregate: !next },
      },
    );
    return result;
  });
}

export async function assertSharedHead(
  store: ApplicationStore,
  stories: StoryStatePort,
  repository: StoryRepositoryPort,
  task: Task,
  delivery = false,
) {
  const e = stories.getExecution(task.id);
  if (e?.selection.mode !== "shared_pr" || !task.worktree) return;
  const head = await repository.head(task.worktree);
  if (head === e.baselineCommit) return;
  if (delivery && e.aggregate) {
    const plan = stories.getExecutionPlan(task);
    const fingerprint = await repository.fingerprintWorktree(
      task.worktree,
      evidenceExclusions(plan),
      task.sourceCommit,
    );
    const effect = store.effects.get(`${task.id}:commit:${fingerprint}`) as {
      state: string;
      parent: string;
      commit?: string;
    } | null;
    if (effect?.state === "confirmed" && effect.commit === head) return;
    if (
      effect?.state === "intent" &&
      effect.parent === e.baselineCommit &&
      (await repository.headParent(task.worktree)) === effect.parent &&
      (await repository.headMessage(task.worktree)) ===
        `feat: ${task.title}\n\nHarness-Task: ${task.id}`
    )
      return;
  }
  throw new Error(ApplicationErrorCode.STORY_HEAD_CHANGED);
}
