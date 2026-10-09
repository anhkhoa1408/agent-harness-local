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
    if (attempt.stage === "analyze") reset(stages.slice(2));
    if (attempt.stage === "plan") reset(stages.slice(3));
    if (["implement", "repair"].includes(attempt.stage))
      reset(["verify", "review", "deliver"]);
    if (attempt.stage === "verify") reset(["review", "deliver"]);
    if (attempt.stage === "review") reset(["deliver"]);
    const current = node(attempt.stage);
    const output = attempt.output as {
      needsReplan?: boolean;
      verdict?: string;
      version?: number;
    } | null;
    const needsWork =
      (attempt.nextStage === "plan" &&
        ["implement", "repair"].includes(attempt.stage)) ||
      (attempt.nextStage === "repair" &&
        ["verify", "review"].includes(attempt.stage)) ||
      output?.needsReplan === true ||
      (attempt.stage === "review" &&
        output?.verdict &&
        output.verdict !== "pass") ||
      (attempt.stage === "verify" &&
        !attempt.nextStage &&
        Array.isArray(output) &&
        output.some((c) => c.status !== "passed"));
    const approvedPlan =
      attempt.stage === "plan" &&
      output?.version != null &&
      task.approvedPlanVersion === output.version;
    if (
      attempt.status === "completed" &&
      !needsWork &&
      (approvedPlan ||
        !["blocked", "waiting_input", "waiting_approval", "failed"].includes(
          attempt.nextStatus ?? "",
        ))
    ) {
      current.state = "done";
      current.label = "Đã xong";
    } else if (
      attempt.status === "failed" ||
      needsWork ||
      attempt.nextStatus === "blocked"
    ) {
      current.state = "attention";
      current.label = "Cần xử lý";
    } else {
      current.state = "pending";
      current.label = "Chưa hoàn tất";
    }
  }
  if (task.status === "completed") {
    if (node("repair").state === "pending")
      Object.assign(node("repair"), {
        state: "skipped",
        label: "Không cần sửa",
      });
    if (
      node("implement").state === "pending" &&
      node("repair").state === "done"
    )
      Object.assign(node("implement"), {
        state: "skipped",
        label: "Thay bằng vòng sửa",
      });
    return nodes;
  }
  // A command can invalidate approval before the next attempt is recorded.
  if (task.stage === "analyze") reset(stages.slice(2));
  if (task.stage === "plan") reset(stages.slice(3));
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
    task.status === "queued"
      ? "pending"
      : task.status === "cancelled"
        ? "stopped"
        : ["blocked", "failed", "interrupted"].includes(task.status)
          ? "attention"
          : "current";
  return nodes;
}
