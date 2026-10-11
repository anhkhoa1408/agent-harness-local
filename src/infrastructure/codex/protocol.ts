import { waitForRetry } from "./utils/retry-delay";
import { CodexLimits } from "./constants/codex-limits";
import { CodexRpcMethod } from "./constants/codex-rpc-method";
import { ApplicationErrorCode } from "../../application/constants/index";
import { ModelDefaults } from "../../domain/constants/model-defaults";
import type { DelegatedStageInput } from "./types";
import { JsonRpc, RpcRemoteError } from "./rpc";

export async function requestThreadWhenRolloutReady(
  rpc: JsonRpc,
  method: string,
  params: unknown,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  let delay = CodexLimits.ROLLOUT_INITIAL_RETRY_DELAY_MS;
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
      delay = await waitForRetry(delay, deadline);
    }
  }
}
export async function listDescendantThreads(
  rpc: JsonRpc,
  threadId: string,
): Promise<import("./rpc").RuntimeThread[]> {
  const data: import("./rpc").RuntimeThread[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: {
      data: import("./rpc").RuntimeThread[];
      nextCursor?: string | null;
    } = await rpc
      .request<{
        data: import("./rpc").RuntimeThread[];
        nextCursor?: string | null;
      }>(CodexRpcMethod.THREAD_LIST, {
        ancestorThreadId: threadId,
        sourceKinds: ["subAgent", "subAgentThreadSpawn"],
        limit: CodexLimits.RUNTIME_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      })
      .catch(() => {
        throw new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN);
      });
    data.push(...page.data);
    cursor = page.nextCursor ?? null;
    if (cursor && seen.has(cursor))
      throw new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN);
    if (cursor) seen.add(cursor);
  } while (cursor);
  return data;
}
export function matchesAgentSettings(
  response: import("./rpc").ThreadResponse,
  input: DelegatedStageInput,
  child: boolean,
) {
  const choice = child ? input.model : ModelDefaults.PARENT;
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
  args: unknown,
  assignment: ReturnType<typeof import("../context/prompts").stageAssignment>,
  input: DelegatedStageInput,
) {
  if (!args || typeof args !== "object") return false;
  const spawn = args as Record<string, unknown>;
  return (
    spawn.task_name === assignment.task_name &&
    spawn.fork_turns === "none" &&
    spawn.model === input.model.model &&
    spawn.reasoning_effort === input.model.effort &&
    // This native runtime encrypts message in both raw events and rollout evidence.
    // Plaintext can be compared exactly; encrypted contents cannot be audited here.
    typeof spawn.message === "string" &&
    (spawn.message === assignment.message ||
      /^gAAAA[A-Za-z0-9_-]+=*$/.test(spawn.message))
  );
}
