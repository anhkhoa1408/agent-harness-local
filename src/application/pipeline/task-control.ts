import { ApplicationErrorCode, EventType } from "../constants/index";
import { TaskStatus } from "../../domain/constants/task-status";
import { DomainErrorCode } from "../../domain/constants/domain-error-code";
import type { StoryService } from "../stories";
import type { Task, ControlCommand } from "../../domain/contracts";
import type { ApplicationStore } from "../ports";
import type { RuntimePort } from "../runtime";
import type { ValidationPort } from "../validation";
import { workerEvent as event } from "./events";
import { TaskReason } from "../../domain/constants/task-reason";
import { StoryRunState } from "../../domain/constants/story-run-state";
import { storyKey } from "../stories";
import { applyEffortPolicy } from "../../domain/model-policy";
import type { ActiveStageAttempt } from "../pipeline-contracts";

export function processTaskControl(
  store: ApplicationStore,
  storyService: StoryService,
  active: ActiveStageAttempt | null,
  task: Task,
  c: ControlCommand,
  validation: ValidationPort,
  runtime: RuntimePort,
) {
  if (c.kind === "pause" || c.kind === "cancel") {
    for (const run of storyService
      .listStoryRuns(task.id)
      .filter((r) => r.childTaskId && r.state !== StoryRunState.COMPLETED)) {
      const child = store.tasks.get(run.childTaskId!);
      if (
        ![TaskStatus.COMPLETED, TaskStatus.CANCELLED].some(
          (value) => value === child.status,
        )
      )
        store.commands.enqueue({
          id: `${c.id}:child:${child.id}`,
          taskId: child.id,
          kind: c.kind,
          expectedRevision: child.revision,
          payload: {},
        });
    }
    if (active?.taskId === task.id) {
      active.stop =
        c.kind === "pause" ? TaskStatus.PAUSED : TaskStatus.CANCELLED;
      active.abort.abort();
    } else
      store.tasks.update(
        task.id,
        task.revision,
        {
          status: c.kind === "pause" ? TaskStatus.PAUSED : TaskStatus.CANCELLED,
          resumeStage: task.stage,
          reason: null,
        },
        event(`task.${c.kind}`),
      );
    if (!active || active.taskId !== task.id) {
      const run = storyService
        .listStoryRuns(task.featureId ?? task.id)
        .find((r) =>
          task.featureId
            ? r.childTaskId === task.id
            : r.storyId === storyService.getExecution(task.id)?.activeStoryId,
        );
      if (
        run &&
        run.state !== StoryRunState.COMPLETED &&
        run.state !== StoryRunState.PENDING
      )
        store.storyRuns.put(storyKey(run), {
          ...run,
          state: StoryRunState.INTERRUPTED,
          updatedAt: runtime.now(),
        });
    }
  } else if (c.kind === "configure") {
    if (task.status === TaskStatus.RUNNING)
      throw new Error(ApplicationErrorCode.STAGE_BOUNDARY_REQUIRED);
    const p = c.payload as {
      models?: unknown;
      deliveryMode?: unknown;
      executionMode?: unknown;
    };
    const patch: Partial<Task> = {};
    if (p.executionMode !== undefined)
      patch.executionMode = validation.executionMode(p.executionMode);
    if (p.models) patch.models = applyEffortPolicy(validation.models(p.models));
    if (p.deliveryMode === "local" || p.deliveryMode === "github")
      patch.deliveryMode = p.deliveryMode;
    store.tasks.update(
      task.id,
      task.revision,
      patch,
      event(EventType.TASK_CONFIGURED),
    );
  } else if (c.kind === "resume" || c.kind === "start") {
    if (
      ![
        TaskStatus.PAUSED,
        TaskStatus.INTERRUPTED,
        TaskStatus.BLOCKED,
        TaskStatus.QUEUED,
      ].some((value) => value === task.status)
    )
      throw new Error(DomainErrorCode.INVALID_STATUS);
    if (task.reason === ApplicationErrorCode.RUNTIME_STATE_UNKNOWN)
      throw new Error(ApplicationErrorCode.RUNTIME_RECONCILIATION_REQUIRED);
    const e = storyService.getExecution(task.id);
    const pending =
      e?.selection.mode === "separate_pr"
        ? storyService
            .listStoryRuns(task.id)
            .find((r) => r.childTaskId && r.state !== StoryRunState.COMPLETED)
        : undefined;
    if (pending) {
      const child = store.tasks.get(pending.childTaskId!);
      if (
        [TaskStatus.PAUSED, TaskStatus.INTERRUPTED, TaskStatus.BLOCKED].some(
          (value) => value === child.status,
        )
      )
        store.commands.enqueue({
          id: `${c.id}:child:${child.id}`,
          taskId: child.id,
          kind: "resume",
          expectedRevision: child.revision,
          payload: {},
        });
      store.tasks.update(
        task.id,
        task.revision,
        { status: TaskStatus.BLOCKED, reason: TaskReason.STORY_RUNNING },
        event(EventType.TASK_RESUMED),
      );
    } else
      store.tasks.update(
        task.id,
        task.revision,
        { status: TaskStatus.QUEUED, reason: null },
        event(EventType.TASK_RESUMED),
      );
  }
}
