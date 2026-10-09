import { MAX_EVIDENCE_FILE_BYTES } from "./limits";
import { readFile, stat, rm } from "node:fs/promises";
import { resolve } from "node:path";

import type { Task, Plan } from "../core/contracts";
import { runProcess } from "./process";
import { fingerprintWorktree } from "../repositories/fingerprint";
import { contained } from "../context/rules";
import { evidenceExclusions, clearScreenshots } from "./ui-verification";
import type { CheckResult } from "../core/evidence";
export type { CheckResult } from "../core/evidence";
import { evaluateCheck, parseEvidence } from "./check-evidence";
export { evaluateCheck, parseEvidence } from "./check-evidence";
async function boundedRead(path: string) {
  if ((await stat(path)).size > MAX_EVIDENCE_FILE_BYTES)
    throw new Error("report_too_large");
  return readFile(path, "utf8");
}
export async function runChecks(
  task: Task,
  plan: Plan,
  signal: AbortSignal,
  artifacts = resolve(
    process.env.HARNESS_DATA_DIR ?? ".harness",
    "artifacts",
    task.id,
  ),
): Promise<CheckResult[]> {
  if (!task.worktree) throw new Error("worktree_missing");
  const root = task.worktree,
    excluded = evidenceExclusions(plan);
  const fingerprint = await fingerprintWorktree(
      root,
      excluded,
      task.sourceCommit,
    ),
    results: CheckResult[] = [];
  for (const spec of plan.checks) {
    signal.throwIfAborted();
    let evidencePath = "",
      stderrPath: string | undefined,
      commandFailed = false,
      exitCode: number | null = null;
    try {
      await clearScreenshots(root, plan, spec.id);
      let report: string | null = null;
      if (spec.reportPath) {
        report = await contained(root, spec.reportPath);
        const tracked = await import("../repositories/inspect").then((m) =>
          m.gitText(root, ["ls-files", "--", spec.reportPath!]),
        );
        if (tracked) throw new Error("report_overwrites_source");
        await rm(report, { force: true });
      }
      const run = await runProcess(spec, root, artifacts, signal);
      evidencePath = run.stdoutPath;
      stderrPath = run.stderrPath;
      exitCode = run.exitCode;
      commandFailed =
        !run.timedOut && run.exitCode !== null && run.exitCode !== 0;
      const text = await boundedRead(report ?? run.stdoutPath);
      const counts = await parseEvidence(spec.reportFormat, text);
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
  if (
    (await fingerprintWorktree(root, excluded, task.sourceCommit)) !==
    fingerprint
  )
    return results.map((r) => ({
      ...r,
      status: "blocked",
      reason: "source_changed_during_tests",
    }));
  return results;
}
