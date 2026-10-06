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
