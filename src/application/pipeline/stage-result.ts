import { TaskStatus } from "../../domain/constants/task-status";
import type { Task } from "../../domain/contracts";
export const queuedStageResult = (
  stage: Task["stage"],
  output: unknown = null,
) => ({ stage, status: TaskStatus.QUEUED, reason: null, output });
