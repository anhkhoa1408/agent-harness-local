import { test, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../../src/storage/store";
import { createHttpHandler } from "../../src/server/http";
import { bootstrapSession } from "../../src/server/local-session";

test("screenshot artifact serves PNG bytes through authenticated local endpoint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "screenshot-http-")),
    store = openStore(":memory:");
  try {
    const folder = join(dir, "artifacts");
    await mkdir(folder);
    const path = join(folder, "shot.png"),
      bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
        "base64",
      );
    await writeFile(path, bytes);
    store.putRecord("artifact", "shot", { path, type: "screenshot" });
    const base = "http://127.0.0.1:3100";
    const boot = bootstrapSession(
      new Request(base + "/session", {
        headers: {
          host: "127.0.0.1:3100",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
        },
      }),
      store,
    );
    const cookie = boot.headers.get("set-cookie")!.split(";")[0];
    const handle = createHttpHandler(store, dir, async () => []);
    const response = await handle(
      new Request(base + "/api/artifacts/shot", {
        headers: { host: "127.0.0.1:3100", cookie },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(
      (
        await handle(
          new Request(base + "/api/artifacts/shot", {
            headers: { host: "127.0.0.1:3100" },
          }),
        )
      ).status,
    ).toBe(403);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
