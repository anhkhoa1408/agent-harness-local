import { test, expect } from "vitest";
import { PassThrough } from "node:stream";
import { CodexClient, type AgentInput } from "../../src/codex/client";
import { JsonRpc } from "../../src/codex/rpc";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { durableSpawnEvidence } from "../../src/codex/spawn-evidence";

function fixture(
  options: {
    bad?: string;
    pending?: boolean;
    unconfirmed?: boolean;
    delayed?: boolean;
    rolloutPath?: string;
    pendingStart?: boolean;
    onStart?: () => void;
    completionRace?: boolean;
    nativeInteraction?: boolean;
  } = {},
) {
  const input = new PassThrough(),
    output = new PassThrough(),
    sent: any[] = [];
  let parentStatus = "inProgress",
    childStatus = options.pending ? "inProgress" : "completed";
  let resumeCount = 0;
  let settingsUpdated = false;
  let oldStatus = "completed";
  let accepted = !options.pendingStart,
    raced = false;
  const envelope = { stage: "analyze", attemptId: "a1", result: { ok: true } };
  const notify = (method: string, params: any) =>
    output.write(JSON.stringify({ method, params }) + "\n");
  const child = (id = "child") => ({
    id,
    parentThreadId: options.bad === "identity" ? "stranger" : "parent",
    status: { type: childStatus === "inProgress" ? "active" : "idle" },
    turns: [
      {
        id: "child-turn",
        status: childStatus,
        items: [
          {
            type: "agentMessage",
            phase: "final_answer",
            text: options.bad === "json" ? "invalid" : JSON.stringify(envelope),
          },
        ],
      },
    ],
  });
  input.on("data", (chunk) => {
    const m = JSON.parse(String(chunk));
    sent.push(m);
    if (!m.method || !m.id) return;
    if (options.bad === "preflight" && m.method === "thread/list") {
      output.write(
        JSON.stringify({
          id: m.id,
          error: { code: -32000, message: "cannot read runtime tree" },
        }) + "\n",
      );
      return;
    }
    if (m.method === "turn/start" && options.pendingStart) {
      options.onStart?.();
      setTimeout(() => {
        accepted = true;
        output.write(
          JSON.stringify({
            id: m.id,
            result: { turn: { id: "parent-turn" } },
          }) + "\n",
        );
      }, 15);
      return;
    }
    if (
      m.method === "thread/resume" &&
      m.params.threadId === "child" &&
      options.delayed &&
      resumeCount++ < 2
    ) {
      output.write(
        JSON.stringify({
          id: m.id,
          error: {
            code: -32000,
            message: "no rollout found for thread id child",
          },
        }) + "\n",
      );
      return;
    }
    let result: any = {};
    if (m.method === "thread/settings/update") settingsUpdated = true;
    if (m.method === "thread/start" || m.method === "thread/resume") {
      const isChild = m.params.threadId === "child";
      result = {
        thread: isChild
          ? child()
          : {
              id: "parent",
              path: options.rolloutPath,
              status: {
                type: options.bad === "active-parent" ? "active" : "idle",
              },
              turns:
                options.bad === "active-parent"
                  ? [{ id: "old-turn", status: "inProgress" }]
                  : [],
            },
        model: isChild && options.bad === "model" ? "wrong" : "gpt-6-luna",
        reasoningEffort:
          options.bad === "effort" && isChild ? "high" : "medium",
        cwd: "/fixture",
        approvalPolicy: "never",
        sandbox: {
          type:
            (isChild && options.bad === "sandbox") ||
            (!isChild && options.bad === "sticky-sandbox" && !settingsUpdated)
              ? "workspaceWrite"
              : "readOnly",
          networkAccess: false,
        },
      };
    }
    if (m.method === "thread/list")
      result = {
        data:
          options.bad === "reuse"
            ? [{ id: "old", parentThreadId: "parent" }]
            : [],
        nextCursor: null,
      };
    if (m.method === "thread/read")
      result = {
        thread:
          m.params.threadId === "parent"
            ? {
                id: "parent",
                turns: accepted
                  ? [{ id: "parent-turn", status: parentStatus, items: [] }]
                  : [],
              }
            : child(),
      };
    if (m.method === "thread/read" && m.params.threadId === "old")
      result = {
        thread: {
          id: "old",
          turns: [{ id: "old-turn", status: oldStatus, items: [] }],
        },
      };
    if (m.method === "turn/start") result = { turn: { id: "parent-turn" } };
    output.write(JSON.stringify({ id: m.id, result }) + "\n");
    if (
      m.method === "thread/read" &&
      m.params.threadId === "child" &&
      options.completionRace &&
      !raced
    ) {
      raced = true;
      childStatus = "completed";
      notify("turn/completed", {
        threadId: "child",
        turn: { id: "child-turn", status: "completed" },
      });
    }
    if (m.method === "turn/start")
      setTimeout(() => {
        notify("item/started", {
          threadId: "parent",
          turnId: "parent-turn",
          item: { type: "userMessage" },
        });
        if (options.bad !== "missing") {
          if (!options.rolloutPath)
            notify("rawResponseItem/completed", {
              threadId: "parent",
              turnId: "parent-turn",
              item: {
                type: "function_call",
                name: "spawn_agent",
                call_id: "spawn",
                arguments: JSON.stringify({
                  task_name: "analyze_a1",
                  fork_turns: options.bad === "context" ? "all" : "none",
                  model: "gpt-6-luna",
                  reasoning_effort: "medium",
                  message:
                    options.bad === "message"
                      ? "wrong stage or full history"
                      : options.bad === "no-message"
                        ? undefined
                        : "gAAAAABmock_ciphertext_from_native_runtime==",
                }),
              },
            });
          notify("item/completed", {
            threadId: "parent",
            turnId: "parent-turn",
            item: {
              id: "spawn",
              type: "subAgentActivity",
              kind: "started",
              agentThreadId: "child",
            },
          });
        }
        if (options.pending && !options.completionRace) return;
        if (options.bad === "reuse") {
          oldStatus = "inProgress";
          notify(
            options.nativeInteraction ? "item/completed" : "item/started",
            {
              threadId: "parent",
              item: options.nativeInteraction
                ? {
                    type: "subAgentActivity",
                    kind: "interacted",
                    agentThreadId: "old",
                  }
                : {
                    type: "collabAgentToolCall",
                    tool: "followupTask",
                    receiverThreadIds: ["old"],
                  },
            },
          );
        }
        if (options.bad === "extra")
          notify("item/completed", {
            threadId: "parent",
            item: {
              id: "spawn2",
              type: "subAgentActivity",
              kind: "started",
              agentThreadId: "extra",
            },
          });
        if (options.bad === "grandchild")
          notify("item/completed", {
            threadId: "child",
            item: {
              id: "spawn2",
              type: "subAgentActivity",
              kind: "started",
              agentThreadId: "extra",
            },
          });
        notify("item/completed", {
          threadId: "parent",
          turnId: "parent-turn",
          item: {
            type: "agentMessage",
            phase: "final_answer",
            text: JSON.stringify(
              options.bad === "mismatch"
                ? { ...envelope, result: { ok: false } }
                : envelope,
            ),
          },
        });
        parentStatus = "completed";
        notify("turn/completed", {
          threadId: "parent",
          turn: { id: "parent-turn", status: parentStatus },
        });
      }, 0);
    if (m.method === "turn/interrupt" && !options.unconfirmed)
      setTimeout(() => {
        if (m.params.threadId === "parent") parentStatus = "interrupted";
        else if (m.params.threadId === "old") oldStatus = "interrupted";
        else childStatus = "interrupted";
        notify("turn/completed", {
          threadId: m.params.threadId,
          turn: { id: m.params.turnId, status: "interrupted" },
        });
      }, 0);
  });
  const client = new CodexClient(new JsonRpc(output, input), {
    interruptTimeoutMs: 35,
  });
  const agentInput = {
    cwd: "/fixture",
    model: { model: "gpt-6-luna", effort: "medium" },
    instructions: "stage instructions",
    prompt: "input",
    outputSchema: { type: "object" },
    write: false,
    executionMode: "auto",
    delegation: {
      stage: "analyze",
      attemptId: "a1",
      packetPath: "/packets/a1.json",
    },
  } as AgentInput;
  return { client, agentInput, sent, notify };
}

test("native stage uses a persistent parent and verified clean-context child evidence", async () => {
  const f = fixture();
  try {
    const events: any[] = [];
    const run = await f.client.run(
      f.agentInput,
      (e) => events.push(e),
      new AbortController().signal,
    );
    expect(run.result).toEqual({ ok: true });
    expect(run).toMatchObject({
      threadId: "parent",
      child: {
        threadId: "child",
        turnId: "child-turn",
        model: f.agentInput.model,
      },
    });
    expect(events.some((e) => e.type === "child")).toBe(true);
    expect(
      f.sent.find((m) => m.method === "thread/start").params,
    ).toMatchObject({
      model: "gpt-6-luna",
      sandbox: "read-only",
      experimentalRawEvents: true,
      config: { "features.multi_agent_v2": true },
    });
    await f.client.run(
      { ...f.agentInput, threadId: "parent" },
      () => {},
      new AbortController().signal,
    );
    expect(f.sent.filter((m) => m.method === "thread/start")).toHaveLength(1);
    expect(
      f.sent.filter((m) => m.method === "turn/start")[0].params.input[0].text,
    ).toContain("/packets/a1.json");
    expect(
      f.sent.filter((m) => m.method === "turn/start")[0].params.input[0].text,
    ).not.toContain("stage instructions");
  } finally {
    await f.client.close();
  }
});

test.each([
  "missing",
  "mismatch",
  "identity",
  "model",
  "effort",
  "sandbox",
  "context",
  "json",
  "extra",
  "grandchild",
  "message",
  "no-message",
])("rejects unsafe or fabricated child evidence: %s", async (bad) => {
  const f = fixture({ bad });
  try {
    await expect(
      f.client.run(f.agentInput, () => {}, new AbortController().signal),
    ).rejects.toThrow();
  } finally {
    await f.client.close();
  }
});

test.each([false, true])(
  "cancel interrupts both parent and child; acknowledgement alone is insufficient (%s)",
  async (unconfirmed) => {
    const f = fixture({ pending: true, unconfirmed }),
      abort = new AbortController();
    try {
      const outcome = f.client.run(
        f.agentInput,
        (e) => {
          if (e.type === "child") abort.abort();
        },
        abort.signal,
      );
      await expect(outcome).rejects.toThrow(
        unconfirmed ? "runtime_state_unknown" : "interrupted",
      );
      expect(
        new Set(
          f.sent
            .filter((m) => m.method === "turn/interrupt")
            .map((m) => m.params.threadId),
        ),
      ).toEqual(new Set(["parent", "child"]));
    } finally {
      await f.client.close();
    }
  },
);

test("already cancelled input does not start a parent", async () => {
  const f = fixture(),
    abort = new AbortController();
  abort.abort();
  try {
    await expect(
      f.client.run(f.agentInput, () => {}, abort.signal),
    ).rejects.toThrow("interrupted");
    expect(f.sent).toHaveLength(0);
  } finally {
    await f.client.close();
  }
});

test.each([false, true])(
  "parent cannot reactivate a previous stage child; cancellation includes that writer (native=%s)",
  async (nativeInteraction) => {
    const f = fixture({ bad: "reuse", nativeInteraction });
    try {
      await expect(
        f.client.run(f.agentInput, () => {}, new AbortController().signal),
      ).rejects.toThrow("subagent_reuse_violation");
      expect(
        f.sent.some(
          (m) => m.method === "turn/interrupt" && m.params.threadId === "old",
        ),
      ).toBe(true);
    } finally {
      await f.client.close();
    }
  },
);

test("failure to inspect a resumed parent's tree retains unknown writer exclusion", async () => {
  const f = fixture({ bad: "preflight" });
  try {
    await expect(
      f.client.run(
        { ...f.agentInput, threadId: "parent" },
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow("runtime_state_unknown");
    expect(f.sent.some((m) => m.method === "turn/start")).toBe(false);
  } finally {
    await f.client.close();
  }
});

test("unreadable runtime rollout evidence rejects without unhandled stream errors", async () => {
  await expect(
    durableSpawnEvidence(
      "/private/tmp/harness-rollout-does-not-exist.jsonl",
      "turn",
      "spawn",
      20,
    ),
  ).rejects.toThrow();
});

test("cancellation waits for a pending turn/start before confirming the parent stopped", async () => {
  const abort = new AbortController();
  const f = fixture({
    pendingStart: true,
    onStart: () => setTimeout(() => abort.abort(), 0),
  });
  try {
    await expect(
      f.client.run(f.agentInput, () => {}, abort.signal),
    ).rejects.toThrow("interrupted");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      f.sent.some(
        (m) => m.method === "turn/interrupt" && m.params.threadId === "parent",
      ),
    ).toBe(true);
  } finally {
    await f.client.close();
  }
});

test("child completion while its status is being read cannot lose the verification wakeup", async () => {
  const f = fixture({ pending: true, completionRace: true });
  try {
    const run = await f.client.run(
      f.agentInput,
      () => {},
      new AbortController().signal,
    );
    expect(run.result).toEqual({ ok: true });
  } finally {
    await f.client.close();
  }
});

test("spawn event can precede durable child rollout creation", async () => {
  const f = fixture({ delayed: true });
  try {
    const run = await f.client.run(
      f.agentInput,
      () => {},
      new AbortController().signal,
    );
    expect(run.result).toEqual({ ok: true });
  } finally {
    await f.client.close();
  }
});

test("an existing active parent is excluded before another turn can start", async () => {
  const f = fixture({ bad: "active-parent" });
  try {
    await expect(
      f.client.run(
        { ...f.agentInput, threadId: "parent" },
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow("runtime_state_unknown");
    expect(f.sent.some((m) => m.method === "turn/start")).toBe(false);
  } finally {
    await f.client.close();
  }
});

test("loaded parent permissions are updated and verified before review can spawn", async () => {
  const f = fixture({ bad: "sticky-sandbox" });
  try {
    const run = await f.client.run(
      { ...f.agentInput, threadId: "parent" },
      () => {},
      new AbortController().signal,
    );
    expect(run.result).toEqual({ ok: true });
    expect(
      f.sent.find((m) => m.method === "thread/settings/update").params,
    ).toMatchObject({
      sandboxPolicy: { type: "readOnly", networkAccess: false },
      cwd: "/fixture",
    });
    expect(
      f.sent.findIndex((m) => m.method === "thread/settings/update"),
    ).toBeLessThan(f.sent.findIndex((m) => m.method === "turn/start"));
  } finally {
    await f.client.close();
  }
});

test("resumed local parent verifies native spawn from its durable rollout when raw streaming is absent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "harness-spawn-evidence-")),
    rolloutPath = join(dir, "rollout.jsonl");
  await writeFile(
    rolloutPath,
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "function_call",
        name: "spawn_agent",
        call_id: "spawn",
        internal_chat_message_metadata_passthrough: { turn_id: "parent-turn" },
        arguments: JSON.stringify({
          task_name: "analyze_a1",
          fork_turns: "none",
          model: "gpt-6-luna",
          reasoning_effort: "medium",
          message: "gAAAAABmock_ciphertext_from_native_runtime==",
        }),
      },
    }) + "\n",
  );
  const f = fixture({ rolloutPath });
  try {
    const run = await f.client.run(
      { ...f.agentInput, threadId: "parent" },
      () => {},
      new AbortController().signal,
    );
    expect(run.result).toEqual({ ok: true });
  } finally {
    await f.client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
