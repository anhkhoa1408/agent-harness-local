import { isDeepStrictEqual } from "node:util";
import type { AgentInput, AgentEvent, AgentRun } from "./client";
import { JsonRpc, RpcRemoteError } from "./rpc";
import {
  parentInstructions,
  stageEnvelope,
  stageAssignment,
} from "../context/prompts";
import { durableSpawnEvidence } from "./spawn-evidence";

export const parentModel = { model: "gpt-6-luna", effort: "medium" };
type LiveThread = { turnId?: string; status?: string; usage?: unknown };

async function childRequest(
  rpc: JsonRpc,
  method: string,
  params: unknown,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  let delay = 5;
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
          /^failed to read thread: thread-store internal error: failed to read session metadata .+: rollout at .+ is empty$/.test(error.message)
        ) ||
        Date.now() >= deadline
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(delay, deadline - Date.now())),
      );
      delay = Math.min(delay * 2, 200);
    }
  }
}

async function descendants(rpc: JsonRpc, threadId: string): Promise<any[]> {
  const data: any[] = [],
    seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: { data: any[]; nextCursor?: string | null } = await rpc
      .request("thread/list", {
        ancestorThreadId: threadId,
        sourceKinds: ["subAgent", "subAgentThreadSpawn"],
        limit: 100,
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

function settingsMatch(response: any, input: AgentInput, child: boolean) {
  const choice = child ? input.model : parentModel;
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

export async function runSubagentStage(
  rpc: JsonRpc,
  input: AgentInput,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<AgentRun> {
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
      model: parentModel.model,
      sandbox: input.write ? "workspace-write" : "read-only",
      approvalPolicy: input.executionMode === "auto" ? "never" : "on-request",
      developerInstructions: parentInstructions,
      config: { "features.multi_agent": true, "features.multi_agent_v2": true },
    },
  );
  const threadId = response.thread.id as string;
  onEvent({ type: "parent", data: { threadId, model: parentModel } });
  if (
    response.thread.status?.type === "active" ||
    response.thread.turns?.some((t: any) => t.status === "inProgress")
  )
    throw new Error("runtime_state_unknown");
  const previous = new Set((await descendants(rpc, threadId)).map((t) => t.id));
  for (const id of previous) {
    const read = await preflightRequest("thread/read", {
      threadId: id,
      includeTurns: true,
    });
    if (read.thread.turns.some((t: any) => t.status === "inProgress"))
      throw new Error("runtime_state_unknown");
  }
  if (signal.aborted) throw new Error("interrupted");
  if (input.threadId) {
    // Rejoining a loaded thread can retain its existing permissions despite resume overrides.
    await preflightRequest("thread/settings/update", {
      threadId,
      cwd: input.cwd,
      model: parentModel.model,
      effort: parentModel.effort,
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
    response = await preflightRequest("thread/resume", {
      threadId,
      excludeTurns: true,
    });
  }
  if (!settingsMatch(response, input, false))
    throw new Error("subagent_capability_unavailable");
  if (signal.aborted) throw new Error("interrupted");
  const assignment = stageAssignment(input),
    envelope = stageEnvelope(input);
  const validSpawn = (args: any) =>
    args?.task_name === assignment.task_name &&
    args.fork_turns === "none" &&
    args.model === input.model.model &&
    args.reasoning_effort === input.model.effort &&
    // This native runtime encrypts message in both raw events and rollout evidence.
    // Plaintext can be compared exactly; encrypted contents cannot be audited here.
    typeof args.message === "string" &&
    (args.message === assignment.message ||
      /^gAAAA[A-Za-z0-9_-]+=*$/.test(args.message));
  return new Promise<AgentRun>((resolve, reject) => {
    const live = new Map<string, LiveThread>([[threadId, {}]]),
      audits = new Map<string, Promise<any>>();
    const spawnCalls = new Map<string, any>();
    let parentText = "",
      childId: string | undefined,
      finished = false,
      stopping = false,
      checking = false,
      verifyRequested = false;
    let settleStart!: () => void, startFailure: unknown;
    const startSettled = new Promise<void>((res) => {
      settleStart = res;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      offMessage();
      offFailure();
      signal.removeEventListener("abort", abort);
    };
    const fail = (reason: string) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(reason));
    };
    const observe = async (id: string) => {
      const read = await childRequest(
        rpc,
        "thread/read",
        { threadId: id, includeTurns: true },
        timeoutMs,
      );
      const turn = read.thread.turns.at(-1);
      if (turn)
        live.set(id, { ...live.get(id), turnId: turn.id, status: turn.status });
      return read.thread;
    };
    const stop = async (reason: string) => {
      if (finished || stopping) return;
      stopping = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fail("runtime_state_unknown"), timeoutMs);
      try {
        // A pending start may create a writer after a read reported no active turn.
        await startSettled;
        if (startFailure && !(startFailure instanceof RpcRemoteError))
          throw new Error("runtime_state_unknown");
        // Reconcile after stopping the parent so a spawn in flight cannot escape cancellation.
        for (let sweep = 0; sweep < 2; sweep++) {
          for (const t of await descendants(rpc, threadId))
            if (!previous.has(t.id)) {
              if (!live.has(t.id)) live.set(t.id, {});
            }
          await Promise.all(
            [...live.keys()].map(async (id) => {
              await observe(id);
              const state = live.get(id)!;
              if (state.status !== "inProgress") return;
              const stopped = new Promise<void>((res, rej) => {
                const off = rpc.onMessage((m) => {
                  if (
                    m.method === "turn/completed" &&
                    m.params?.threadId === id &&
                    m.params?.turn?.id === state.turnId
                  ) {
                    off();
                    res();
                  }
                });
                rpc
                  .request("turn/interrupt", {
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
                  rej(new Error("runtime_state_unknown"));
                }, timeoutMs);
                stoppedCleanup.push(() => {
                  off();
                  clearTimeout(deadline);
                });
              });
              await stopped;
              await observe(id);
              if (live.get(id)!.status === "inProgress")
                throw new Error("runtime_state_unknown");
            }),
          );
        }
        fail(reason);
      } catch {
        fail("runtime_state_unknown");
      } finally {
        for (const f of stoppedCleanup) f();
      }
    };
    const stoppedCleanup: Array<() => void> = [];
    const abort = () => {
      void stop("interrupted");
    };
    const unsafe = (reason: string) => {
      void stop(reason);
    };
    const verify = async () => {
      if (checking) {
        verifyRequested = true;
        return;
      }
      if (stopping || finished || live.get(threadId)?.status !== "completed")
        return;
      checking = true;
      verifyRequested = false;
      try {
        if (!childId) throw new Error("subagent_evidence_missing");
        const audit = await audits.get(childId);
        if (spawnCalls.size !== 1) throw new Error("subagent_evidence_missing");
        if (
          !audit ||
          audit.thread.parentThreadId !== threadId ||
          !settingsMatch(audit, input, true)
        )
          throw new Error("subagent_identity_or_settings_mismatch");
        const child = await observe(childId),
          turn = child.turns.at(-1);
        if (turn?.status === "inProgress") {
          timer ??= setTimeout(() => unsafe("subagent_incomplete"), timeoutMs);
          return;
        }
        if (turn?.status !== "completed") throw new Error("subagent_failed");
        const texts = turn.items.filter(
          (i: any) => i.type === "agentMessage" && i.phase !== "commentary",
        );
        const result = JSON.parse(texts.at(-1)?.text ?? ""),
          parentResult = JSON.parse(parentText);
        if (
          result.stage !== input.delegation!.stage ||
          result.attemptId !== input.delegation!.attemptId ||
          !isDeepStrictEqual(result, parentResult)
        )
          throw new Error("subagent_output_mismatch");
        const tree = (await descendants(rpc, threadId)).filter(
          (t) => !previous.has(t.id),
        );
        if (tree.some((t) => t.id !== childId || t.parentThreadId !== threadId))
          throw new Error("subagent_limit_exceeded");
        if (stopping || finished || signal.aborted) {
          abort();
          return;
        }
        const run: AgentRun = {
          threadId,
          turnId: live.get(threadId)!.turnId!,
          result: result.result,
          usage: live.get(threadId)?.usage ?? null,
          child: {
            threadId: childId,
            turnId: turn.id,
            model: input.model,
            usage: live.get(childId)?.usage ?? null,
          },
        };
        finished = true;
        cleanup();
        onEvent({ type: "completed", data: run });
        resolve(run);
      } catch (error) {
        unsafe(
          error instanceof SyntaxError
            ? "agent_invalid_output"
            : (error as Error).message,
        );
      } finally {
        checking = false;
        // Completion can arrive while an older thread/read response is being audited.
        if (verifyRequested && !finished && !stopping) void verify();
      }
    };
    const offFailure = rpc.onFailure(() => fail("runtime_state_unknown"));
    const offMessage = rpc.onMessage((m) => {
      const p = m.params ?? {},
        item = p.item;
      if (previous.has(p.threadId) && m.method === "turn/started") {
        live.set(p.threadId, { turnId: p.turn.id, status: "inProgress" });
        unsafe("subagent_reuse_violation");
        return;
      }
      if (!live.has(p.threadId)) return;
      if (
        p.threadId === threadId &&
        m.method === "item/completed" &&
        item?.type === "subAgentActivity" &&
        item.kind === "interacted" &&
        previous.has(item.agentThreadId)
      ) {
        if (!live.has(item.agentThreadId)) live.set(item.agentThreadId, {});
        unsafe("subagent_reuse_violation");
        return;
      }
      if (
        p.threadId === threadId &&
        m.method === "item/started" &&
        item?.type === "collabAgentToolCall"
      ) {
        const old = (item.receiverThreadIds ?? []).filter((id: string) =>
          previous.has(id),
        );
        if (old.length) {
          for (const id of old) if (!live.has(id)) live.set(id, {});
          unsafe("subagent_reuse_violation");
          return;
        }
      }
      if (m.id !== undefined) {
        onEvent({
          type: "approval",
          data: { requestId: m.id, method: m.method, params: p },
        });
        return;
      }
      if (
        m.method === "rawResponseItem/completed" &&
        item?.type === "function_call" &&
        item.name === "spawn_agent"
      ) {
        if (p.threadId !== threadId) {
          unsafe("subagent_limit_exceeded");
          return;
        }
        try {
          const args = JSON.parse(item.arguments);
          spawnCalls.set(item.call_id, args);
          if (spawnCalls.size !== 1 || !validSpawn(args))
            unsafe("subagent_spawn_contract_violation");
        } catch {
          unsafe("subagent_spawn_contract_violation");
        }
      }
      if (
        m.method === "item/completed" &&
        item?.type === "subAgentActivity" &&
        item.kind === "started"
      ) {
        live.set(item.agentThreadId, {});
        if (
          p.threadId !== threadId ||
          childId ||
          previous.has(item.agentThreadId)
        ) {
          unsafe("subagent_limit_exceeded");
          return;
        }
        childId = item.agentThreadId;
        const id = childId!;
        const audit = (async () => {
          if (!spawnCalls.has(item.id)) {
            const calls = await durableSpawnEvidence(
              response.thread.path ?? null,
              p.turnId ?? live.get(threadId)!.turnId!,
              item.id,
              timeoutMs,
            );
            for (const [callId, args] of calls) spawnCalls.set(callId, args);
          }
          const args = spawnCalls.get(item.id);
          if (spawnCalls.size !== 1 || !validSpawn(args))
            throw new Error("subagent_spawn_contract_violation");
          return childRequest(
            rpc,
            "thread/resume",
            { threadId: id, excludeTurns: true },
            timeoutMs,
          );
        })();
        audits.set(id, audit);
        void audit
          .then((a) => {
            if (finished || stopping) return;
            if (
              a.thread.parentThreadId !== threadId ||
              !settingsMatch(a, input, true)
            ) {
              unsafe("subagent_identity_or_settings_mismatch");
              return;
            }
            onEvent({
              type: "child",
              data: {
                threadId: id,
                parentThreadId: threadId,
                model: input.model,
              },
            });
            void verify();
          })
          .catch(() => unsafe("runtime_state_unknown"));
      }
      if (m.method === "turn/started")
        live.set(p.threadId, {
          ...live.get(p.threadId),
          turnId: p.turn.id,
          status: "inProgress",
        });
      if (m.method === "turn/completed") {
        live.set(p.threadId, {
          ...live.get(p.threadId),
          turnId: p.turn.id,
          status: p.turn.status,
        });
        if (
          p.threadId === threadId &&
          p.turn.status !== "completed" &&
          !stopping
        ) {
          unsafe(
            p.turn.status === "interrupted" ? "interrupted" : "agent_failed",
          );
          return;
        }
        void verify();
      }
      if (m.method === "thread/tokenUsage/updated")
        live.get(p.threadId)!.usage = p.tokenUsage;
      if (
        m.method === "item/completed" &&
        item?.type === "agentMessage" &&
        p.threadId === threadId &&
        item.phase !== "commentary"
      )
        parentText = item.text;
      if (m.method === "item/agentMessage/delta")
        onEvent({
          type: "message",
          data: { threadId: p.threadId, text: p.delta },
        });
      if (
        m.method === "item/started" &&
        p.threadId === threadId &&
        ![
          "userMessage",
          "agentMessage",
          "reasoning",
          "subAgentActivity",
          "collabAgentToolCall",
          "contextCompaction",
        ].includes(item?.type)
      )
        unsafe("parent_tool_violation: runtime_state_unknown");
      if (m.method === "item/started" || m.method === "item/completed")
        onEvent({ type: "tool", data: { method: m.method, ...p } });
    });
    signal.addEventListener("abort", abort, { once: true });
    rpc
      .request("turn/start", {
        threadId,
        model: parentModel.model,
        effort: parentModel.effort,
        input: [{ type: "text", text: JSON.stringify(assignment) }],
        outputSchema: envelope,
      })
      .then((r) => {
        settleStart();
        if (finished) return;
        live.set(threadId, {
          ...live.get(threadId),
          turnId: r.turn.id,
          status: live.get(threadId)?.status ?? "inProgress",
        });
        onEvent({
          type: "started",
          data: { threadId, turnId: r.turn.id, model: parentModel },
        });
        if (signal.aborted) abort();
      })
      .catch((error) => {
        startFailure = error;
        settleStart();
        if (error instanceof RpcRemoteError) unsafe(error.message);
        else fail("runtime_state_unknown");
      });
  });
}
