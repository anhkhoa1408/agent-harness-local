import { test, expect } from "vitest";
import { openStore } from "../../src/storage/store";
import { createHttpHandler } from "../../src/server/http";
import { bootstrapSession } from "../../src/server/local-session";

test("folder picker requires a local session and CSRF; returns selection, cancellation and safe errors", async () => {
  const store = openStore(":memory:");
  let result: string | null = "/tmp/my repo",
    error = "",
    launches = 0;
  const handle = createHttpHandler(
    store,
    "/tmp/harness-http",
    async () => [],
    undefined,
    async () => {
      launches++;
      if (error) throw new Error(error);
      return result;
    },
  );
  try {
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
    const { csrf } = await (
      await handle(
        new Request(base + "/api/session", { headers: { host, cookie } }),
      )
    ).json();
    const request = (method = "POST", extra = {}) =>
      new Request(base + "/api/repositories/pick-folder", {
        method,
        headers: {
          host,
          cookie,
          origin: base,
          "x-harness-csrf": csrf,
          ...extra,
        },
      });
    for (const extra of [
      { cookie: "" },
      { "x-harness-csrf": "" },
      { origin: "https://evil.test" },
    ]) {
      expect((await handle(request("POST", extra))).status).toBe(403);
    }
    expect((await handle(request("GET"))).status).toBe(404);
    expect(launches).toBe(0);
    expect(await (await handle(request())).json()).toEqual({
      path: "/tmp/my repo",
    });
    result = null;
    expect(await (await handle(request())).json()).toEqual({ path: null });
    expect(store.listRecords("repository")).toEqual([]);
    for (const [code, status] of [
      ["folder_picker_busy", 409],
      ["folder_picker_unsupported", 501],
      ["folder_picker_failed", 503],
    ] as const) {
      error = code;
      const response = await handle(request());
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: code });
    }
  } finally {
    store.close();
  }
});
