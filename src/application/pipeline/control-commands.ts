import { planKey } from "../../domain/utils/record-key";
import { ApplicationErrorCode, EventType } from "../constants/index";
import { TaskStatus } from "../../domain/constants/task-status";
import { PipelineStage } from "../../domain/constants/pipeline-stage";
import { DomainErrorCode } from "../../domain/constants/domain-error-code";
import { PlanService } from "../planning";
import { StoryService, storyKey } from "../stories";

import { applyEffortPolicy } from "../../domain/model-policy";

import type { ApplicationStore } from "../ports";
import type { RuntimePort } from "../runtime";
import type { ValidationPort } from "../validation";

import {
  type Task,
  type ControlCommand,
  type StorySelection,
} from "../../domain/contracts";
import { approvePlan } from "../../domain/transitions";

import type { ActiveStageAttempt } from "../pipeline-contracts";
import { workerEvent as event } from "./events";
export function processControlCommand(
  store: ApplicationStore,
  storyService: StoryService,
  planService: PlanService,
  active: ActiveStageAttempt | null,
  c: ControlCommand,
  validation: ValidationPort,
  runtime: RuntimePort,
) {
  try {
    const task = store.tasks.get(c.taskId);
    if (task.revision !== c.expectedRevision)
      throw new Error(ApplicationErrorCode.REVISION_CONFLICT);
    if (
      [TaskStatus.COMPLETED, TaskStatus.CANCELLED].some(
        (value) => value === task.status,
      )
    )
      throw new Error(ApplicationErrorCode.TERMINAL_TASK);
    if (c.kind === "pause" || c.kind === "cancel") {
      for (const run of storyService
        .listStoryRuns(task.id)
        .filter((r) => r.childTaskId && r.state !== TaskStatus.COMPLETED)) {
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
            status:
              c.kind === "pause" ? TaskStatus.PAUSED : TaskStatus.CANCELLED,
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
          run.state !== TaskStatus.COMPLETED &&
          run.state !== "pending"
        )
          store.storyRuns.put(storyKey(run), {
            ...run,
            state: TaskStatus.INTERRUPTED,
            updatedAt: runtime.now(),
          });
      }
    } else if (c.kind === "approve") {
      const plan = validation.plan(
        store.plans.get(planKey(task.id, task.planVersion)),
      );
      const version = (c.payload as { version: number })?.version;
      if (
        planService
          .planComments(task.id)
          .some((c) => c.version === plan.version)
      )
        throw new Error(ApplicationErrorCode.PLAN_FEEDBACK_REQUIRES_REVISION);
      const approved = approvePlan(task, plan, version);
      store.atomic(() => {
        if (task.splitIntoStories)
          storyService.approveStorySelection(
            task,
            (c.payload as { selection: StorySelection }).selection,
          );
        store.tasks.update(
          task.id,
          task.revision,
          {
            approvedPlanVersion: approved.approvedPlanVersion,
            stage: PipelineStage.PREPARE,
            status: TaskStatus.QUEUED,
            reason: null,
          },
          event(EventType.PLAN_APPROVED, {
            version,
            selection: (c.payload as { selection?: unknown }).selection,
          }),
        );
      });
    } else if (c.kind === "comment") {
      planService.addPlanComment(task.id, c.payload);
    } else if (c.kind === "revise") {
      planService.requestPlanRevision(task.id, c.payload);
    } else if (c.kind === "answer") {
      if (task.status !== TaskStatus.WAITING_INPUT)
        throw new Error(DomainErrorCode.INVALID_STATUS);
      const answer = (c.payload as { answer: string })?.answer;
      if (typeof answer !== "string" || !answer.trim())
        throw new Error(ApplicationErrorCode.ANSWER_REQUIRED);
      store.atomic(() => {
        store.answers.put(`${task.id}:${task.revision}`, {
          answer,
          at: runtime.now(),
        });
        store.tasks.update(
          task.id,
          task.revision,
          {
            requirement: task.requirement + `\nUser clarification: ${answer}`,
            approvedPlanVersion: null,
            stage: PipelineStage.ANALYZE,
            status: TaskStatus.QUEUED,
            reason: null,
          },
          event("requirement.answered"),
        );
      });
    } else if (c.kind === "grant") {
      const payload = c.payload as { id: string; decision: string };
      const approval = store.approvals.get(payload.id);
      if (
        !approval ||
        approval.taskId !== task.id ||
        approval.decision ||
        !["accept", "decline"].includes(payload.decision)
      )
        throw new Error(ApplicationErrorCode.APPROVAL_REQUEST_EXPIRED);
      store.approvals.put(payload.id, {
        ...approval,
        decision: payload.decision,
      });
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
      if (p.models)
        patch.models = applyEffortPolicy(validation.models(p.models));
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
              .find((r) => r.childTaskId && r.state !== TaskStatus.COMPLETED)
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
          { status: TaskStatus.BLOCKED, reason: "story_running" },
          event(EventType.TASK_RESUMED),
        );
      } else
        store.tasks.update(
          task.id,
          task.revision,
          { status: TaskStatus.QUEUED, reason: null },
          event(EventType.TASK_RESUMED),
        );
    } else throw new Error(ApplicationErrorCode.APPROVAL_REQUEST_EXPIRED);
    store.commands.finish(c.id, { ok: true });
  } catch (error) {
    store.commands.finish(c.id, { error: String(error) });
    store.events.add(c.taskId, EventType.COMMAND_REJECTED, {
      commandId: c.id,
      error: String(error),
    });
  }
}
