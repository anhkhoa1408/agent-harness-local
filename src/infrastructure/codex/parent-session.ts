import { ApplicationErrorCode } from "../../application/constants/index";
import { CodexRpcMethod } from "./constants/codex-rpc-method";
import { ModelDefaults } from "../../domain/constants/model-defaults";
import { CodexLimits } from "./constants/codex-limits";
import { CodexErrorCode } from "./constants/codex-error-code";
import { JsonRpc } from "./rpc";
import type { DelegatedStageInput, AgentEvent } from "./types";
import {
  parentInstructions,
  parentReceiptSchema,
  stageAssignment,
} from "../context/prompts";
import { listDescendantThreads, matchesAgentSettings } from "./protocol";

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
        throw new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN);
      });
    let response = await preflightRequest(
      input.threadId
        ? CodexRpcMethod.THREAD_RESUME
        : CodexRpcMethod.THREAD_START,
      {
        ...(input.threadId
          ? { threadId: input.threadId }
          : { experimentalRawEvents: true }),
        cwd: input.cwd,
        runtimeWorkspaceRoots: [input.cwd],
        model: ModelDefaults.PARENT.model,
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
    onEvent({
      type: "parent",
      data: { threadId, model: ModelDefaults.PARENT },
    });
    if (
      response.thread.status?.type === "active" ||
      response.thread.turns?.some(
        (t: { status: string }) => t.status === "inProgress",
      )
    )
      throw new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN);
    const previous = new Set(
      (await listDescendantThreads(rpc, threadId)).map((t) => t.id),
    );
    for (const id of previous) {
      const read = await preflightRequest(CodexRpcMethod.THREAD_READ, {
        threadId: id,
        includeTurns: true,
      });
      if (
        read.thread.turns.some(
          (t: { status: string }) => t.status === "inProgress",
        )
      )
        throw new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN);
    }
    if (signal.aborted) throw new Error("interrupted");
    if (input.threadId) {
      // Rejoining a loaded thread can retain its existing permissions despite resume overrides.
      await preflightRequest(CodexRpcMethod.THREAD_SETTINGS_UPDATE, {
        threadId,
        cwd: input.cwd,
        model: ModelDefaults.PARENT.model,
        effort: ModelDefaults.PARENT.effort,
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
      const deadline =
        Date.now() + CodexLimits.AGENT_SETTINGS_SETTLE_TIMEOUT_MS;
      let delay = CodexLimits.ROLLOUT_INITIAL_RETRY_DELAY_MS;
      for (;;) {
        if (signal.aborted) throw new Error("interrupted");
        response = await preflightRequest(CodexRpcMethod.THREAD_RESUME, {
          threadId,
          excludeTurns: true,
        });
        if (response.thread.status?.type === "active")
          throw new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN);
        if (
          matchesAgentSettings(response, input, false) ||
          Date.now() >= deadline
        )
          break;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(delay, deadline - Date.now())),
        );
        delay = Math.min(delay * 2, CodexLimits.ROLLOUT_MAX_RETRY_DELAY_MS);
      }
    }
    if (!matchesAgentSettings(response, input, false))
      throw new Error(CodexErrorCode.SUBAGENT_CAPABILITY_UNAVAILABLE);
    if (signal.aborted) throw new Error("interrupted");
    const assignment = stageAssignment(input),
      receiptSchema = parentReceiptSchema(input);
    return { threadId, response, previous, assignment, receiptSchema };
  }
}
