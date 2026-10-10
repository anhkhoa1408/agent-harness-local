import type {
  Task,
  Plan,
  CommandSpec,
  CheckSpec,
} from "../../domain/contracts";
import type { CheckResult } from "../../domain/evidence";
import type { ScreenshotEvidence } from "./visual";
export type ProcessResult = {
  exitCode: number | null;
  signal: string | null;
  stdoutPath: string;
  stderrPath: string;
  timedOut: boolean;
};
export type EvidenceCounts = {
  executed: number | null;
  failed: number;
  skipped: number;
};
export type FailureEvidence = {
  checks: (CheckResult & {
    stdoutExcerpt: string | null;
    stderrExcerpt: string | null;
  })[];
  omittedFailures: number;
};
export interface VerificationPort {
  failureEvidence(checks: CheckResult[]): Promise<FailureEvidence>;
  fingerprint(
    root: string,
    excluded: string[],
    source: string,
  ): Promise<string>;
  clearScreenshots(root: string, plan: Plan, checkId: string): Promise<void>;
  reportPath(root: string, path: string): Promise<string>;
  isTracked(root: string, path: string): Promise<string>;
  remove(path: string): Promise<void>;
  readReport(path: string): Promise<string>;
  runProcess(
    command: CommandSpec,
    root: string,
    artifacts: string,
    signal: AbortSignal,
  ): Promise<ProcessResult>;
  parseEvidence(
    format: CheckSpec["reportFormat"],
    text: string,
  ): Promise<EvidenceCounts>;
  collectScreenshots(
    task: Task,
    plan: Plan,
    checks: CheckResult[],
    artifacts: string,
  ): Promise<ScreenshotEvidence[]>;
  verifyImageEvidence(checks: CheckResult[]): Promise<void>;
}
