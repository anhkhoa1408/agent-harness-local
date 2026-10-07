import { test, expect } from "vitest";
import { openStore } from "../../src/storage/store";
import { createHttpHandler } from "../../src/server/http";
import { bootstrapSession } from "../../src/server/local-session";
import { taskFixture } from "../support/task-fixture";

test("notification feed only returns pending permissions for running manual tasks and requires a local session", async () => {
  const store = openStore(":memory:");
  try {
    const task = store.createTask(taskFixture({ executionMode: "manual" }));
    store.updateTask(
      task.id,
      task.revision,
      { status: "running" },
      { type: "started", data: {} },
    );
    const auto = store.createTask(taskFixture({ executionMode: "auto" }));
    store.updateTask(
      auto.id,
      auto.revision,
      { status: "running" },
      { type: "started", data: {} },
    );
    const cancelled = store.createTask(taskFixture());
    store.updateTask(
      cancelled.id,
      cancelled.revision,
      { status: "cancelled" },
      { type: "cancelled", data: {} },
    );
    for (const [id, taskId, decision] of [
      ["pending", task.id, null],
      ["accepted", task.id, "accept"],
      ["declined", task.id, "decline"],
      ["auto", auto.id, null],
      ["cancelled", cancelled.id, null],
      ["orphan", "missing", null],
    ])
      store.putRecord("approval", id!, {
        id,
        taskId,
        decision,
        params: { command: "secret command" },
      });
    const handle = createHttpHandler(
      store,
      "/tmp/harness-http",
      async () => [],
    );
    const base = "http://127.0.0.1:3100",
      host = "127.0.0.1:3100";
    const boot = bootstrapSession(
      new Request(`${base}/session`, {
        headers: {
          host,
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
        },
      }),
      store,
    );
    const cookie = boot.headers.get("set-cookie")!.split(";")[0];
    const request = (extra = {}) =>
      new Request(`${base}/api/approvals`, {
        headers: { host, cookie, ...extra },
      });
    const response = await handle(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: "pending", taskId: task.id, taskTitle: "Feature" },
    ]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await handle(request({ cookie: "" }))).status).toBe(403);
    expect(
      (await handle(request({ origin: "https://evil.test" }))).status,
    ).toBe(403);
    const staleDetail = await handle(
      new Request(`${base}/api/tasks/${cancelled.id}`, {
        headers: { host, cookie },
      }),
    );
    expect((await staleDetail.json()).approvals).toEqual([]);
    store.deleteRecord("approval", "pending");
    expect(await (await handle(request())).json()).toEqual([]);
  } finally {
    store.close();
  }
});
