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
  if (!task.worktree) throw new Error("worktree_missing");
  const root = task.worktree,
    excluded = evidenceExclusions(plan);
  const fingerprint = await io.fingerprint(root, excluded, task.sourceCommit),
    results: CheckResult[] = [];
  for (const spec of plan.checks) {
    signal.throwIfAborted();
    let evidencePath = "",
      stderrPath: string | undefined,
      commandFailed = false,
      exitCode: number | null = null;
    try {
      await io.clearScreenshots(root, plan, spec.id);
      let report: string | null = null;
      if (spec.reportPath) {
        report = await io.reportPath(root, spec.reportPath);
        const tracked = await io.isTracked(root, spec.reportPath);
        if (tracked) throw new Error("report_overwrites_source");
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
        reason: status === "passed" ? null : "check_evidence_unsatisfied",
      });
    } catch (error) {
      results.push({
        id: spec.id,
        taskId: task.id,
        planVersion: plan.version,
        fingerprint,
        status: commandFailed ? "failed" : "blocked",
        executed: null,
        exitCode,
        evidencePath,
        stderrPath,
        reason: commandFailed
          ? "check_command_failed_without_valid_report"
          : error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
  if ((await io.fingerprint(root, excluded, task.sourceCommit)) !== fingerprint)
    return results.map((r) => ({
      ...r,
      status: "blocked",
      reason: "source_changed_during_tests",
    }));
  return results;
}
