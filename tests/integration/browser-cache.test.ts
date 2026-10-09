import { test, expect, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runProcess } from "../../src/execution/process";
import { planFixture } from "../support/task-fixture";

test("runner shares the configured browser cache without exposing unrelated environment variables", async () => {
  const dir = await mkdtemp(join(tmpdir(), "browser-cache-"));
  vi.stubEnv("PLAYWRIGHT_BROWSERS_PATH", "/tmp/playwright");
  vi.stubEnv("HARNESS_TEST_SECRET", "must-not-leak");
  try {
    const result = await runProcess(
      {
        ...planFixture().checks[0],
        executable: process.execPath,
        args: [
          "-e",
          "console.log(JSON.stringify({cache:process.env.PLAYWRIGHT_BROWSERS_PATH,secret:process.env.HARNESS_TEST_SECRET}))",
        ],
        envNames: [],
      },
      dir,
      join(dir, "logs"),
      new AbortController().signal,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(result.stdoutPath, "utf8"))).toEqual({
      cache: "/tmp/playwright",
    });
  } finally {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  }
});
