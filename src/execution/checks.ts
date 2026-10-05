import { readFile, stat, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Parser } from "tap-parser";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Task, Plan, CheckSpec } from "../core/contracts";
import { runProcess } from "./process";
import { fingerprintWorktree } from "../repositories/fingerprint";
import { contained } from "../context/rules";
import { evidenceExclusions, clearScreenshots } from "./ui-verification";
export type CheckResult = {
  id: string;
  taskId: string;
  planVersion: number;
  fingerprint: string;
  status: "passed" | "failed" | "blocked" | "skipped" | "not_applicable";
  executed: number | null;
  exitCode: number | null;
  evidencePath: string;
  reason: string | null;
  imageEvidence?: { path: string; sha256: string }[];
  stderrPath?: string;
};
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
export async function parseEvidence(
  format: CheckSpec["reportFormat"],
  text: string,
): Promise<Counts> {
  if (format === "exit-code") return { executed: null, failed: 0, skipped: 0 };
  if (format === "tap")
    return new Promise((resolve) => {
      const parser = new Parser();
      let executed = 0,
        skipped = 0,
        failed = 0;
      parser.on("result", (result) => {
        if (result.closingTestPoint) return;
        if (result.skip || result.todo) skipped++;
        else {
          executed++;
          if (!result.ok) failed++;
        }
      });
      parser.on("complete", (r) =>
        resolve({
          executed,
          failed: r.ok ? failed : Math.max(1, failed),
          skipped: Math.max(skipped, r.skip + r.todo),
        }),
      );
      parser.end(text);
    });
  if (XMLValidator.validate(text) !== true) throw new Error("invalid_junit");
  const xml = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
  }).parse(text);
  let executed = 0,
    failed = 0,
    skipped = 0;
  function walk(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, v] of Object.entries(value)) {
      if (key === "testcase") {
        for (const c of Array.isArray(v) ? v : [v]) {
          executed++;
          if (c && typeof c === "object") {
            if ("failure" in c || "error" in c) failed++;
            if ("skipped" in c) skipped++;
          }
        }
      } else walk(v);
    }
  }
  if (!xml.testsuites && !xml.testsuite) throw new Error("invalid_junit");
  walk(xml);
  return { executed, failed, skipped };
}
async function boundedRead(path: string) {
  if ((await stat(path)).size > 8 * 1024 * 1024)
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
      exitCode = run.exitCode;
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
        status: "blocked",
        executed: null,
        exitCode,
        evidencePath,
        reason: error instanceof Error ? error.message : String(error),
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
