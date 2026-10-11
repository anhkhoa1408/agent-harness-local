import { PipelineStage } from "./constants/pipeline-stage";
import { TaskStatus } from "./constants/task-status";
import { stages, type Stage, type Status, type Task } from "./contracts";
export type ProgressAttempt = {
  taskId: string;
  stage: Stage;
  status: "running" | "completed" | "interrupted" | "failed";
  output: unknown;
  nextStage?: Stage;
  nextStatus?: Status;
};
export type StageNode = {
  stage: Stage;
  state: "done" | "current" | "pending" | "attention" | "stopped" | "skipped";
  label: string;
};
export type TaskWithProgress = Task & { pipeline: StageNode[] };
type ProgressOutput = {
  needsReplan?: boolean;
  verdict?: string;
  version?: number;
} | null;

function attemptNeedsWork(attempt: ProgressAttempt, output: ProgressOutput) {
  return (
    (attempt.nextStage === PipelineStage.PLAN &&
      [PipelineStage.IMPLEMENT, PipelineStage.REPAIR].some(
        (value) => value === attempt.stage,
      )) ||
    (attempt.nextStage === PipelineStage.REPAIR &&
      [PipelineStage.VERIFY, PipelineStage.REVIEW].some(
        (value) => value === attempt.stage,
      )) ||
    output?.needsReplan === true ||
    (attempt.stage === PipelineStage.REVIEW &&
      output?.verdict &&
      output.verdict !== "pass") ||
    (attempt.stage === PipelineStage.VERIFY &&
      !attempt.nextStage &&
      Array.isArray(output) &&
      output.some((c) => c.status !== "passed"))
  );
}

export function pipelineProgress(
  task: Task,
  attempts: ProgressAttempt[],
): StageNode[] {
  const nodes: StageNode[] = stages.map((stage) => ({
    stage,
    state: "pending",
    label: "Chưa tới",
  }));
  const node = (stage: Stage) => nodes.find((n) => n.stage === stage)!;
  const reset = (targets: readonly Stage[]) => {
    for (const s of targets) {
      const n = node(s);
      if (n.state !== "pending") n.label = "Cần chạy lại";
      n.state = "pending";
    }
  };
  // Store returns attempts in insertion order, including subsequent retries.
  for (const attempt of attempts.filter((a) => a.taskId === task.id)) {
    if (attempt.stage === PipelineStage.ANALYZE)
      reset(stages.slice(stages.indexOf(PipelineStage.PLAN)));
    if (attempt.stage === PipelineStage.PLAN)
      reset(stages.slice(stages.indexOf(PipelineStage.PREPARE)));
    if (
      [PipelineStage.IMPLEMENT, PipelineStage.REPAIR].some(
        (value) => value === attempt.stage,
      )
    )
      reset([
        PipelineStage.VERIFY,
        PipelineStage.REVIEW,
        PipelineStage.DELIVER,
      ]);
    if (attempt.stage === PipelineStage.VERIFY)
      reset([PipelineStage.REVIEW, PipelineStage.DELIVER]);
    if (attempt.stage === PipelineStage.REVIEW) reset([PipelineStage.DELIVER]);
    const current = node(attempt.stage);
    const output = attempt.output as ProgressOutput;
    const needsWork = attemptNeedsWork(attempt, output);
    const approvedPlan =
      attempt.stage === PipelineStage.PLAN &&
      output?.version != null &&
      task.approvedPlanVersion === output.version;
    if (
      attempt.status === TaskStatus.COMPLETED &&
      !needsWork &&
      (approvedPlan ||
        ![
          TaskStatus.BLOCKED,
          TaskStatus.WAITING_INPUT,
          TaskStatus.WAITING_APPROVAL,
          TaskStatus.FAILED,
        ].some((value) => value === (attempt.nextStatus ?? "")))
    ) {
      current.state = "done";
      current.label = "Đã xong";
    } else if (
      attempt.status === TaskStatus.FAILED ||
      needsWork ||
      attempt.nextStatus === TaskStatus.BLOCKED
    ) {
      current.state = "attention";
      current.label = "Cần xử lý";
    } else {
      current.state = "pending";
      current.label = "Chưa hoàn tất";
    }
  }
  if (task.status === TaskStatus.COMPLETED) {
    if (node(PipelineStage.REPAIR).state === "pending")
      Object.assign(node(PipelineStage.REPAIR), {
        state: "skipped",
        label: "Không cần sửa",
      });
    if (
      node(PipelineStage.IMPLEMENT).state === "pending" &&
      node(PipelineStage.REPAIR).state === "done"
    )
      Object.assign(node(PipelineStage.IMPLEMENT), {
        state: "skipped",
        label: "Thay bằng vòng sửa",
      });
    return nodes;
  }
  // A command can invalidate approval before the next attempt is recorded.
  if (task.stage === PipelineStage.ANALYZE)
    reset(stages.slice(stages.indexOf(PipelineStage.PLAN)));
  if (task.stage === PipelineStage.PLAN)
    reset(stages.slice(stages.indexOf(PipelineStage.PREPARE)));
  const current = node(task.stage);
  const labels: Record<Status, string> = {
    queued: "Sắp chạy",
    running: "Đang chạy",
    waiting_input: "Cần làm rõ",
    waiting_approval: "Chờ duyệt",
    paused: "Tạm dừng",
    interrupted: "Cần khôi phục",
    blocked: "Bị chặn",
    failed: "Thất bại",
    cancelled: "Đã hủy",
    completed: "Đã xong",
  };
  current.label = labels[task.status];
  current.state =
    task.status === TaskStatus.QUEUED
      ? "pending"
      : task.status === TaskStatus.CANCELLED
        ? "stopped"
        : [TaskStatus.BLOCKED, TaskStatus.FAILED, TaskStatus.INTERRUPTED].some(
              (value) => value === task.status,
            )
          ? "attention"
          : "current";
  return nodes;
}
