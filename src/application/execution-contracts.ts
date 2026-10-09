import type { ModelChoice, Stage } from "../domain/contracts";

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
export interface AgentExecutionPort {
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
}
export type ContextFile = {
  id: string;
  path: string;
  sha256: string;
  content: string;
};
export type Bundle = {
  stage: Stage;
  files: ContextFile[];
  adaptations: string;
  optionalFiles?: ContextFile[];
  hash: string;
};
export interface OutputCodec<T> {
  parse(value: unknown): T;
  jsonSchema(): Record<string, unknown>;
}
export type MutationResult = {
  summary: string;
  needsReplan: boolean;
  reason: string | null;
};
export type PlanOutput = Omit<import("../domain/contracts").Plan, "stories"> & {
  stories: import("../domain/contracts").Story[] | null;
};
