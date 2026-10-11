import { PipelineStage } from "./constants/pipeline-stage";
import { TaskStatus } from "./constants/task-status";
import { TaskLimits } from "./constants/task-limits";
import { DomainErrorCode } from "./constants/domain-error-code";
import type { Task, NewTask } from "./contracts";
export function initializeTask(input: NewTask, id: string, now: number): Task {
  return {
    ...input,
    id,
    stage: PipelineStage.DISCOVER,
    status: TaskStatus.QUEUED,
    reason: null,
    revision: 0,
    planVersion: null,
    approvedPlanVersion: null,
    repairCount: 0,
    worktree: null,
    branch: `codex/${id.slice(0, TaskLimits.BRANCH_ID_PREFIX_CHARACTERS)}-${
      input.title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, TaskLimits.BRANCH_SLUG_CHARACTERS) || "task"
    }`,
    resumeStage: null,
    createdAt: now,
    updatedAt: now,
  };
}
export function assertMutableTaskPatch(patch: Partial<Task>) {
  if (
    patch.featureId !== undefined ||
    patch.storyId !== undefined ||
    patch.id !== undefined ||
    patch.revision !== undefined ||
    patch.createdAt !== undefined
  )
    throw new Error(DomainErrorCode.IMMUTABLE_FIELD);
}
