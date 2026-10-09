import { test, expect, vi } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

const launcher = resolve("scripts/dev.mjs");

test.each([undefined, "0.0.0.0", "docker-oauth"])(
  "launcher starts dashboard and worker with host %s and stops both",
  async (requestedHost) => {
    const proxy = requestedHost === "docker-oauth";
    const host = proxy ? "0.0.0.0" : requestedHost;
    const root = await mkdtemp(join(tmpdir(), "harness-launcher-"));
    let child: ReturnType<typeof spawn> | undefined;
    try {
      for (const dir of [
        "node_modules/next/dist/bin",
        "node_modules/tsx",
        "src/bootstrap",
        "scripts",
      ])
        await mkdir(join(root, dir), { recursive: true });
      await writeFile(
        join(root, "node_modules/tsx/package.json"),
        JSON.stringify({ type: "module", exports: "./index.mjs" }),
      );
      await writeFile(join(root, "node_modules/tsx/index.mjs"), "");
      const stub = (name: string) => `
        const fs = require('node:fs');
        fs.writeFileSync('${name}.json', JSON.stringify(process.argv.slice(2)));
        process.on('SIGTERM', () => { fs.writeFileSync('${name}.stopped', 'yes'); process.exit(0); });
        setInterval(() => {}, 1000);
      `;
      await writeFile(
        join(root, "node_modules/next/dist/bin/next"),
        stub("dashboard"),
      );
      await writeFile(
        join(root, "src/bootstrap/worker-main.ts"),
        stub("worker"),
      );
      await writeFile(join(root, "scripts/oauth-proxy.ts"), stub("callback"));
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        HARNESS_TEST_MODE: "0",
        HARNESS_PRODUCTION: "1",
        PORT: "3000",
        HARNESS_OAUTH_PROXY: proxy ? "1" : "0",
        PATH: `${join(root, "bin")}:${process.env.PATH}`,
      };
      delete env.HARNESS_HOST;
      if (host) env.HARNESS_HOST = host;
      child = spawn(process.execPath, [launcher], {
        cwd: root,
        env,
        stdio: "pipe",
      });
      await vi.waitFor(
        async () => {
          const args = JSON.parse(
            await readFile(join(root, "dashboard.json"), "utf8"),
          );
          expect(args).toEqual([
            "start",
            "--hostname",
            host ?? "127.0.0.1",
            "--port",
            "3000",
          ]);
          expect(
            JSON.parse(await readFile(join(root, "worker.json"), "utf8")),
          ).toEqual([]);
          if (proxy)
            expect(
              JSON.parse(await readFile(join(root, "callback.json"), "utf8")),
            ).toEqual([]);
        },
        { timeout: 5000 },
      );
      const exit = once(child, "exit");
      child.kill("SIGTERM");
      expect((await exit)[0]).toBe(0);
      expect(await readFile(join(root, "dashboard.stopped"), "utf8")).toBe(
        "yes",
      );
      expect(await readFile(join(root, "worker.stopped"), "utf8")).toBe("yes");
      if (proxy)
        expect(await readFile(join(root, "callback.stopped"), "utf8")).toBe(
          "yes",
        );
    } finally {
      if (child && child.exitCode === null) {
        const exit = once(child, "exit");
        child.kill("SIGTERM");
        await exit;
      }
      await rm(root, { recursive: true, force: true });
    }
  },
);
