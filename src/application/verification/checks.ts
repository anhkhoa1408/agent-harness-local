import { TaskReason } from "../../domain/constants/task-reason";
import { CheckStatus } from "../../domain/constants/check-status";
import { errorMessage } from "../utils/index";
import { ApplicationErrorCode } from "../constants/index";
import { evidenceExclusions } from "../../domain/evidence";
import type { Task, Plan } from "../../domain/contracts";
import type { CheckResult } from "../../domain/evidence";
import { evaluateCheck } from "../../domain/check-evidence";
import type { VerificationPort } from "./ports";
export async function runChecks(
  task: Task,
  plan: Plan,
  signal: AbortSignal,
  artifacts: string,
  io: VerificationPort,
): Promise<CheckResult[]> {
  if (!task.worktree) throw new Error(ApplicationErrorCode.WORKTREE_MISSING);
  const root = task.worktree;
  const excluded = evidenceExclusions(plan);
  const fingerprint = await io.fingerprint(root, excluded, task.sourceCommit);
  const results: CheckResult[] = [];
  for (const spec of plan.checks) {
    signal.throwIfAborted();
    let evidencePath = "";
    let stderrPath: string | undefined;
    let commandFailed = false;
    let exitCode: number | null = null;
    try {
      await io.clearScreenshots(root, plan, spec.id);
      let report: string | null = null;
      if (spec.reportPath) {
        report = await io.reportPath(root, spec.reportPath);
        const tracked = await io.isTracked(root, spec.reportPath);
        if (tracked)
          throw new Error(ApplicationErrorCode.REPORT_OVERWRITES_SOURCE);
        await io.remove(report);
      }
      const run = await io.runProcess(spec, root, artifacts, signal);
      evidencePath = run.stdoutPath;
      stderrPath = run.stderrPath;
      exitCode = run.exitCode;
      commandFailed =
        !run.timedOut && run.exitCode !== null && run.exitCode !== 0;
      const text = await io.readReport(report ?? run.stdoutPath);
      const counts = await io.parseEvidence(spec.reportFormat, text);
      const successMatched =
        !!spec.successPattern && text.includes(spec.successPattern);
      const status = evaluateCheck(spec, { ...counts, ...run, successMatched });
      results.push({
        id: spec.id,
        taskId: task.id,
        planVersion: plan.version,
        fingerprint,
        status,
        executed: counts.executed,
        exitCode,
        evidencePath: report ?? evidencePath,
        stderrPath: run.stderrPath,
        reason:
          status === CheckStatus.PASSED ? null : "check_evidence_unsatisfied",
      });
    } catch (error) {
      results.push({
        id: spec.id,
        taskId: task.id,
        planVersion: plan.version,
        fingerprint,
        status: commandFailed ? CheckStatus.FAILED : CheckStatus.BLOCKED,
        executed: null,
        exitCode,
        evidencePath,
        stderrPath,
        reason: commandFailed
          ? "check_command_failed_without_valid_report"
          : errorMessage(error, String),
      });
    }
  }
  if ((await io.fingerprint(root, excluded, task.sourceCommit)) !== fingerprint)
    return results.map((r) => ({
      ...r,
      status: CheckStatus.BLOCKED,
      reason: TaskReason.SOURCE_CHANGED_DURING_TESTS,
    }));
  return results;
}
