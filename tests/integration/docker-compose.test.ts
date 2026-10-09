import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Compose config validates the actual model without connecting to the daemon.
test.skipIf(process.env.HARNESS_DOCKER_COMPOSE_TEST !== "1")(
  "Compose discovers docker-compose.yml and rebuilds the Harness build context on changes while preserving persistent storage",
  async () => {
    const { stdout } = await promisify(execFile)(
      "docker",
      ["compose", "config", "--format", "json"],
      { cwd: resolve("."), timeout: 10_000 },
    );
    const model = JSON.parse(stdout);
    const service = model.services.harness;
    expect(service.environment.PLAYWRIGHT_BROWSERS_PATH).toBe(
      "/tmp/playwright",
    );
    expect(service.develop?.watch).toEqual([
      expect.objectContaining({
        path: resolve("."),
        action: "rebuild",
        ignore: expect.arrayContaining([
          ".git/",
          "node_modules/",
          ".next/",
          ".harness/",
          "test-results/",
        ]),
      }),
    ]);
    expect(existsSync("docker-compose.yml")).toBe(true);
    expect(existsSync("compose.yaml")).toBe(false);
    expect(service.volumes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "volume",
          source: "harness-data",
          target: "/data",
        }),
        expect.objectContaining({
          type: "volume",
          source: "codex-login",
          target: "/codex",
        }),
        expect.objectContaining({
          type: "volume",
          source: "playwright-cache",
          target: "/tmp/playwright",
        }),
      ]),
    );
    expect(
      service.ports.every(
        (port: { host_ip: string }) => port.host_ip === "127.0.0.1",
      ),
    ).toBe(true);
    expect(service.security_opt).toEqual([
      "seccomp=./config/docker-seccomp.json",
    ]);
  },
);
