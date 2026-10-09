import { test, expect } from "vitest";
import { openStore } from "../../src/infrastructure/persistence/store";
import { createHttpHandler } from "../../src/bootstrap/http";
import { bootstrapSession } from "../../src/bootstrap/session";
import { taskFixture } from "../support/task-fixture";
test("local bootstrap, CSRF, hostile origins, stale commands and artifact traversal", async () => {
  const store = openStore(":memory:");
  try {
    const handle = createHttpHandler(store, "/tmp/harness-http", async () => [
      { id: "gpt-6-astra", efforts: ["high"], isDefault: false },
      { id: "gpt-6-luna", efforts: ["medium"], isDefault: true },
    ]);
    const base = "http://127.0.0.1:3100";
    const headers = {
      host: "127.0.0.1:3100",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
    };
    const boot = bootstrapSession(
      new Request(base + "/session", { headers }),
      store,
    );
    expect(boot.status).toBe(303);
    const cookie = boot.headers.get("set-cookie")!.split(";")[0];
    const session = await handle(
      new Request(base + "/api/session", {
        headers: { host: headers.host, cookie },
      }),
    );
    const { csrf } = await session.json();
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      extra = {},
    ) =>
      new Request(base + "/api/" + path, {
        method,
        headers: {
          host: headers.host,
          cookie,
          origin: base,
          "x-harness-csrf": csrf,
          "content-type": "application/json",
          ...extra,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    expect(
      (
        await handle(
          request("tasks", "POST", {}, { origin: "https://evil.test" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await handle(request("tasks", "GET", undefined, { host: "evil.test" })))
        .status,
    ).toBe(403);
    expect(
      (await handle(request("tasks", "GET", undefined, { cookie: "" }))).status,
    ).toBe(403);
    expect(
      (await handle(request("settings", "PUT", {}, { "x-harness-csrf": "" })))
        .status,
    ).toBe(403);
    store.putRecord("settings", "current", {
      skillRoots: { superpowers: "/old-machine/path" },
    });
    const initial = await (await handle(request("settings"))).json();
    expect(initial).not.toHaveProperty("skillRoots");
    expect(initial.models.plan).toEqual({
      model: "gpt-6-astra",
      effort: "high",
    });
    expect(initial.models.review).toEqual({
      model: "gpt-6-luna",
      effort: "medium",
    });
    const saved = await handle(
      request("settings", "PUT", {
        ...initial,
        models: {
          ...initial.models,
          plan: { model: "gpt-6-astra", effort: "low" },
          review: { model: "gpt-6-luna", effort: "high" },
        },
      }),
    );
    expect(saved.status).toBe(200);
    expect((await saved.json()).models).toEqual(initial.models);
    const unavailable = await handle(
      request("settings", "PUT", {
        ...initial,
        models: {
          ...initial.models,
          plan: { model: "gpt-6-luna", effort: "medium" },
        },
      }),
    );
    expect(unavailable.status).toBe(400);
    expect(await unavailable.json()).toEqual({
      error: "effort_unavailable: high",
    });
    const task = store.createTask(taskFixture());
    store.putRecord("attempt", "done-discover", {
      taskId: task.id,
      stage: "discover",
      status: "completed",
      output: null,
      nextStage: "analyze",
      nextStatus: "queued",
    });
    store.updateTask(
      task.id,
      task.revision,
      { stage: "analyze", status: "running" },
      { type: "stage.completed", data: {} },
    );
    const summary = await (await handle(request("tasks"))).json();
    expect(
      summary[0].pipeline.find(
        (n: import("../../src/domain/pipeline-progress").StageNode) =>
          n.stage === "discover",
      ).state,
    ).toBe("done");
    const detail = await (await handle(request(`tasks/${task.id}`))).json();
    expect(detail.pipeline).toEqual(summary[0].pipeline);
    expect(
      (
        await handle(
          request(`tasks/${task.id}/commands`, "POST", {
            id: "c",
            kind: "approve",
            expectedRevision: 99,
            payload: { version: 1 },
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (await handle(request("artifacts/%2e%2e%2fetc%2fpasswd"))).status,
    ).toBe(404);
    expect(
      bootstrapSession(
        new Request(base + "/session", {
          headers: { ...headers, "sec-fetch-site": "cross-site" },
        }),
        store,
      ).status,
    ).toBe(403);
    const settings = await (await handle(request("settings"))).text();
    expect(settings).not.toContain(csrf);
    expect(settings).not.toContain(cookie.split("=")[1]);
  } finally {
    store.close();
  }
});

test("OAuth endpoints require local session and CSRF before starting or cancelling login", async () => {
  const store = openStore(":memory:");
  let starts = 0,
    cancels = 0;
  const login = {
    status: async () => ({
      status: "signed_out" as const,
      authorizationUrl: null,
      error: null,
    }),
    start: async () => {
      starts++;
      return {
        status: "starting" as const,
        authorizationUrl: null,
        error: null,
      };
    },
    cancel: async () => {
      cancels++;
      return {
        status: "signed_out" as const,
        authorizationUrl: null,
        error: null,
      };
    },
  };
  try {
    const handle = createHttpHandler(
      store,
      "/tmp/harness-http",
      async () => [],
      login,
    );
    const base = "http://127.0.0.1:3100",
      host = "127.0.0.1:3100";
    const boot = bootstrapSession(
      new Request(base + "/session", {
        headers: {
          host,
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
        },
      }),
      store,
    );
    const cookie = boot.headers.get("set-cookie")!.split(";")[0];
    const session = await handle(
      new Request(base + "/api/session", { headers: { host, cookie } }),
    );
    const { csrf } = await session.json();
    const request = (path: string, method = "GET", extra = {}) =>
      new Request(base + "/api/" + path, {
        method,
        headers: {
          host,
          cookie,
          origin: base,
          "x-harness-csrf": csrf,
          ...extra,
        },
      });
    expect(
      (await handle(request("codex-auth", "POST", { "x-harness-csrf": "" })))
        .status,
    ).toBe(403);
    expect(
      (
        await handle(
          request("codex-auth", "POST", { origin: "https://evil.test" }),
        )
      ).status,
    ).toBe(403);
    expect(starts).toBe(0);
    expect((await (await handle(request("codex-auth"))).json()).status).toBe(
      "signed_out",
    );
    expect((await handle(request("codex-auth", "POST"))).status).toBe(200);
    expect(starts).toBe(1);
    expect(
      (
        await handle(
          request("codex-auth/cancel", "POST", { "x-harness-csrf": "" }),
        )
      ).status,
    ).toBe(403);
    expect(cancels).toBe(0);
    expect((await handle(request("codex-auth/cancel", "POST"))).status).toBe(
      200,
    );
    expect(cancels).toBe(1);
  } finally {
    store.close();
  }
});
