import { MAX_REPAIR_ROUNDS } from "../core/limits";
import type { Task, Plan, Review } from "./contracts";
import { validatePlan } from "./acceptance";
export function stageAfterPreparation(task: Task): "implement" | "repair" {
  return task.resumeStage === "repair" || task.repairCount > 0
    ? "repair"
    : "implement";
}
export function canImplement(task: Task, plan: Plan): boolean {
  return (
    task.id === plan.taskId &&
    task.planVersion === plan.version &&
    task.approvedPlanVersion === plan.version &&
    task.sourceCommit === plan.sourceCommit &&
    validatePlan(plan).length === 0
  );
}
export function approvePlan(
  task: Task,
  plan: Plan,
  expectedVersion: number,
): Task {
  if (
    task.id !== plan.taskId ||
    task.planVersion !== expectedVersion ||
    plan.version !== expectedVersion ||
    task.sourceCommit !== plan.sourceCommit
  )
    throw new Error("stale_plan");
  if (task.status !== "waiting_approval") throw new Error("invalid_status");
  const errors = validatePlan(plan);
  if (errors.length) throw new Error(`invalid_plan:${errors.join(",")}`);
  return {
    ...task,
    approvedPlanVersion: plan.version,
    stage: "prepare",
    status: "queued",
    reason: null,
  };
}
export function nextAfterReview(
  task: Task,
  review: Review,
): Pick<Task, "stage" | "status" | "reason" | "repairCount"> {
  if (
    review.verdict === "needs_input" ||
    review.findings.some((f) => f.status === "disputed")
  )
    return {
      stage: "review",
      status: "waiting_input",
      reason: "review_dispute",
      repairCount: task.repairCount,
    };
  if (review.verdict === "pass")
    return {
      stage: "deliver",
      status: "queued",
      reason: null,
      repairCount: task.repairCount,
    };
  if (task.repairCount >= MAX_REPAIR_ROUNDS)
    return {
      stage: "review",
      status: "blocked",
      reason: "repair_limit",
      repairCount: task.repairCount,
    };
  return {
    stage: "repair",
    status: "queued",
    reason: null,
    repairCount: task.repairCount,
  };
}
