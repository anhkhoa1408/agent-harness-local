import { open } from "node:fs/promises";
import type { CheckResult } from "./checks";
async function tail(path: string | undefined) {
  if (!path) return null;
  try {
    const file = await open(path, "r");
    try {
      const size = (await file.stat()).size,
        buffer = Buffer.alloc(Math.min(size, 2000));
      await file.read(
        buffer,
        0,
        buffer.length,
        Math.max(0, size - buffer.length),
      );
      return buffer.toString("utf8").slice(-2000);
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}
export async function failureEvidence(checks: CheckResult[]) {
  const failures = checks.filter(
    (c) => c.status !== "passed" && c.status !== "not_applicable",
  );
  return {
    checks: await Promise.all(
      failures
        .slice(0, 6)
        .map(async (check) => ({
          ...check,
          stdoutExcerpt: check.imageEvidence
            ? null
            : await tail(check.evidencePath),
          stderrExcerpt: await tail(check.stderrPath),
        })),
    ),
    omittedFailures: Math.max(0, failures.length - 6),
  };
}
