import type { DelegatedStageInput } from "./types";
import { JsonRpc, RpcRemoteError } from "./rpc";
import {
  ROLLOUT_INITIAL_RETRY_DELAY_MS,
  ROLLOUT_MAX_RETRY_DELAY_MS,
  RUNTIME_PAGE_SIZE,
} from "./limits";
import { PARENT_AGENT_MODEL } from "./limits";
export async function requestThreadWhenRolloutReady(
  rpc: JsonRpc,
  method: string,
  params: unknown,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  let delay = ROLLOUT_INITIAL_RETRY_DELAY_MS;
  for (;;) {
    try {
      return await rpc.request(method, params);
    } catch (error) {
      // Native spawn announces the ID before its rollout/turn reader is ready.
      if (
        !(error instanceof RpcRemoteError) ||
        !(
          error.message.startsWith("no rollout found for thread id") ||
          error.message === "list_turns is not supported yet" ||
          /^failed to read thread: thread-store internal error: failed to read session metadata .+: rollout at .+ is empty$/.test(
            error.message,
          )
        ) ||
        Date.now() >= deadline
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(delay, deadline - Date.now())),
      );
      delay = Math.min(delay * 2, ROLLOUT_MAX_RETRY_DELAY_MS);
    }
  }
}
export async function listDescendantThreads(
  rpc: JsonRpc,
  threadId: string,
): Promise<any[]> {
  const data: any[] = [],
    seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: { data: any[]; nextCursor?: string | null } = await rpc
      .request("thread/list", {
        ancestorThreadId: threadId,
        sourceKinds: ["subAgent", "subAgentThreadSpawn"],
        limit: RUNTIME_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      })
      .catch(() => {
        throw new Error("runtime_state_unknown");
      });
    data.push(...page.data);
    cursor = page.nextCursor ?? null;
    if (cursor && seen.has(cursor)) throw new Error("runtime_state_unknown");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return data;
}
export function matchesAgentSettings(
  response: any,
  input: DelegatedStageInput,
  child: boolean,
) {
  const choice = child ? input.model : PARENT_AGENT_MODEL;
  return (
    response.model === choice.model &&
    (!child || response.reasoningEffort === choice.effort) &&
    response.cwd === input.cwd &&
    response.approvalPolicy ===
      (input.executionMode === "auto" ? "never" : "on-request") &&
    response.sandbox?.type === (input.write ? "workspaceWrite" : "readOnly") &&
    response.sandbox.networkAccess === false
  );
}
export function verifyChildSpawn(
  args: any,
  assignment: ReturnType<typeof import("../context/prompts").stageAssignment>,
  input: DelegatedStageInput,
) {
  return (
    args?.task_name === assignment.task_name &&
    args.fork_turns === "none" &&
    args.model === input.model.model &&
    args.reasoning_effort === input.model.effort &&
    // This native runtime encrypts message in both raw events and rollout evidence.
    // Plaintext can be compared exactly; encrypted contents cannot be audited here.
    typeof args.message === "string" &&
    (args.message === assignment.message ||
      /^gAAAA[A-Za-z0-9_-]+=*$/.test(args.message))
  );
}
