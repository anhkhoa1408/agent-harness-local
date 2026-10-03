import { test, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import { JsonRpc } from "../../src/codex/rpc";
import { CodexClient } from "../../src/codex/client";
function fixture() {
  const input = new PassThrough(),
    output = new PassThrough();
  const sent: any[] = [];
  input.on("data", (chunk) =>
    sent.push(
      ...String(chunk)
        .trim()
        .split("\n")
        .map((x) => JSON.parse(x)),
    ),
  );
  return { rpc: new JsonRpc(output, input), sent, output, input };
}
test("lost turn-start response retains unknown writer exclusion", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    client = new CodexClient(f.rpc);
  try {
    f.input.on("data", (chunk) => {
      const m = JSON.parse(String(chunk));
      if (m.method === "thread/start")
        f.output.write(
          JSON.stringify({ id: m.id, result: { thread: { id: "t" } } }) + "\n",
        );
    });
    const result = client
      .run(
        {
          cwd: "/fixture",
          model: { model: "medium", effort: "medium" },
          instructions: "",
          prompt: "write",
          outputSchema: { type: "object" },
          write: true,
        },
        () => {},
        new AbortController().signal,
      )
      .then(
        () => "unexpected_success",
        (e) => e.message,
      );
    await vi.advanceTimersByTimeAsync(30001);
    expect(await result).toBe("runtime_state_unknown");
  } finally {
    await client.close();
    vi.useRealTimers();
  }
});
test("correlates out-of-order fragmented replies and separates server approvals", async () => {
  const f = fixture();
  const requests: any[] = [];
  f.rpc.onMessage((m) => requests.push(m));
  const one = f.rpc.request("first", {}),
    two = f.rpc.request("second", {});
  f.output.write('{"id":2,"result":"two"}\n{"id":');
  f.output.write(
    '1,"result":"one"}\n{"id":42,"method":"approval","params":{}}\n',
  );
  expect(await one).toBe("one");
  expect(await two).toBe("two");
  expect(requests[0].method).toBe("approval");
  f.rpc.respond(42, { decision: "decline" });
  expect(f.sent.at(-1)).toEqual({ id: 42, result: { decision: "decline" } });
  f.rpc.close();
});
test("EOF rejects pending calls rather than waiting forever", async () => {
  const f = fixture();
  const promise = f.rpc.request("never", {});
  f.output.end();
  await expect(promise).rejects.toThrow("runtime_disconnected");
  f.rpc.close();
});
test("loads every catalog page and passes explicit model and effort to turns", async () => {
  const f = fixture();
  const client = new CodexClient(f.rpc);
  f.input.on("data", (chunk) => {
    const m = JSON.parse(String(chunk));
    if (!m.id) return;
    let result: any = {};
    if (m.method === "model/list")
      result = m.params.cursor
        ? {
            data: [
              {
                model: "medium",
                supportedReasoningEfforts: [{ reasoningEffort: "medium" }],
                isDefault: true,
              },
            ],
            nextCursor: null,
          }
        : {
            data: [
              {
                model: "strong",
                supportedReasoningEfforts: [{ reasoningEffort: "high" }],
                isDefault: false,
              },
            ],
            nextCursor: "page2",
          };
    if (m.method === "thread/start") result = { thread: { id: "thread-1" } };
    if (m.method === "turn/start") result = { turn: { id: "turn-1" } };
    f.output.write(JSON.stringify({ id: m.id, result }) + "\n");
    if (m.method === "turn/start")
      setTimeout(() => {
        f.output.write(
          JSON.stringify({
            method: "item/completed",
            params: {
              threadId: "thread-1",
              turnId: "turn-1",
              item: { type: "agentMessage", text: '{"ok":true}' },
            },
          }) + "\n",
        );
        f.output.write(
          JSON.stringify({
            method: "turn/completed",
            params: {
              threadId: "thread-1",
              turn: { id: "turn-1", status: "completed", error: null },
            },
          }) + "\n",
        );
      }, 5);
  });
  await client.initialize();
  expect((await client.models()).map((m) => m.id)).toEqual([
    "strong",
    "medium",
  ]);
  const result = await client.run(
    {
      cwd: "/fixture",
      model: { model: "strong", effort: "high" },
      instructions: "read only",
      prompt: "inspect",
      outputSchema: { type: "object" },
      write: false,
    },
    () => {},
    new AbortController().signal,
  );
  expect(result.result).toEqual({ ok: true });
  expect(f.sent.find((m) => m.method === "turn/start").params).toMatchObject({
    model: "strong",
    effort: "high",
  });
  await client.close();
});
test("an interrupt acknowledgement is not mistaken for a stopped turn", async () => {
  const f = fixture();
  const client = new CodexClient(f.rpc, { interruptTimeoutMs: 15 });
  const abort = new AbortController();
  f.input.on("data", (chunk) => {
    const m = JSON.parse(String(chunk));
    if (!m.id) return;
    f.output.write(
      JSON.stringify({
        id: m.id,
        result:
          m.method === "thread/start"
            ? { thread: { id: "t" } }
            : m.method === "turn/start"
              ? { turn: { id: "u" } }
              : {},
      }) + "\n",
    );
    if (m.method === "turn/start") setTimeout(() => abort.abort(), 2);
  });
  await client.initialize();
  await expect(
    client.run(
      {
        cwd: "/fixture",
        model: { model: "medium", effort: "medium" },
        instructions: "",
        prompt: "work",
        outputSchema: { type: "object" },
        write: true,
      },
      () => {},
      abort.signal,
    ),
  ).rejects.toThrow("runtime_state_unknown");
  await client.close();
});
