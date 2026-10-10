import type { ApplicationStore } from "../ports";
import type { StoryService } from "../stories";
import type { PlanService } from "../planning";
import type { RuntimePort } from "../runtime";
import type { ValidationPort } from "../validation";
import {
  pipelineProgress,
  type ProgressAttempt,
} from "../../domain/pipeline-progress";
import { WORKER_LEASE_TTL_MS } from "../../domain/limits";
export interface TaskDiffPort {
  diff(root: string, source: string): Promise<string>;
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
    const attempts = this.store.attempts.list();
    return this.store.tasks
      .list()
      .map((task) => ({ ...task, pipeline: pipelineProgress(task, attempts) }));
  }
  events(taskId: string, after: number) {
    return this.store.events.list(taskId, after);
  }
  acceptCommand(taskId: string, raw: unknown) {
    const task = this.task(taskId),
      command = this.validation.command({ ...(raw as object), taskId });
    if (command.expectedRevision !== task.revision)
      return { error: "revision_conflict" as const };
    const health = this.store.health.get("worker");
    if (!health || this.runtime.now() - health.at > WORKER_LEASE_TTL_MS)
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
      pipeline: pipelineProgress(
        task,
        store.attempts.list() as ProgressAttempt[],
      ),
      plan: store.plans.get(`${task.id}:${task.planVersion}`),
      comments: planService.planComments(task.id),
      analysis: store.analyses.get(task.id),
      checks: store.checks.get(task.id),
      review: store.reviews.get(task.id),
      acceptance: store.acceptance.get(task.id),
      delivery: store.deliveries.get(task.id),
      runtime: store.runtimes.get(task.id),
      approvals: (
        store.approvals.list() as Array<{
          taskId: string;
          decision?: unknown;
        }>
      ).filter(
        (r) =>
          r.taskId === task.id &&
          !r.decision &&
          task.status === "running" &&
          task.executionMode !== "auto",
      ),
      artifacts: (
        store.artifacts.list() as Array<{
          taskId: string;
          id: string;
          type: string;
        }>
      )
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
        lease && this.runtime.now() - lease.at < WORKER_LEASE_TTL_MS
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
      return task?.status === "running" &&
        task.executionMode !== "auto" &&
        !approval.decision
        ? [{ id: approval.id, taskId: task.id, taskTitle: task.title }]
        : [];
    });
  }
}
