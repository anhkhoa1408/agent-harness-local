import {createRepositories} from "../infrastructure/persistence/repositories";
import {contextIO,packetIO,supportsApproval} from "../infrastructure/context/preparation";
import {systemRuntime} from "../infrastructure/runtime/system";
import {ModelService} from "../application/models";
import {validation} from "../infrastructure/validation/gateway";
import { stages, type Task } from "../core/contracts";
import type { Store } from "../storage/store";
import type { AgentClient } from "../codex/types";
import type { Handlers } from "./types";
import { createStageContext } from "./stage-context";
import { StageAgentExecutor } from "./stage-agent-executor";
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
        status: "blocked",
        reason: "capability_unavailable",
        output: null,
      }),
    ]),
  ) as unknown as Handlers;
}
export function createHandlers(
  store: Store,
  client: AgentClient,
  data: string,
): Handlers {
  const base = createStageContext(store, data);
  const context = { ...base, executor: new StageAgentExecutor({...base,store:createRepositories(store)},client,new ModelService({get:()=>null,put:()=>{}},client),contextIO,packetIO,systemRuntime,supportsApproval) };
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
        if (["implement", "repair", "verify", "review"].includes(stage))
          await storyService.assertSharedHead(task);
        return handlers[stage](
          ["implement", "repair", "verify", "review", "deliver"].includes(stage)
            ? storyService.getEffectiveTask(task)
            : task,
          signal,
        );
      },
    ]),
  ) as Handlers;
}
