import { TaskStatus } from "../../domain/constants/task-status";
import { PipelineStage } from "../../domain/constants/pipeline-stage";
import { stages, type Task } from "../../domain/contracts";
import type { Handlers } from "../pipeline-contracts";
import type { StageHandlerContext } from "./context";
import { createMutationHandler } from "./mutation-stage";
import { createDiscoverHandler } from "./handlers/discover";
import { createAnalyzeHandler } from "./handlers/analyze";
import { createPlanHandler } from "./handlers/plan";
import { createPrepareHandler } from "./handlers/prepare";
import { createVerifyHandler } from "./handlers/verify";
import { createDeliverHandler } from "./handlers/deliver";
import { createReviewHandler } from "./handlers/review";
export function unavailableHandlers(): Handlers {
  return Object.fromEntries(
    stages.map((stage) => [
      stage,
      async () => ({
        stage,
        status: TaskStatus.BLOCKED,
        reason: "capability_unavailable",
        output: null,
      }),
    ]),
  ) as unknown as Handlers;
}
export function createHandlers(context: StageHandlerContext): Handlers {
  const { storyService } = context;
  const handlers: Handlers = {
    ...unavailableHandlers(),
    discover: createDiscoverHandler(context),
    analyze: createAnalyzeHandler(context),
    plan: createPlanHandler(context),
    prepare: createPrepareHandler(context),
    implement: createMutationHandler(context),
    repair: createMutationHandler(context),
    verify: createVerifyHandler(context),
    deliver: createDeliverHandler(context),
    review: createReviewHandler(context),
  };
  return Object.fromEntries(
    stages.map((stage) => [
      stage,
      async (task: Task, signal: AbortSignal) => {
        if (
          [
            PipelineStage.IMPLEMENT,
            PipelineStage.REPAIR,
            PipelineStage.VERIFY,
            PipelineStage.REVIEW,
          ].some((value) => value === stage)
        )
          await storyService.assertSharedHead(task);
        return handlers[stage](
          [
            PipelineStage.IMPLEMENT,
            PipelineStage.REPAIR,
            PipelineStage.VERIFY,
            PipelineStage.REVIEW,
            PipelineStage.DELIVER,
          ].some((value) => value === stage)
            ? storyService.getEffectiveTask(task)
            : task,
          signal,
        );
      },
    ]),
  ) as Handlers;
}
