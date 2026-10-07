import type { Plan } from "./contracts";
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

export function evidenceExclusions(plan: Plan) {
  return [
    ...plan.checks.flatMap((c) => (c.reportPath ? [c.reportPath] : [])),
    ...(plan.uiVerification?.screenshots.map((s) => s.path) ?? []),
  ];
}
