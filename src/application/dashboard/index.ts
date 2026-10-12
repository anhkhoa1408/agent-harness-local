import { ExecutionMode } from "../../domain/constants/execution-mode";
import { planKey } from "../../domain/utils/record-key";
import { ApplicationErrorCode } from "../constants/index";
import { WorkerLease } from "../../domain/constants/worker-lease";
import { TaskStatus } from "../../domain/constants/task-status";
import type { Attempt } from "../pipeline-contracts";
import type { Task } from "../../domain/contracts";
import type { ApplicationStore, ApprovalRecord } from "../ports";
import type { StoryService } from "../stories";
import type { PlanService } from "../planning";
import type { RuntimePort } from "../runtime";
import type { ValidationPort } from "../validation";
import { pipelineProgress } from "../../domain/pipeline-progress";

export interface TaskDiffPort {
  diff(root: string, source: string): Promise<string>;
}
function isPendingApproval(
  task: Task | undefined,
  approval: ApprovalRecord,
): task is Task {
  return (
    task?.status === TaskStatus.RUNNING &&
    task.executionMode !== ExecutionMode.AUTO &&
    !approval.decision
  );
}

export class DashboardService {
  constructor(
    private readonly store: ApplicationStore,
    private readonly storyService: StoryService,
    private readonly planService: PlanService,
    private readonly runtime: RuntimePort,
    private readonly validation: ValidationPort,
    private readonly repository: TaskDiffPort,
  ) {}
  task(id: string) {
    return this.store.tasks.get(id);
  }
  tasks() {
    const attemptsByTask = new Map<string, Attempt[]>();
    for (const attempt of this.store.attempts.list()) {
      const { taskId } = attempt;
      const attempts = attemptsByTask.get(taskId);
      if (attempts) attempts.push(attempt);
      else attemptsByTask.set(taskId, [attempt]);
    }
    return this.store.tasks.list().map((task) => ({
      ...task,
      pipeline: pipelineProgress(task, attemptsByTask.get(task.id) ?? []),
    }));
  }
  events(taskId: string, after: number) {
    return this.store.events.list(taskId, after);
  }
  acceptCommand(taskId: string, raw: unknown) {
    const task = this.task(taskId);
    const command = this.validation.command({ ...(raw as object), taskId });
    if (command.expectedRevision !== task.revision)
      return { error: ApplicationErrorCode.REVISION_CONFLICT };
    const health = this.store.health.get("worker");
    if (
      !health ||
      this.runtime.now() - health.at > WorkerLease.WORKER_LEASE_TTL_MS
    )
      return { error: "worker_unavailable" as const };
    return { accepted: this.store.commands.enqueue(command) };
  }
  async detail(taskId: string) {
    const { store, storyService, planService } = this;
    const task = this.task(taskId);
    let diff = "";
    if (task.worktree)
      try {
        diff = await this.repository.diff(task.worktree, task.sourceCommit);
      } catch {
        diff = "Diff unavailable";
      }
    return {
      task,
      stories: {
        execution: storyService.getExecution(task.id),
        runs: storyService.listStoryRuns(task.id),
      },
      pipeline: pipelineProgress(task, store.attempts.list()),
      plan: store.plans.get(planKey(task.id, task.planVersion)),
      comments: planService.planComments(task.id),
      analysis: store.analyses.get(task.id),
      checks: store.checks.get(task.id),
      review: store.reviews.get(task.id),
      acceptance: store.acceptance.get(task.id),
      delivery: store.deliveries.get(task.id),
      runtime: store.runtimes.get(task.id),
      approvals: store.approvals
        .list()
        .filter((r) => r.taskId === task.id && isPendingApproval(task, r)),
      artifacts: store.artifacts
        .list()
        .filter((r) => r.taskId === task.id)
        .map((r) => ({ id: r.id, type: r.type })),
      diff,
    };
  }
  health() {
    const lease = this.store.health.get("worker");
    return {
      app: "ready",
      worker:
        lease && this.runtime.now() - lease.at < WorkerLease.WORKER_LEASE_TTL_MS
          ? "online"
          : "offline",
      heartbeat: lease?.at ?? null,
    };
  }
  approvals() {
    const tasks = new Map(
      this.store.tasks.list().map((task) => [task.id, task]),
    );
    return this.store.approvals.list().flatMap((approval) => {
      const task = tasks.get(approval.taskId);
      return isPendingApproval(task, approval)
        ? [{ id: approval.id, taskId: task.id, taskTitle: task.title }]
        : [];
    });
  }
}
