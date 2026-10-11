import { DomainErrorCode } from "../../domain/constants/domain-error-code";
import { ApplicationErrorCode, EventType } from "../constants/index";
import { PipelineStage } from "../../domain/constants/pipeline-stage";
import { TaskStatus } from "../../domain/constants/task-status";
import type { ValidationPort } from "../validation";
import type { RuntimePort } from "../runtime";
import type { ApplicationStore } from "../ports";
import { type PlanComment, type Plan } from "../../domain/contracts";
import { validatePlan } from "../../domain/acceptance";
import type { StoryService } from "../stories";
export class PlanService {
  constructor(
    private readonly store: Pick<
      ApplicationStore,
      "atomic" | "tasks" | "plans" | "planComments"
    >,
    private readonly stories: Pick<StoryService, "validateStoryReplan">,
    private readonly validation: ValidationPort,
    private readonly runtime: RuntimePort,
  ) {}
  savePlan(taskId: string, raw: Plan) {
    const store = this.store;

    return store.atomic(() => {
      const task = store.tasks.get(taskId),
        plan = this.validation.plan(raw);
      if (
        plan.taskId !== task.id ||
        plan.sourceCommit !== task.sourceCommit ||
        plan.version !== (task.planVersion ?? 0) + 1
      )
        throw new Error(DomainErrorCode.STALE_PLAN);
      if (task.splitIntoStories && !plan.stories)
        throw new Error(ApplicationErrorCode.STORIES_REQUIRED);
      this.stories.validateStoryReplan(task, plan);
      const key = `${taskId}:${plan.version}`;
      if (store.plans.get(key))
        throw new Error(ApplicationErrorCode.IMMUTABLE_PLAN);
      store.plans.put(key, plan);
      const errors = validatePlan(plan);
      return store.tasks.update(
        taskId,
        task.revision,
        {
          planVersion: plan.version,
          approvedPlanVersion: null,
          stage: PipelineStage.PLAN,
          status: errors.length
            ? TaskStatus.WAITING_INPUT
            : TaskStatus.WAITING_APPROVAL,
          reason: errors.length ? errors.join(",") : null,
        },
        {
          type: EventType.PLAN_CREATED,
          data: { version: plan.version, errors },
        },
      );
    });
  }
  planComments(taskId: string): PlanComment[] {
    const store = this.store;

    return (store.planComments.list() as PlanComment[])
      .filter((c) => c.taskId === taskId)
      .sort((a, b) => a.at - b.at);
  }
  private editablePlan(taskId: string, version: number) {
    const store = this.store;

    const task = store.tasks.get(taskId);
    if (task.planVersion !== version)
      throw new Error(DomainErrorCode.STALE_PLAN);
    if (
      task.stage !== PipelineStage.PLAN ||
      ![TaskStatus.WAITING_APPROVAL, TaskStatus.WAITING_INPUT].some(
        (value) => value === task.status,
      )
    )
      throw new Error(DomainErrorCode.INVALID_STATUS);
    const plan = this.validation.plan(store.plans.get(`${taskId}:${version}`));
    return { task, plan };
  }
  addPlanComment(taskId: string, raw: unknown) {
    const store = this.store;

    const input = this.validation.comment(raw);
    return store.atomic(() => {
      const { task, plan } = this.editablePlan(taskId, input.version);
      const targets = [
        "general",
        ...plan.steps.map((s) => `step:${s.id}`),
        ...plan.criteria.map((c) => `criterion:${c.id}`),
        ...plan.checks.map((c) => `check:${c.id}`),
      ];
      if (!targets.includes(input.target))
        throw new Error(ApplicationErrorCode.INVALID_COMMENT_TARGET);
      const comment: PlanComment = {
        ...input,
        id: this.runtime.id(),
        taskId,
        at: this.runtime.now(),
      };
      store.planComments.put(comment.id, comment);
      store.tasks.update(
        taskId,
        task.revision,
        {},
        { type: EventType.PLAN_COMMENTED, data: comment },
      );
      return comment;
    });
  }
  requestPlanRevision(taskId: string, raw: unknown) {
    const store = this.store;

    const { version } = this.validation.revision(raw);
    return store.atomic(() => {
      const { task } = this.editablePlan(taskId, version);
      if (!this.planComments(taskId).some((c) => c.version === version))
        throw new Error(ApplicationErrorCode.PLAN_FEEDBACK_REQUIRED);
      return store.tasks.update(
        taskId,
        task.revision,
        {
          approvedPlanVersion: null,
          stage: PipelineStage.PLAN,
          status: TaskStatus.QUEUED,
          reason: null,
        },
        { type: EventType.PLAN_REVISION_REQUESTED, data: { version } },
      );
    });
  }
}
