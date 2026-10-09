export type {
  DirectTurnInput,
  DelegatedStageInput,
  AgentInput,
  AgentEvent,
  AgentRun,
  NativeChildResult,
} from "../../application/agent-execution";
import type { AgentExecutionPort } from "../../application/agent-execution";
import type { ModelCatalogPort } from "../../application/models";
export interface AgentClient extends AgentExecutionPort, ModelCatalogPort {
  close(): Promise<void>;
}
