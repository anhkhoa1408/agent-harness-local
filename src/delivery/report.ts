import type { Plan, Review } from "../core/contracts";
import type { CheckResult } from "../execution/checks";
export function renderReport(
  plan: Plan,
  checks: CheckResult[],
  review: Review,
): string {
  return [
    `# ${plan.scope}`,
    `Source: ${plan.sourceCommit}; plan v${plan.version}.`,
    "## Feature checks",
    ...checks.map(
      (c) =>
        `- ${c.id}: **${c.status}**, executed=${c.executed ?? "unknown"}; ${c.reason ?? c.evidencePath}`,
    ),
    "## Acceptance",
    ...review.criteria.map(
      (c) => `- ${c.id}: ${c.passed ? "passed" : "failed"} — ${c.evidence}`,
    ),
    "## Review",
    ...review.findings.map(
      (f) =>
        `- ${f.severity}/${f.status}: ${f.description} (${f.path}:${f.line})`,
    ),
    "## Skipped / limitations",
    "Legacy tests outside the approved feature Test Plan were not run; they are not reported as passed.",
    ...plan.outOfScope.map((s) => `- ${s}`),
  ].join("\n\n");
}
