import { ApplicationErrorCode } from "../../application/constants/index";
import { CodexRpcMethod } from "./constants/codex-rpc-method";
import { ModelDefaults } from "../../domain/constants/model-defaults";
import { CodexLimits } from "./constants/codex-limits";
import { CodexErrorCode } from "./constants/codex-error-code";
import { isDeepStrictEqual } from "node:util";
import type { DelegatedStageInput, AgentEvent, AgentRun } from "./types";
import { JsonRpc, RpcRemoteError, type RpcMessage } from "./rpc";
import {
  requestThreadWhenRolloutReady,
  listDescendantThreads,
  matchesAgentSettings,
  verifyChildSpawn,
} from "./protocol";
import type { ParentSessionContext } from "./parent-session";

import { durableSpawnEvidence } from "./spawn-evidence";
type LiveThread = { turnId?: string; status?: string; usage?: unknown };
export class DelegatedStageAttempt {
  private readonly liveThreads: Map<string, LiveThread>;
  private readonly childAudits = new Map<
    string,
    Promise<import("./rpc").ThreadResponse>
  >();
  private readonly spawnCalls = new Map<string, unknown>();
  private parentReceiptText = "";
  private nativeChildId?: string;
  private finished = false;
  private stopping = false;
  private checking = false;
  private verificationRequested = false;
  private settleStart!: () => void;
  private startFailure: unknown;
  private readonly startSettled = new Promise<void>((resolve) => {
    this.settleStart = resolve;
  });
  private deadlineTimer?: ReturnType<typeof setTimeout>;
  private readonly interruptListenerCleanup: Array<() => void> = [];
  private unsubscribeMessages = () => {};
  private unsubscribeFailure = () => {};
  private resolveRun!: (run: AgentRun) => void;
  private rejectRun!: (error: Error) => void;
  constructor(
    private readonly rpc: JsonRpc,
    private readonly input: DelegatedStageInput,
    private readonly onEvent: (event: AgentEvent) => void,
    private readonly signal: AbortSignal,
    private readonly timeoutMs: number,
    private readonly parent: ParentSessionContext,
  ) {
    this.liveThreads = new Map([[parent.threadId, {}]]);
  }
  execute(): Promise<AgentRun> {
    return new Promise<AgentRun>((resolve, reject) => {
      this.resolveRun = resolve;
      this.rejectRun = reject;
      this.unsubscribeFailure = this.rpc.onFailure(() =>
        this.rejectAttempt(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN),
      );
      this.unsubscribeMessages = this.rpc.onMessage(this.handleRuntimeMessage);
      this.signal.addEventListener("abort", this.onAbort, { once: true });
      this.rpc
        .request(CodexRpcMethod.TURN_START, {
          threadId: this.parent.threadId,
          model: ModelDefaults.PARENT.model,
          effort: ModelDefaults.PARENT.effort,
          input: [
            { type: "text", text: JSON.stringify(this.parent.assignment) },
          ],
          outputSchema: this.parent.receiptSchema,
        })
        .then((r) => {
          this.settleStart();
          if (this.finished) return;
          this.liveThreads.set(this.parent.threadId, {
            ...this.liveThreads.get(this.parent.threadId),
            turnId: r.turn.id,
            status:
              this.liveThreads.get(this.parent.threadId)?.status ??
              "inProgress",
          });
          this.onEvent({
            type: "started",
            data: {
              threadId: this.parent.threadId,
              turnId: r.turn.id,
              model: ModelDefaults.PARENT,
            },
          });
          if (this.signal.aborted) this.onAbort();
        })
        .catch((error) => {
          this.startFailure = error;
          this.settleStart();
          if (error instanceof RpcRemoteError)
            this.stopForContractViolation(error.message);
          else this.rejectAttempt(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN);
        });
    });
  }
  private disposeListeners = () => {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.unsubscribeMessages();
    this.unsubscribeFailure();
    this.signal.removeEventListener("abort", this.onAbort);
  };
  private rejectAttempt = (reason: string) => {
    if (this.finished) return;
    this.finished = true;
    this.disposeListeners();
    this.rejectRun(new Error(reason));
  };
  private readThreadState = async (id: string) => {
    const read = await requestThreadWhenRolloutReady(
      this.rpc,
      CodexRpcMethod.THREAD_READ,
      { threadId: id, includeTurns: true },
      this.timeoutMs,
    );
    const turn = read.thread.turns.at(-1);
    if (turn)
      this.liveThreads.set(id, {
        ...this.liveThreads.get(id),
        turnId: turn.id,
        status: turn.status,
      });
    return read.thread;
  };
  private interruptAgentTreeAndConfirmStopped = async (reason: string) => {
    if (this.finished || this.stopping) return;
    this.stopping = true;
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = setTimeout(
      () => this.rejectAttempt(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN),
      this.timeoutMs,
    );
    try {
      // A pending start may create a writer after a read reported no active turn.
      await this.startSettled;
      if (this.startFailure && !(this.startFailure instanceof RpcRemoteError))
        throw new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN);
      // Reconcile after stopping the parent so a spawn in flight cannot escape cancellation.
      for (let sweep = 0; sweep < CodexLimits.AGENT_TREE_STOP_SWEEPS; sweep++) {
        for (const t of await listDescendantThreads(
          this.rpc,
          this.parent.threadId,
        ))
          if (!this.parent.previous.has(t.id)) {
            if (!this.liveThreads.has(t.id)) this.liveThreads.set(t.id, {});
          }
        await Promise.all(
          [...this.liveThreads.keys()].map(async (id) => {
            await this.readThreadState(id);
            const state = this.liveThreads.get(id)!;
            if (state.status !== "inProgress") return;
            const stopped = new Promise<void>((res, rej) => {
              const off = this.rpc.onMessage((m) => {
                if (
                  m.method === CodexRpcMethod.TURN_COMPLETED &&
                  m.params?.threadId === id &&
                  m.params?.turn?.id === state.turnId
                ) {
                  off();
                  res();
                }
              });
              this.rpc
                .request(CodexRpcMethod.TURN_INTERRUPT, {
                  threadId: id,
                  turnId: state.turnId,
                })
                .catch((e) => {
                  off();
                  rej(e);
                });
              // Listener lifetime is bounded by the cancellation deadline, even with a lost notification.
              const deadline = setTimeout(() => {
                off();
                rej(new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN));
              }, this.timeoutMs);
              this.interruptListenerCleanup.push(() => {
                off();
                clearTimeout(deadline);
              });
            });
            await stopped;
            await this.readThreadState(id);
            if (this.liveThreads.get(id)!.status === "inProgress")
              throw new Error(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN);
          }),
        );
      }
      this.rejectAttempt(reason);
    } catch {
      this.rejectAttempt(ApplicationErrorCode.RUNTIME_STATE_UNKNOWN);
    } finally {
      for (const f of this.interruptListenerCleanup) f();
    }
  };
  private onAbort = () => {
    void this.interruptAgentTreeAndConfirmStopped("interrupted");
  };
  private stopForContractViolation = (reason: string) => {
    void this.interruptAgentTreeAndConfirmStopped(reason);
  };
  private readVerifiedChildResult = async () => {
    if (this.checking) {
      this.verificationRequested = true;
      return;
    }
    if (
      this.stopping ||
      this.finished ||
      this.liveThreads.get(this.parent.threadId)?.status !== "completed"
    )
      return;
    this.checking = true;
    this.verificationRequested = false;
    try {
      if (!this.nativeChildId)
        throw new Error(ApplicationErrorCode.SUBAGENT_EVIDENCE_MISSING);
      const audit = await this.childAudits.get(this.nativeChildId);
      if (this.spawnCalls.size !== 1)
        throw new Error(ApplicationErrorCode.SUBAGENT_EVIDENCE_MISSING);
      if (
        !audit ||
        audit.thread.parentThreadId !== this.parent.threadId ||
        !matchesAgentSettings(audit, this.input, true)
      )
        throw new Error(CodexErrorCode.SUBAGENT_IDENTITY_OR_SETTINGS_MISMATCH);
      const child = await this.readThreadState(this.nativeChildId);
      const turn = child.turns.at(-1);
      if (turn?.status === "inProgress") {
        this.deadlineTimer ??= setTimeout(
          () => this.stopForContractViolation("subagent_incomplete"),
          this.timeoutMs,
        );
        return;
      }
      if (turn?.status !== "completed")
        throw new Error(CodexErrorCode.SUBAGENT_FAILED);
      const texts = turn.items.filter(
        (i: { type: string; phase?: string; text?: string }) =>
          i.type === "agentMessage" && i.phase !== "commentary",
      );
      const result = JSON.parse(texts.at(-1)?.text ?? "");
      const parentResult = JSON.parse(this.parentReceiptText);
      if (
        result.stage !== this.input.delegation!.stage ||
        result.attemptId !== this.input.delegation!.attemptId ||
        !isDeepStrictEqual(parentResult, {
          stage: result.stage,
          attemptId: result.attemptId,
        })
      )
        throw new Error(CodexErrorCode.SUBAGENT_OUTPUT_MISMATCH);
      const tree = (
        await listDescendantThreads(this.rpc, this.parent.threadId)
      ).filter((t) => !this.parent.previous.has(t.id));
      if (
        tree.some(
          (t) =>
            t.id !== this.nativeChildId ||
            t.parentThreadId !== this.parent.threadId,
        )
      )
        throw new Error(CodexErrorCode.SUBAGENT_LIMIT_EXCEEDED);
      if (this.stopping || this.finished || this.signal.aborted) {
        this.onAbort();
        return;
      }
      const run: AgentRun = {
        threadId: this.parent.threadId,
        turnId: this.liveThreads.get(this.parent.threadId)!.turnId!,
        result: result.result,
        usage: this.liveThreads.get(this.parent.threadId)?.usage ?? null,
        child: {
          threadId: this.nativeChildId,
          turnId: turn.id,
          model: this.input.model,
          usage: this.liveThreads.get(this.nativeChildId)?.usage ?? null,
        },
      };
      this.finished = true;
      this.disposeListeners();
      this.onEvent({ type: "completed", data: run });
      this.resolveRun(run);
    } catch (error) {
      this.stopForContractViolation(
        error instanceof SyntaxError
          ? CodexErrorCode.AGENT_INVALID_OUTPUT
          : (error as Error).message,
      );
    } finally {
      this.checking = false;
      // Completion can arrive while an older thread/read response is being audited.
      if (this.verificationRequested && !this.finished && !this.stopping)
        void this.readVerifiedChildResult();
    }
  };
  private handleRuntimeMessage = (m: RpcMessage) => {
    const p = m.params ?? {};
    const item = p.item;
    if (
      this.parent.previous.has(p.threadId) &&
      m.method === CodexRpcMethod.TURN_STARTED
    ) {
      this.liveThreads.set(p.threadId, {
        turnId: p.turn.id,
        status: "inProgress",
      });
      this.stopForContractViolation("subagent_reuse_violation");
      return;
    }
    if (!this.liveThreads.has(p.threadId)) return;
    if (
      p.threadId === this.parent.threadId &&
      m.method === CodexRpcMethod.ITEM_COMPLETED &&
      item?.type === "subAgentActivity" &&
      item.kind === "interacted" &&
      this.parent.previous.has(item.agentThreadId)
    ) {
      if (!this.liveThreads.has(item.agentThreadId))
        this.liveThreads.set(item.agentThreadId, {});
      this.stopForContractViolation("subagent_reuse_violation");
      return;
    }
    if (
      p.threadId === this.parent.threadId &&
      m.method === CodexRpcMethod.ITEM_STARTED &&
      item?.type === "collabAgentToolCall"
    ) {
      const old = (item.receiverThreadIds ?? []).filter((id: string) =>
        this.parent.previous.has(id),
      );
      if (old.length) {
        for (const id of old)
          if (!this.liveThreads.has(id)) this.liveThreads.set(id, {});
        this.stopForContractViolation("subagent_reuse_violation");
        return;
      }
    }
    if (m.id !== undefined) {
      this.onEvent({
        type: "approval",
        data: { requestId: m.id, method: m.method!, params: p },
      });
      return;
    }
    if (
      m.method === "rawResponseItem/completed" &&
      item?.type === "function_call" &&
      item.name === "spawn_agent"
    ) {
      if (p.threadId !== this.parent.threadId) {
        this.stopForContractViolation(CodexErrorCode.SUBAGENT_LIMIT_EXCEEDED);
        return;
      }
      try {
        const args = JSON.parse(item.arguments);
        this.spawnCalls.set(item.call_id, args);
        if (
          this.spawnCalls.size !== 1 ||
          !verifyChildSpawn(args, this.parent.assignment, this.input)
        )
          this.stopForContractViolation(
            CodexErrorCode.SUBAGENT_SPAWN_CONTRACT_VIOLATION,
          );
      } catch {
        this.stopForContractViolation(
          CodexErrorCode.SUBAGENT_SPAWN_CONTRACT_VIOLATION,
        );
      }
    }
    if (
      m.method === CodexRpcMethod.ITEM_COMPLETED &&
      item?.type === "subAgentActivity" &&
      item.kind === "started"
    ) {
      this.liveThreads.set(item.agentThreadId, {});
      if (
        p.threadId !== this.parent.threadId ||
        this.nativeChildId ||
        this.parent.previous.has(item.agentThreadId)
      ) {
        this.stopForContractViolation(CodexErrorCode.SUBAGENT_LIMIT_EXCEEDED);
        return;
      }
      this.nativeChildId = item.agentThreadId;
      const id = this.nativeChildId!;
      const audit = (async () => {
        if (!this.spawnCalls.has(item.id)) {
          const calls = await durableSpawnEvidence(
            this.parent.response.thread.path ?? null,
            p.turnId ?? this.liveThreads.get(this.parent.threadId)!.turnId!,
            item.id,
            this.timeoutMs,
          );
          for (const [callId, args] of calls) this.spawnCalls.set(callId, args);
        }
        const args = this.spawnCalls.get(item.id);
        if (
          this.spawnCalls.size !== 1 ||
          !verifyChildSpawn(args, this.parent.assignment, this.input)
        )
          throw new Error(CodexErrorCode.SUBAGENT_SPAWN_CONTRACT_VIOLATION);
        return requestThreadWhenRolloutReady(
          this.rpc,
          CodexRpcMethod.THREAD_RESUME,
          { threadId: id, excludeTurns: true },
          this.timeoutMs,
        );
      })();
      this.childAudits.set(id, audit);
      void audit
        .then((a) => {
          if (this.finished || this.stopping) return;
          if (
            a.thread.parentThreadId !== this.parent.threadId ||
            !matchesAgentSettings(a, this.input, true)
          ) {
            this.stopForContractViolation(
              CodexErrorCode.SUBAGENT_IDENTITY_OR_SETTINGS_MISMATCH,
            );
            return;
          }
          this.onEvent({
            type: "child",
            data: {
              threadId: id,
              parentThreadId: this.parent.threadId,
              model: this.input.model,
            },
          });
          void this.readVerifiedChildResult();
        })
        .catch(() =>
          this.stopForContractViolation(
            ApplicationErrorCode.RUNTIME_STATE_UNKNOWN,
          ),
        );
    }
    if (m.method === CodexRpcMethod.TURN_STARTED)
      this.liveThreads.set(p.threadId, {
        ...this.liveThreads.get(p.threadId),
        turnId: p.turn.id,
        status: "inProgress",
      });
    if (m.method === CodexRpcMethod.TURN_COMPLETED) {
      this.liveThreads.set(p.threadId, {
        ...this.liveThreads.get(p.threadId),
        turnId: p.turn.id,
        status: p.turn.status,
      });
      if (
        p.threadId === this.parent.threadId &&
        p.turn.status !== "completed" &&
        !this.stopping
      ) {
        this.stopForContractViolation(
          p.turn.status === "interrupted"
            ? "interrupted"
            : (p.turn.error?.message ?? "agent_failed"),
        );
        return;
      }
      void this.readVerifiedChildResult();
    }
    if (m.method === CodexRpcMethod.THREAD_TOKEN_USAGE_UPDATED)
      this.liveThreads.get(p.threadId)!.usage = p.tokenUsage;
    if (
      m.method === CodexRpcMethod.ITEM_COMPLETED &&
      item?.type === "agentMessage" &&
      p.threadId === this.parent.threadId &&
      item.phase !== "commentary"
    )
      this.parentReceiptText = item.text;
    if (m.method === CodexRpcMethod.ITEM_AGENT_MESSAGE_DELTA)
      this.onEvent({
        type: "message",
        data: { threadId: p.threadId, text: p.delta },
      });
    if (
      m.method === CodexRpcMethod.ITEM_STARTED &&
      p.threadId === this.parent.threadId &&
      ![
        "userMessage",
        "agentMessage",
        "reasoning",
        "subAgentActivity",
        "collabAgentToolCall",
        "contextCompaction",
      ].includes(item?.type)
    )
      this.stopForContractViolation(
        "parent_tool_violation: runtime_state_unknown",
      );
    if (
      m.method === CodexRpcMethod.ITEM_STARTED ||
      m.method === CodexRpcMethod.ITEM_COMPLETED
    )
      this.onEvent({ type: "tool", data: { method: m.method, ...p } });
  };
}
