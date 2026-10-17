import { ApplicationErrorCode, EventType } from "../constants/index";
import { TaskStatus } from "../../domain/constants/task-status";
import { PipelineStage } from "../../domain/constants/pipeline-stage";
import { DomainErrorCode } from "../../domain/constants/domain-error-code";
import type { StoryService } from "../stories";
import type { Task, ControlCommand } from "../../domain/contracts";
import type { ApplicationStore } from "../ports";
import type { RuntimePort } from "../runtime";
import type { ValidationPort } from "../validation";
import { workerEvent as event } from "./events";
import { planKey } from "../../domain/utils/record-key";
import type { PlanService } from "../planning";
import type { StorySelection } from "../../domain/contracts";
import { approvePlan } from "../../domain/transitions";

export function processPlanControl(
  store: ApplicationStore,
  storyService: StoryService,
  planService: PlanService,
  task: Task,
  c: ControlCommand,
  validation: ValidationPort,
  runtime: RuntimePort,
) {
  if (c.kind === "approve") {
    const plan = validation.plan(
      store.plans.get(planKey(task.id, task.planVersion)),
    );
    const version = (c.payload as { version: number })?.version;
    if (
      planService.planComments(task.id).some((c) => c.version === plan.version)
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
  }
}
