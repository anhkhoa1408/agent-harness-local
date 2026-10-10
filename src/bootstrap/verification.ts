import { resolve } from "node:path";
import { runChecks as run } from "../application/verification";
import { verificationIO } from "../infrastructure/execution/verification";
import type { Task, Plan } from "../domain/contracts";
export { evaluateCheck } from "../domain/check-evidence";
export { parseEvidence } from "../infrastructure/execution/check-evidence";
export type { CheckResult } from "../domain/evidence";
export function runChecks(
  task: Task,
  plan: Plan,
  signal: AbortSignal,
  artifacts = resolve(
    process.env.HARNESS_DATA_DIR ?? ".harness",
    "artifacts",
    task.id,
  ),
) {
  return run(task, plan, signal, artifacts, verificationIO);
}
