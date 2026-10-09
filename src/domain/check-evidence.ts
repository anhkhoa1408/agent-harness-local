import type { CheckSpec } from "./contracts";
import type { CheckResult } from "./evidence";
type Counts = { executed: number | null; failed: number; skipped: number };
export function evaluateCheck(
  spec: CheckSpec,
  e: Counts & {
    exitCode: number | null;
    timedOut: boolean;
    successMatched: boolean;
  },
): CheckResult["status"] {
  if (e.timedOut || e.exitCode === null) return "blocked";
  if (e.exitCode !== 0 || e.failed > 0) return "failed";
  if (spec.kind === "build" || spec.kind === "typecheck") return "passed";
  if (e.executed === null) return e.successMatched ? "passed" : "blocked";
  if (e.executed < spec.minimumTests || e.skipped > 0) return "blocked";
  return "passed";
}
