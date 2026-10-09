import type { Task } from "../../domain/contracts";
export const queuedStageResult = (
  stage: Task["stage"],
  output: unknown = null,
) => ({ stage, status: "queued" as const, reason: null, output });
