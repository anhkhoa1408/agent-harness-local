import type { StageContext } from "./stage-context";
import type { StageAgentExecutor } from "./stage-agent-executor";
export type StageHandlerContext = StageContext & {
  executor: StageAgentExecutor;
};
