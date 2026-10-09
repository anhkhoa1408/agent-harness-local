import { JsonRpc } from "./rpc";
import type { DelegatedStageInput, AgentEvent } from "./types";
import {
  parentInstructions,
  parentReceiptSchema,
  stageAssignment,
} from "../context/prompts";
import { listDescendantThreads, matchesAgentSettings } from "./protocol";
import {
  PARENT_AGENT_MODEL,
  AGENT_SETTINGS_SETTLE_TIMEOUT_MS,
  ROLLOUT_INITIAL_RETRY_DELAY_MS,
  ROLLOUT_MAX_RETRY_DELAY_MS,
} from "./limits";
export { PARENT_AGENT_MODEL } from "./limits";
export type ParentSessionContext = {
  threadId: string;
  response: import("./rpc").ThreadResponse;
  previous: Set<string>;
  assignment: ReturnType<typeof stageAssignment>;
  receiptSchema: Record<string, unknown>;
};
export class ParentAgentSession {
  constructor(private readonly rpc: JsonRpc) {}
  async ensureParentSession(
    input: DelegatedStageInput,
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<ParentSessionContext> {
    const rpc = this.rpc;
    if (signal.aborted) throw new Error("interrupted");
    const preflightRequest = (method: string, params: unknown) =>
      rpc.request(method, params).catch(() => {
        throw new Error("runtime_state_unknown");
      });
    let response = await preflightRequest(
      input.threadId ? "thread/resume" : "thread/start",
      {
        ...(input.threadId
          ? { threadId: input.threadId }
          : { experimentalRawEvents: true }),
        cwd: input.cwd,
        runtimeWorkspaceRoots: [input.cwd],
        model: PARENT_AGENT_MODEL.model,
        sandbox: input.write ? "workspace-write" : "read-only",
        approvalPolicy: input.executionMode === "auto" ? "never" : "on-request",
        developerInstructions: parentInstructions,
        config: {
          "features.multi_agent": true,
          "features.multi_agent_v2": true,
        },
      },
    );
    const threadId = response.thread.id as string;
    onEvent({ type: "parent", data: { threadId, model: PARENT_AGENT_MODEL } });
    if (
      response.thread.status?.type === "active" ||
      response.thread.turns?.some(
        (t: { status: string }) => t.status === "inProgress",
      )
    )
      throw new Error("runtime_state_unknown");
    const previous = new Set(
      (await listDescendantThreads(rpc, threadId)).map((t) => t.id),
    );
    for (const id of previous) {
      const read = await preflightRequest("thread/read", {
        threadId: id,
        includeTurns: true,
      });
      if (
        read.thread.turns.some(
          (t: { status: string }) => t.status === "inProgress",
        )
      )
        throw new Error("runtime_state_unknown");
    }
    if (signal.aborted) throw new Error("interrupted");
    if (input.threadId) {
      // Rejoining a loaded thread can retain its existing permissions despite resume overrides.
      await preflightRequest("thread/settings/update", {
        threadId,
        cwd: input.cwd,
        model: PARENT_AGENT_MODEL.model,
        effort: PARENT_AGENT_MODEL.effort,
        approvalPolicy: input.executionMode === "auto" ? "never" : "on-request",
        sandboxPolicy: input.write
          ? {
              type: "workspaceWrite",
              writableRoots: [input.cwd],
              networkAccess: false,
              excludeTmpdirEnvVar: false,
              excludeSlashTmp: false,
            }
          : { type: "readOnly", networkAccess: false },
      });
      // The settings acknowledgement can precede application to the loaded session.
      const deadline = Date.now() + AGENT_SETTINGS_SETTLE_TIMEOUT_MS;
      let delay = ROLLOUT_INITIAL_RETRY_DELAY_MS;
      for (;;) {
        if (signal.aborted) throw new Error("interrupted");
        response = await preflightRequest("thread/resume", {
          threadId,
          excludeTurns: true,
        });
        if (response.thread.status?.type === "active")
          throw new Error("runtime_state_unknown");
        if (
          matchesAgentSettings(response, input, false) ||
          Date.now() >= deadline
        )
          break;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(delay, deadline - Date.now())),
        );
        delay = Math.min(delay * 2, ROLLOUT_MAX_RETRY_DELAY_MS);
      }
    }
    if (!matchesAgentSettings(response, input, false))
      throw new Error("subagent_capability_unavailable");
    if (signal.aborted) throw new Error("interrupted");
    const assignment = stageAssignment(input),
      receiptSchema = parentReceiptSchema(input);
    return { threadId, response, previous, assignment, receiptSchema };
  }
}
