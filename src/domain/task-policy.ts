import type { Task, NewTask } from "./contracts";
export const BRANCH_SLUG_CHARACTERS = 40;
export const BRANCH_ID_PREFIX_CHARACTERS = 8;
export function initializeTask(input: NewTask, id: string, now: number): Task {
  return {
    ...input,
    id,
    stage: "discover",
    status: "queued",
    reason: null,
    revision: 0,
    planVersion: null,
    approvedPlanVersion: null,
    repairCount: 0,
    worktree: null,
    branch: `codex/${id.slice(0, BRANCH_ID_PREFIX_CHARACTERS)}-${
      input.title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, BRANCH_SLUG_CHARACTERS) || "task"
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
    throw new Error("immutable_field");
}
