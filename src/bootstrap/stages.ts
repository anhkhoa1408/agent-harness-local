import { createStageContext } from "./stage-context";
import type { Store } from "../infrastructure/persistence/store";
import type { AgentClient } from "../infrastructure/codex/types";
import { StageAgentExecutor } from "../application/agent-execution";
import { ModelService } from "../application/models";
import { createHandlers as handlers } from "../application/pipeline/stages";
import {
  contextIO,
  packetIO,
  supportsApproval,
} from "../infrastructure/context/preparation";
import { systemRuntime } from "../infrastructure/runtime/system";
export { unavailableHandlers } from "../application/pipeline/stages";
export function createHandlers(
  store: Store,
  client: AgentClient,
  data: string,
) {
  const base = createStageContext(store, data);
  return handlers({
    ...base,
    executor: new StageAgentExecutor(
      base,
      client,
      new ModelService({ get: () => null, put: () => {} }, client),
      contextIO,
      packetIO,
      systemRuntime,
      supportsApproval,
    ),
  });
}
