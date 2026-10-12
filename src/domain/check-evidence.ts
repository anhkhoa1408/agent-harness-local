import { CheckStatus } from "./constants/check-status";
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
  if (e.timedOut || e.exitCode === null) return CheckStatus.BLOCKED;
  if (e.exitCode !== 0 || e.failed > 0) return CheckStatus.FAILED;
  if (spec.kind === "build" || spec.kind === "typecheck")
    return CheckStatus.PASSED;
  if (e.executed === null)
    return e.successMatched ? CheckStatus.PASSED : CheckStatus.BLOCKED;
  if (e.executed < spec.minimumTests || e.skipped > 0)
    return CheckStatus.BLOCKED;
  return CheckStatus.PASSED;
}
