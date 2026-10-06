import { PlanService } from "../application/plan-service";
import { StoryService, storyKey } from "../application/story-service";

import { applyEffortPolicy } from "../core/model-policy";

import type { Store } from "../storage/store";

import { ModelMapSchema, PlanSchema, type Task, type ControlCommand, type StorySelection } from "../core/contracts";
import { ExecutionModeSchema } from "../core/contracts";
import { approvePlan } from "../core/transitions";

import type { ActiveStageAttempt } from "./types";
import { workerEvent as event } from "./events";
export function processControlCommand(
  store: Store,
  storyService: StoryService,
  planService: PlanService,
  active: ActiveStageAttempt | null,
  c: ControlCommand,
) {
  try {
    const task = store.getTask(c.taskId);
    if (task.revision !== c.expectedRevision)
      throw new Error("revision_conflict");
    if (["completed", "cancelled"].includes(task.status))
      throw new Error("terminal_task");
    if (c.kind === "pause" || c.kind === "cancel") {
      for (const run of storyService
        .listStoryRuns(task.id)
        .filter((r) => r.childTaskId && r.state !== "completed")) {
        const child = store.getTask(run.childTaskId!);
        if (!["completed", "cancelled"].includes(child.status))
          store.enqueue({
            id: `${c.id}:child:${child.id}`,
            taskId: child.id,
            kind: c.kind,
            expectedRevision: child.revision,
            payload: {},
          });
      }
      if (active?.taskId === task.id) {
        active.stop = c.kind === "pause" ? "paused" : "cancelled";
        active.abort.abort();
      } else
        store.updateTask(
          task.id,
          task.revision,
          {
            status: c.kind === "pause" ? "paused" : "cancelled",
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
        if (run && run.state !== "completed" && run.state !== "pending")
          store.putRecord("story-run", storyKey(run), {
            ...run,
            state: "interrupted",
            updatedAt: Date.now(),
          });
      }
    } else if (c.kind === "approve") {
      const plan = PlanSchema.parse(
          store.getRecord("plan", `${task.id}:${task.planVersion}`),
        ),
        version = (c.payload as { version: number })?.version;
      if (
        planService
          .planComments(task.id)
          .some((c) => c.version === plan.version)
      )
        throw new Error("plan_feedback_requires_revision");
      const approved = approvePlan(task, plan, version);
      store.atomic(() => {
        if (task.splitIntoStories)
          storyService.approveStorySelection(
            task,
            (c.payload as { selection: StorySelection }).selection,
          );
        store.updateTask(
          task.id,
          task.revision,
          {
            approvedPlanVersion: approved.approvedPlanVersion,
            stage: "prepare",
            status: "queued",
            reason: null,
          },
          event("plan.approved", {
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
      if (task.status !== "waiting_input") throw new Error("invalid_status");
      const answer = (c.payload as { answer: string })?.answer;
      if (typeof answer !== "string" || !answer.trim())
        throw new Error("answer_required");
      store.atomic(() => {
        store.putRecord("answer", `${task.id}:${task.revision}`, {
          answer,
          at: Date.now(),
        });
        store.updateTask(
          task.id,
          task.revision,
          {
            requirement: task.requirement + `\nUser clarification: ${answer}`,
            approvedPlanVersion: null,
            stage: "analyze",
            status: "queued",
            reason: null,
          },
          event("requirement.answered"),
        );
      });
    } else if (c.kind === "grant") {
      const payload = c.payload as { id: string; decision: string };
      const approval = store.getRecord("approval", payload.id) as {
        taskId: string;
        decision: string | null;
      } | null;
      if (
        !approval ||
        approval.taskId !== task.id ||
        approval.decision ||
        !["accept", "decline"].includes(payload.decision)
      )
        throw new Error("approval_request_expired");
      store.putRecord("approval", payload.id, {
        ...approval,
        decision: payload.decision,
      });
    } else if (c.kind === "configure") {
      if (task.status === "running") throw new Error("stage_boundary_required");
      const p = c.payload as {
        models?: unknown;
        deliveryMode?: unknown;
        executionMode?: unknown;
      };
      const patch: Partial<Task> = {};
      if (p.executionMode !== undefined)
        patch.executionMode = ExecutionModeSchema.parse(p.executionMode);
      if (p.models)
        patch.models = applyEffortPolicy(ModelMapSchema.parse(p.models));
      if (p.deliveryMode === "local" || p.deliveryMode === "github")
        patch.deliveryMode = p.deliveryMode;
      store.updateTask(task.id, task.revision, patch, event("task.configured"));
    } else if (c.kind === "resume" || c.kind === "start") {
      if (!["paused", "interrupted", "blocked", "queued"].includes(task.status))
        throw new Error("invalid_status");
      if (task.reason === "runtime_state_unknown")
        throw new Error("runtime_reconciliation_required");
      const e = storyService.getExecution(task.id);
      const pending =
        e?.selection.mode === "separate_pr"
          ? storyService
              .listStoryRuns(task.id)
              .find((r) => r.childTaskId && r.state !== "completed")
          : undefined;
      if (pending) {
        const child = store.getTask(pending.childTaskId!);
        if (["paused", "interrupted", "blocked"].includes(child.status))
          store.enqueue({
            id: `${c.id}:child:${child.id}`,
            taskId: child.id,
            kind: "resume",
            expectedRevision: child.revision,
            payload: {},
          });
        store.updateTask(
          task.id,
          task.revision,
          { status: "blocked", reason: "story_running" },
          event("task.resumed"),
        );
      } else
        store.updateTask(
          task.id,
          task.revision,
          { status: "queued", reason: null },
          event("task.resumed"),
        );
    } else throw new Error("approval_request_expired");
    store.finishCommand(c.id, { ok: true });
  } catch (error) {
    store.finishCommand(c.id, { error: String(error) });
    store.addEvent(c.taskId, "command.rejected", {
      commandId: c.id,
      error: String(error),
    });
  }
}
