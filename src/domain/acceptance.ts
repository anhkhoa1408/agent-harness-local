import { validateStories } from "./stories";
import { type Plan, type Task, type Review } from "./contracts";
import type { CheckResult } from "./evidence";
export function validatePlan(plan: Plan): string[] {
  const errors: string[] = validateStories(plan);
  if (plan.unresolved.length) errors.push("unresolved_questions");
  if (!plan.criteria.length || !plan.steps.length || !plan.checks.length)
    errors.push("incomplete_plan");
  for (const list of [plan.steps, plan.checks, plan.criteria])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      errors.push("duplicate_id");
  for (const criterion of plan.criteria)
    if (
      !criterion.checkIds.length ||
      criterion.checkIds.some(
        (id) => !plan.checks.some((c) => c.id === id && c.required),
      )
    )
      errors.push(`missing_evidence:${criterion.id}`);
  for (const check of plan.checks) {
    if (check.id.startsWith("ui:"))
      errors.push(`reserved_check_id:${check.id}`);
    if (!["build", "typecheck"].includes(check.kind) && check.minimumTests < 1)
      errors.push(`minimum_tests:${check.id}`);
    if (
      check.reportFormat === "exit-code" &&
      !["build", "typecheck"].includes(check.kind) &&
      !check.successPattern
    )
      errors.push(`missing_success_evidence:${check.id}`);
    if (check.reportFormat === "junit" && !check.reportPath)
      errors.push(`missing_report:${check.id}`);
  }
  const screenshots = plan.uiVerification?.screenshots ?? [];
  if (
    new Set(screenshots.map((s) => s.id)).size !== screenshots.length ||
    new Set(screenshots.map((s) => s.path)).size !== screenshots.length
  )
    errors.push("ui_duplicate_selection");
  const safePath = (path: string) =>
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((p) => p === ".." || p === "." || !p);
  for (const shot of screenshots) {
    if (
      !plan.checks.some(
        (c) => c.id === shot.checkId && c.required && c.kind === "e2e",
      )
    )
      errors.push(`ui_e2e_required:${shot.id}`);
    if (
      shot.criterionIds.some(
        (id) =>
          !plan.criteria.some(
            (c) => c.id === id && c.checkIds.includes(shot.checkId),
          ),
      )
    )
      errors.push(`ui_criterion:${shot.id}`);
    if (
      !safePath(shot.path) ||
      !shot.path.endsWith(".png") ||
      (shot.referencePath &&
        (!safePath(shot.referencePath) ||
          !shot.referencePath.endsWith(".png"))) ||
      screenshots.some((s) => s.referencePath === shot.path) ||
      plan.checks.some((c) => c.reportPath === shot.path)
    )
      errors.push(`ui_path:${shot.id}`);
  }
  const visited = new Set<string>(),
    active = new Set<string>();
  function visit(id: string) {
    if (active.has(id)) {
      errors.push("dependency_cycle");
      return;
    }
    if (visited.has(id)) return;
    const step = plan.steps.find((s) => s.id === id);
    if (!step) {
      errors.push(`unknown_dependency:${id}`);
      return;
    }
    active.add(id);
    step.dependsOn.forEach(visit);
    active.delete(id);
    visited.add(id);
  }
  plan.steps.forEach((s) => visit(s.id));
  return [...new Set(errors)];
}
export function acceptanceErrors(
  task: Task,
  plan: Plan,
  checks: CheckResult[],
  review: Review,
  fingerprint: string,
): string[] {
  const errors = validatePlan(plan);
  if (
    task.id !== plan.taskId ||
    task.planVersion !== plan.version ||
    task.approvedPlanVersion !== plan.version ||
    task.sourceCommit !== plan.sourceCommit
  )
    errors.push("plan_not_approved");
  if (
    review.taskId !== task.id ||
    review.planVersion !== plan.version ||
    review.fingerprint !== fingerprint
  )
    errors.push("stale_review");
  if (review.verdict !== "pass") errors.push("review_not_passed");
  if (
    review.findings.some(
      (f) => f.severity !== "minor" && f.status !== "resolved",
    )
  )
    errors.push("unresolved_findings");
  for (const spec of plan.checks.filter((c) => c.required)) {
    const matching = checks.filter((c) => c.id === spec.id);
    if (
      matching.length !== 1 ||
      !matching.every(
        (c) =>
          c.taskId === task.id &&
          c.planVersion === plan.version &&
          c.fingerprint === fingerprint &&
          c.status === "passed" &&
          c.evidencePath,
      )
    )
      errors.push(`required_check:${spec.id}`);
  }
  for (const criterion of plan.criteria) {
    const matches = review.criteria.filter((c) => c.id === criterion.id);
    if (
      matches.length !== 1 ||
      !matches.every((c) => c.passed && c.evidence.trim())
    )
      errors.push(`criterion:${criterion.id}`);
  }
  for (const shot of plan.uiVerification?.screenshots ?? []) {
    const matching = checks.filter((c) => c.id === `ui:${shot.id}`);
    if (
      matching.length !== 1 ||
      !matching.every(
        (c) =>
          c.taskId === task.id &&
          c.planVersion === plan.version &&
          c.fingerprint === fingerprint &&
          c.status === "passed" &&
          c.evidencePath &&
          c.imageEvidence?.length,
      )
    )
      errors.push(`required_ui:${shot.id}`);
  }
  return errors;
}
export function canDeliver(
  task: Task,
  plan: Plan,
  checks: CheckResult[],
  review: Review,
  fingerprint: string,
): boolean {
  return acceptanceErrors(task, plan, checks, review, fingerprint).length === 0;
}
