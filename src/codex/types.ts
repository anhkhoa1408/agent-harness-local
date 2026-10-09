export * from "../application/agent-execution";
import type {AgentExecutionPort} from "../application/agent-execution";
import type {ModelCatalogPort} from "../application/models";
export interface AgentClient extends AgentExecutionPort,ModelCatalogPort {close():Promise<void>;}
