import { test, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { failureEvidence } from "../../src/execution/failure-evidence";

test("repair receives only failing checks and bounded tails of logs, preserving image pointers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "failure-evidence-"));
  try {
    const log = join(dir, "test.log");
    await writeFile(log, "x".repeat(100000) + "specific assertion failed");
    const base = {
      id: "unit",
      taskId: "task",
      planVersion: 1,
      fingerprint: "snap",
      status: "failed" as const,
      executed: 1,
      exitCode: 1,
      evidencePath: log,
      reason: "failed",
    };
    const result = await failureEvidence([
      base,
      { ...base, id: "pass", status: "passed" },
      {
        ...base,
        id: "ui:desktop",
        evidencePath: join(dir, "image.png"),
        imageEvidence: [{ path: join(dir, "image.png"), sha256: "hash" }],
        reason: "wrong layout",
      },
    ]);
    expect(result.checks.map((c) => c.id)).toEqual(["unit", "ui:desktop"]);
    expect(result.checks[0].stdoutExcerpt?.length).toBeLessThanOrEqual(2000);
    expect(result.checks[0].stdoutExcerpt).toContain(
      "specific assertion failed",
    );
    expect(result.checks[1].stdoutExcerpt).toBeNull();
    expect(result.checks[1].imageEvidence).toHaveLength(1);
    expect(JSON.stringify(result).length).toBeLessThan(3500);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("repair evidence keeps six failing checks and counts omitted failures", async () => {
  const failed = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    taskId: "task",
    planVersion: 1,
    fingerprint: "snap",
    status: "failed" as const,
    executed: 1,
    exitCode: 1,
    evidencePath: "",
    reason: null,
  }));
  const result = await failureEvidence([
    ...failed,
    { ...failed[0], id: "pass", status: "passed" },
  ]);
  expect(result.checks.map((check) => check.id)).toEqual([
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
  ]);
  expect(result.omittedFailures).toBe(2);
});
