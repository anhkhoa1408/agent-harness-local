import type { Task, Stage, Status } from "../../domain/contracts";
export type StageResult = {
  stage: Stage;
  status: Status;
  reason: string | null;
  output: unknown;
};
export type StageHandler = (
  task: Task,
  signal: AbortSignal,
) => Promise<StageResult>;
export type Handlers = Record<Stage, StageHandler>;
export type Attempt = {
  id: string;
  taskId: string;
  storyId?: string | null;
  planVersion?: number | null;
  baselineCommit?: string;
  stage: Stage;
  leaseEpoch: number;
  status: "running" | "completed" | "interrupted" | "failed";
  output: unknown;
  nextStage?: Stage;
  nextStatus?: Status;
  model: Task["models"][keyof Task["models"]] | null;
  bundleHash: string | null;
  threadId: string | null;
  turnId: string | null;
  fingerprint: string | null;
};
export type ActiveStageAttempt = {
  taskId: string;
  abort: AbortController;
  promise: Promise<void>;
  stop: "paused" | "cancelled" | null;
};
