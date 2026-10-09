import type { ModelChoice, Stage } from "../core/contracts";
import type { ModelInfo } from "../core/model-policy";

export type DirectTurnInput = {
  cwd: string;
  model: ModelChoice;
  instructions: string;
  prompt: string;
  outputSchema: Record<string, unknown>;
  write: boolean;
  executionMode?: "manual" | "auto";
  threadId?: string;
  delegation?: never;
};
export type DelegatedStageInput = Omit<DirectTurnInput, "delegation"> & {
  delegation: { stage: Stage; attemptId: string; packetPath: string };
};
export type AgentInput = DirectTurnInput | DelegatedStageInput;
export type NativeChildResult = {
  threadId: string;
  turnId: string;
  model: ModelChoice;
  usage: unknown;
};
export type AgentRun = {
  threadId: string;
  turnId: string;
  result: unknown;
  usage: unknown;
  child?: NativeChildResult;
};
export type AgentEvent =
  | { type: "parent"; data: { threadId: string; model?: ModelChoice } }
  | {
      type: "child";
      data: { threadId: string; parentThreadId: string; model: ModelChoice };
    }
  | {
      type: "started";
      data: { threadId: string; turnId: string; model?: ModelChoice };
    }
  | { type: "message"; data: { text: string; threadId?: string } }
  | { type: "tool"; data: { method: string; [key: string]: unknown } }
  | {
      type: "approval";
      data: { requestId: string | number; method: string; params: unknown };
    }
  | {
      type: "completed";
      data: Pick<AgentRun, "threadId" | "turnId"> & Partial<AgentRun>;
    }
  | { type: "error"; data: { message: string } };
export interface AgentClient {
  listModels(): Promise<ModelInfo[]>;
  runDirectTurn(
    input: DirectTurnInput,
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<AgentRun>;
  runDelegatedStage(
    input: DelegatedStageInput,
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<AgentRun>;
  respondToApproval(id: string | number, result: unknown): Promise<void>;
  interruptTurn(threadId: string, turnId: string): Promise<void>;
  close(): Promise<void>;
}
