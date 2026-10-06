import { MAX_FAILURE_EXCERPT_CHARACTERS, MAX_FAILURE_EXCERPTS } from "./limits";
import { open } from "node:fs/promises";
import type { CheckResult } from "./checks";
async function tail(path: string | undefined) {
  if (!path) return null;
  try {
    const file = await open(path, "r");
    try {
      const size = (await file.stat()).size,
        buffer = Buffer.alloc(Math.min(size, MAX_FAILURE_EXCERPT_CHARACTERS));
      await file.read(
        buffer,
        0,
        buffer.length,
        Math.max(0, size - buffer.length),
      );
      return buffer.toString("utf8").slice(-MAX_FAILURE_EXCERPT_CHARACTERS);
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
         .slice(0, MAX_FAILURE_EXCERPTS)
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
