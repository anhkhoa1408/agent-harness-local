import type {
  Task,
  Plan,
  Repository,
  StoryExecution,
} from "../../domain/contracts";
import type { ApplicationStore } from "../ports";
import type { ValidationPort } from "../validation";
import type { StoryService } from "../stories";
import type { PlanService } from "../planning";
import type { StageAgentExecutor, ContextPort } from "../agent-execution";
import type { VerificationPort } from "../verification";
import type { DeliveryDependencies } from "../delivery";
export interface PipelineRepositoryPort {
  sourceDocuments(
    repo: Repository,
  ): Promise<{ path: string; content: string }[]>;
  prepareWorktree(repo: Repository, task: Task): Promise<string>;
  synchronizeBase(
    repo: Repository,
    task: Task,
    path: string,
    signal: AbortSignal,
    resolve: (conflicts: string[]) => Promise<void>,
  ): Promise<{ sourceCommit: string; baseCommit: string }>;
  diff(root: string, source: string): Promise<string>;
}
export interface ArtifactLayoutPort {
  stageArtifacts(task: Task, execution: StoryExecution | null): string;
}
export type StageHandlerContext = {
  store: ApplicationStore;
  validation: ValidationPort;
  storyService: StoryService;
  planService: PlanService;
  executor: StageAgentExecutor;
  repositoryIO: PipelineRepositoryPort;
  contextIO: ContextPort;
  verificationIO: VerificationPort;
  deliveryIO: DeliveryDependencies;
  artifacts(task: Task): string;
  repository(task: Task): Repository;
  planOf(task: Task): Plan;
  stageTask(task: Task): unknown;
  fingerprint(task: Task, plan: Plan): Promise<string>;
};
export type StageContext = Omit<StageHandlerContext, "executor">;
