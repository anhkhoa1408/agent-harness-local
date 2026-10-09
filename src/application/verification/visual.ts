import type { Task, Plan, VisualReview } from "../../domain/contracts";
import type { CheckResult } from "../../domain/evidence";
type Image = { path: string; sha256: string };
export type ScreenshotEvidence = {
  id: string;
  viewport: { width: number; height: number };
  criterionIds: string[];
  actual: Image;
  reference: Image | null;
};
export function visualChecks(
  task: Task,
  plan: Plan,
  fingerprint: string,
  shots: ScreenshotEvidence[],
  verdict: VisualReview,
): CheckResult[] {
  if (
    verdict.screenshots.length !== shots.length ||
    new Set(verdict.screenshots.map((s) => s.id)).size !== shots.length ||
    shots.some((s) => !verdict.screenshots.some((v) => v.id === s.id))
  )
    throw new Error("ui_verdict_incomplete");
  return shots.map((shot) => {
    const finding = verdict.screenshots.find((s) => s.id === shot.id)!;
    return {
      id: `ui:${shot.id}`,
      taskId: task.id,
      planVersion: plan.version,
      fingerprint,
      status: finding.passed ? "passed" : "failed",
      executed: null,
      exitCode: null,
      evidencePath: shot.actual.path,
      reason: finding.evidence,
      imageEvidence: [shot.actual, ...(shot.reference ? [shot.reference] : [])],
    };
  });
}
