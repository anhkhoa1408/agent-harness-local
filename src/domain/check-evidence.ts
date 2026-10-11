import { TaskStatus } from "./constants/task-status";
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
  if (e.timedOut || e.exitCode === null) return TaskStatus.BLOCKED;
  if (e.exitCode !== 0 || e.failed > 0) return TaskStatus.FAILED;
  if (spec.kind === "build" || spec.kind === "typecheck") return "passed";
  if (e.executed === null)
    return e.successMatched ? "passed" : TaskStatus.BLOCKED;
  if (e.executed < spec.minimumTests || e.skipped > 0)
    return TaskStatus.BLOCKED;
  return "passed";
}
