import { test, expect } from "vitest";
import { mkdtemp, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("loading web modules during build does not open the runtime database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "build-runtime")),
    previous = process.env.HARNESS_DATA_DIR;
  process.env.HARNESS_DATA_DIR = dir;
  try {
    await import("../../src/server/runtime");
    await expect(stat(join(dir, "harness.db"))).rejects.toThrow();
  } finally {
    if (previous === undefined) delete process.env.HARNESS_DATA_DIR;
    else process.env.HARNESS_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
