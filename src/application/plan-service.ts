import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ApplicationStore } from "./ports";
import {
  PlanSchema,
  PlanCommentInputSchema,
  type PlanComment,
  type Plan,
} from "../core/contracts";
import { validatePlan } from "../core/acceptance";
import type { StoryService } from "./story-service";
export class PlanService {
  constructor(
    private readonly store: ApplicationStore,
    private readonly stories: Pick<StoryService, "validateStoryReplan">,
  ) {}
  savePlan(taskId: string, raw: Plan) {
    const store = this.store;

    return store.atomic(() => {
      const task = store.getTask(taskId),
        plan = PlanSchema.parse(raw);
      if (
        plan.taskId !== task.id ||
        plan.sourceCommit !== task.sourceCommit ||
        plan.version !== (task.planVersion ?? 0) + 1
      )
        throw new Error("stale_plan");
      if (task.splitIntoStories && !plan.stories)
        throw new Error("stories_required");
      this.stories.validateStoryReplan(task, plan);
      const key = `${taskId}:${plan.version}`;
      if (store.getRecord("plan", key)) throw new Error("immutable_plan");
      store.putRecord("plan", key, plan);
      const errors = validatePlan(plan);
      return store.updateTask(
        taskId,
        task.revision,
        {
          planVersion: plan.version,
          approvedPlanVersion: null,
          stage: "plan",
          status: errors.length ? "waiting_input" : "waiting_approval",
          reason: errors.length ? errors.join(",") : null,
        },
        { type: "plan.created", data: { version: plan.version, errors } },
      );
    });
  }
  planComments(taskId: string): PlanComment[] {
    const store = this.store;

    return (store.listRecords("plan-comment") as PlanComment[])
      .filter((c) => c.taskId === taskId)
      .sort((a, b) => a.at - b.at);
  }
  private editablePlan(taskId: string, version: number) {
    const store = this.store;

    const task = store.getTask(taskId);
    if (task.planVersion !== version) throw new Error("stale_plan");
    if (
      task.stage !== "plan" ||
      !["waiting_approval", "waiting_input"].includes(task.status)
    )
      throw new Error("invalid_status");
    const plan = PlanSchema.parse(
      store.getRecord("plan", `${taskId}:${version}`),
    );
    return { task, plan };
  }
  addPlanComment(taskId: string, raw: unknown) {
    const store = this.store;

    const input = PlanCommentInputSchema.parse(raw);
    return store.atomic(() => {
      const { task, plan } = this.editablePlan(taskId, input.version);
      const targets = [
        "general",
        ...plan.steps.map((s) => `step:${s.id}`),
        ...plan.criteria.map((c) => `criterion:${c.id}`),
        ...plan.checks.map((c) => `check:${c.id}`),
      ];
      if (!targets.includes(input.target))
        throw new Error("invalid_comment_target");
      const comment: PlanComment = {
        ...input,
        id: randomUUID(),
        taskId,
        at: Date.now(),
      };
      store.putRecord("plan-comment", comment.id, comment);
      store.updateTask(
        taskId,
        task.revision,
        {},
        { type: "plan.commented", data: comment },
      );
      return comment;
    });
  }
  requestPlanRevision(taskId: string, raw: unknown) {
    const store = this.store;

    const { version } = z
      .object({ version: z.number().int().positive() })
      .parse(raw);
    return store.atomic(() => {
      const { task } = this.editablePlan(taskId, version);
      if (!this.planComments(taskId).some((c) => c.version === version))
        throw new Error("plan_feedback_required");
      return store.updateTask(
        taskId,
        task.revision,
        {
          approvedPlanVersion: null,
          stage: "plan",
          status: "queued",
          reason: null,
        },
        { type: "plan.revision_requested", data: { version } },
      );
    });
  }
}
