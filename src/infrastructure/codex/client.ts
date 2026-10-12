import { ExecutionMode } from "../../domain/constants/execution-mode";
import { CodexPermissions } from "./constants/codex-permissions";
import { CodexRpcMethod } from "./constants/codex-rpc-method";
import { CodexLimits } from "./constants/codex-limits";
import { CodexErrorCode } from "./constants/codex-error-code";
import { ApplicationErrorCode } from "../../application/constants/index";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { ModelInfo } from "../../domain/model-policy";
import { JsonRpc, RpcRemoteError } from "./rpc";
import { executeDelegatedStage } from "./subagents";
import type {
  AgentClient,
  DirectTurnInput,
  DelegatedStageInput,
  AgentEvent,
  AgentRun,
} from "./types";
export type { AgentClient, AgentInput, AgentEvent, AgentRun } from "./types";

export class CodexClient implements AgentClient {
  constructor(
    private rpc: JsonRpc,
    private options: {
      interruptTimeoutMs?: number;
      process?: ChildProcessWithoutNullStreams;
    } = {},
  ) {}
  async initialize() {
    await this.rpc.request("initialize", {
      clientInfo: { name: "agent-harness", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.rpc.notify("initialized");
  }
  async listModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const page: {
        data: Array<{
          model?: string;
          id: string;
          supportedReasoningEfforts?: { reasoningEffort: string }[];
          isDefault?: boolean;
        }>;
        nextCursor?: string | null;
      } = await this.rpc.request<{
        data: Array<{
          model?: string;
          id: string;
          supportedReasoningEfforts?: { reasoningEffort: string }[];
          isDefault?: boolean;
        }>;
        nextCursor?: string | null;
      }>(CodexRpcMethod.MODEL_LIST, {
        limit: CodexLimits.RUNTIME_PAGE_SIZE,
        includeHidden: false,
        ...(cursor ? { cursor } : {}),
      });
      for (const m of page.data ?? [])
        models.push({
          id: m.model ?? m.id,
          efforts: (m.supportedReasoningEfforts ?? []).map(
            (e: { reasoningEffort: string }) => e.reasoningEffort,
          ),
          isDefault: !!m.isDefault,
        });
      cursor = page.nextCursor ?? null;
      if (cursor && seen.has(cursor))
        throw new Error(CodexErrorCode.RUNTIME_CATALOG_CYCLE);
      if (cursor) seen.add(cursor);
    } while (cursor);
    return models;
  }
  async runDelegatedStage(
    input: DelegatedStageInput,
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<AgentRun> {
    return executeDelegatedStage(
      this.rpc,
      input,
      onEvent,
      signal,
      this.options.interruptTimeoutMs ?? CodexLimits.AGENT_INTERRUPT_TIMEOUT_MS,
    );
  }
  async runDirectTurn(
    input: DirectTurnInput,
    onEvent: (e: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<AgentRun> {
    if (signal.aborted) throw new Error("interrupted");
    const thread = await this.rpc.request(
      input.threadId
        ? CodexRpcMethod.THREAD_RESUME
        : CodexRpcMethod.THREAD_START,
      {
        ...(input.threadId ? { threadId: input.threadId } : {}),
        cwd: input.cwd,
        model: input.model.model,
        sandbox: input.write
          ? CodexPermissions.SANDBOX_WORKSPACE_WRITE
          : CodexPermissions.SANDBOX_READ_ONLY,
        approvalPolicy:
          input.executionMode === ExecutionMode.AUTO
            ? CodexPermissions.APPROVAL_NEVER
            : CodexPermissions.APPROVAL_ON_REQUEST,
        developerInstructions: input.instructions,
      },
    );
    const threadId = thread.thread.id as string;
    return new Promise<AgentRun>((resolve, reject) => {
      let turnId = "";
      let lastText = "";
      let usage: unknown = null;
      let finished = false;
      let interrupting = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        offMessage();
        offFailure();
        signal.removeEventListener("abort", abort);
      };
      const fail = (error: Error) => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(error);
      };
      const abort = () => {
        if (!turnId || interrupting || finished) return;
        interrupting = true;
        timer = setTimeout(
          () => fail(new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN)),
          this.options.interruptTimeoutMs ??
            CodexLimits.AGENT_INTERRUPT_TIMEOUT_MS,
        );
        this.interruptTurn(threadId, turnId).catch(() =>
          fail(new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN)),
        );
      };
      const offFailure = this.rpc.onFailure(() =>
        fail(new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN)),
      );
      const offMessage = this.rpc.onMessage((m) => {
        const p = m.params ?? {};
        if (p.threadId !== threadId) return;
        if (m.id !== undefined) {
          onEvent({
            type: "approval",
            data: { requestId: m.id, method: m.method!, params: p },
          });
          return;
        }
        if (m.method === CodexRpcMethod.THREAD_TOKEN_USAGE_UPDATED)
          usage = p.tokenUsage;
        if (
          m.method === CodexRpcMethod.ITEM_COMPLETED &&
          p.item?.type === "agentMessage"
        )
          lastText = p.item.text;
        if (m.method === CodexRpcMethod.ITEM_AGENT_MESSAGE_DELTA)
          onEvent({ type: "message", data: { text: p.delta } });
        if (
          m.method === CodexRpcMethod.ITEM_STARTED ||
          m.method === CodexRpcMethod.ITEM_COMPLETED
        )
          onEvent({ type: "tool", data: { method: m.method, ...p } });
        if (m.method === CodexRpcMethod.TURN_COMPLETED) {
          const id = p.turn?.id ?? p.turnId;
          if (turnId && id !== turnId) return;
          turnId = id;
          if (p.turn?.status === "interrupted") {
            fail(new Error("interrupted"));
            return;
          }
          if (p.turn?.status !== "completed") {
            fail(new Error(p.turn?.error?.message ?? "agent_failed"));
            return;
          }
          try {
            const result = JSON.parse(lastText);
            finished = true;
            cleanup();
            onEvent({ type: "completed", data: { threadId, turnId } });
            resolve({ threadId, turnId, result, usage });
          } catch {
            fail(new Error(CodexErrorCode.AGENT_INVALID_OUTPUT));
          }
        }
      });
      signal.addEventListener("abort", abort, { once: true });
      this.rpc
        .request(CodexRpcMethod.TURN_START, {
          threadId,
          model: input.model.model,
          effort: input.model.effort,
          input: [{ type: "text", text: input.prompt }],
          outputSchema: input.outputSchema,
        })
        .then((response) => {
          turnId = response.turn.id;
          onEvent({ type: "started", data: { threadId, turnId } });
          if (signal.aborted) abort();
        })
        .catch((error) =>
          fail(
            error instanceof RpcRemoteError
              ? error
              : new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN),
          ),
        );
    });
  }
  async respondToApproval(id: string | number, result: unknown) {
    this.rpc.respond(id, result);
  }
  async interruptTurn(threadId: string, turnId: string) {
    await this.rpc.request(CodexRpcMethod.TURN_INTERRUPT, { threadId, turnId });
  }
  async close() {
    this.rpc.close();
    this.options.process?.kill("SIGTERM");
  }
}
export async function connectCodex(
  binary = process.env.CODEX_BIN ?? "codex",
): Promise<CodexClient> {
  const child = spawn(binary, ["app-server", "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });
  const rpc = new JsonRpc(child.stdout, child.stdin);
  child.on("error", () =>
    rpc.fail(new Error(ApplicationErrorCode.CODEX_UNAVAILABLE)),
  );
  // Drain stderr without exposing credential-bearing runtime diagnostics to browser logs.
  child.stderr.on("data", () => {});
  const client = new CodexClient(rpc, { process: child });
  try {
    await client.initialize();
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}
