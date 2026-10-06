import { JsonRpc } from "./rpc";
import type { DelegatedStageInput, AgentEvent, AgentRun } from "./types";
import { ParentAgentSession } from "./parent-session";
import { DelegatedStageAttempt } from "./delegated-attempt";
export async function executeDelegatedStage(
  rpc: JsonRpc,
  input: DelegatedStageInput,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<AgentRun> {
  const parent = await new ParentAgentSession(rpc).ensureParentSession(
    input,
    onEvent,
    signal,
  );
  return new DelegatedStageAttempt(
    rpc,
    input,
    onEvent,
    signal,
    timeoutMs,
    parent,
  ).execute();
}
