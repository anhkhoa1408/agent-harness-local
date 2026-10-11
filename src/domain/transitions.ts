import { PipelineStage } from "./constants/pipeline-stage";
import { DomainErrorCode } from "./constants/domain-error-code";
import { TaskStatus } from "./constants/task-status";
import type { Task, Plan, Review } from "./contracts";
import { validatePlan } from "./acceptance";
export function stageAfterPreparation(task: Task): "implement" | "repair" {
  return task.resumeStage === PipelineStage.REPAIR || task.repairCount > 0
    ? PipelineStage.REPAIR
    : PipelineStage.IMPLEMENT;
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
    throw new Error(DomainErrorCode.STALE_PLAN);
  if (task.status !== TaskStatus.WAITING_APPROVAL)
    throw new Error(DomainErrorCode.INVALID_STATUS);
  const errors = validatePlan(plan);
  if (errors.length) throw new Error(`invalid_plan:${errors.join(",")}`);
  return {
    ...task,
    approvedPlanVersion: plan.version,
    stage: PipelineStage.PREPARE,
    status: TaskStatus.QUEUED,
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
      stage: PipelineStage.REVIEW,
      status: TaskStatus.WAITING_INPUT,
      reason: "review_dispute",
      repairCount: task.repairCount,
    };
  if (review.verdict === "pass")
    return {
      stage: PipelineStage.DELIVER,
      status: TaskStatus.QUEUED,
      reason: null,
      repairCount: task.repairCount,
    };
  return {
    stage: PipelineStage.REPAIR,
    status: TaskStatus.QUEUED,
    reason: null,
    repairCount: task.repairCount,
  };
}
