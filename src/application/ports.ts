import type {
  Task,
  NewTask,
  Plan,
  Repository,
  RepoProfile,
  PlanComment,
  StoryRun,
  StoryExecution,
  Review,
  Analysis,
  ModelChoice,
  Stage,
  ControlCommand,
  Event,
} from "../domain/contracts";
import type { CheckResult } from "../domain/evidence";
import type { Settings } from "./models";
import type { Bundle, NativeChildResult } from "./execution-contracts";
import type { Attempt } from "./pipeline-contracts";
export type Delivery = {
  mode: "github" | "local";
  commit: string;
  reportPath: string;
  prUrl: string | null;
};
export type StoryEvidence = {
  storyId: string | null;
  planVersion: number | null;
  baselineCommit: string;
};
export type AcceptanceRecord = {
  passed: boolean;
  errors: string[];
  fingerprint: string;
};
export type EffectRecord = {
  state: string;
  parent?: string;
  commit?: string;
  head?: string;
  url?: string;
  headCommit?: string;
  base?: string;
  [key: string]: unknown;
};
export type ArtifactRecord = {
  id: string;
  taskId: string;
  path: string;
  type: string;
};
export type RuntimeRecord = {
  stage: Stage;
  model: ModelChoice;
  bundleHash: string;
  attemptId: string;
  state: "preparing" | "running" | "stopped" | "unknown";
  threadId: string | null;
  turnId?: string | null;
  child?:
    | NativeChildResult
    | { threadId: string; parentThreadId: string; model: ModelChoice };
  parentModel?: ModelChoice;
  usage?: unknown;
};
export type ParentRecord = { threadId: string; model?: ModelChoice };
export type ApprovalRecord = {
  id: string;
  taskId: string;
  requestId: string | number;
  method: string;
  params: unknown;
  decision: string | null;
};
export type HealthRecord = { at: number; owner?: string };
export type OwnershipRecord = { bootId: string | null; workerPid: number };
export type ExclusionRecord = {
  taskId: string;
  reason: string;
  bootId: string | null;
};
export type PreparationRecord = {
  path: string;
  sourceCommit: string;
  baseCommit: string;
};
export type AnswerRecord = { answer: string; at: number };
export type SessionRecord = { csrf: string; expiresAt: number };
export interface UnitOfWork {
  atomic<T>(work: () => T): T;
}
export interface ApplicationStore extends UnitOfWork {
  tasks: {
    get(id: string): Task;
    list(): Task[];
    create(task: NewTask): Task;
    update(
      id: string,
      expectedRevision: number,
      patch: Partial<Task>,
      event: { type: string; data: unknown },
    ): Task;
  };
  events: {
    add(taskId: string, type: string, data: unknown): void;
    list(taskId: string, after: number): Event[];
  };
  commands: {
    enqueue(command: ControlCommand): boolean;
    next(): ControlCommand | null;
    running(): ControlCommand[];
    finish(id: string, outcome: unknown): void;
  };
  registry: { remove(repositoryId: string): string[] };
  plans: {
    get(id: string): Plan | null;
    put(id: string, value: Plan): void;
    list(): Plan[];
    delete(id: string): void;
  };
  repositories: {
    get(id: string): Repository | null;
    put(id: string, value: Repository): void;
    list(): Repository[];
    delete(id: string): void;
  };
  settings: {
    get(id: string): Settings | null;
    put(id: string, value: Settings): void;
    list(): Settings[];
    delete(id: string): void;
  };
  profiles: {
    get(id: string): RepoProfile | null;
    put(id: string, value: RepoProfile): void;
    list(): RepoProfile[];
    delete(id: string): void;
  };
  planComments: {
    get(id: string): PlanComment | null;
    put(id: string, value: PlanComment): void;
    list(): PlanComment[];
    delete(id: string): void;
  };
  storyRuns: {
    get(id: string): StoryRun | null;
    put(id: string, value: StoryRun): void;
    list(): StoryRun[];
    delete(id: string): void;
  };
  storyExecutions: {
    get(id: string): StoryExecution | null;
    put(id: string, value: StoryExecution): void;
    list(): StoryExecution[];
    delete(id: string): void;
  };
  storyEvidence: {
    get(id: string): StoryEvidence | null;
    put(id: string, value: StoryEvidence): void;
    list(): StoryEvidence[];
    delete(id: string): void;
  };
  checks: {
    get(id: string): CheckResult[] | null;
    put(id: string, value: CheckResult[]): void;
    list(): CheckResult[][];
    delete(id: string): void;
  };
  reviews: {
    get(id: string): Review | null;
    put(id: string, value: Review): void;
    list(): Review[];
    delete(id: string): void;
  };
  acceptance: {
    get(id: string): AcceptanceRecord | null;
    put(id: string, value: AcceptanceRecord): void;
    list(): AcceptanceRecord[];
    delete(id: string): void;
  };
  deliveries: {
    get(id: string): Delivery | null;
    put(id: string, value: Delivery): void;
    list(): Delivery[];
    delete(id: string): void;
  };
  effects: {
    get(id: string): EffectRecord | null;
    put(id: string, value: EffectRecord): void;
    list(): EffectRecord[];
    delete(id: string): void;
  };
  artifacts: {
    get(id: string): ArtifactRecord | null;
    put(id: string, value: ArtifactRecord): void;
    list(): ArtifactRecord[];
    delete(id: string): void;
  };
  analyses: {
    get(id: string): Analysis | null;
    put(id: string, value: Analysis): void;
    list(): Analysis[];
    delete(id: string): void;
  };
  bundles: {
    get(id: string): Bundle | null;
    put(id: string, value: Bundle): void;
    list(): Bundle[];
    delete(id: string): void;
  };
  attempts: {
    get(id: string): Attempt | null;
    put(id: string, value: Attempt): void;
    list(): Attempt[];
    delete(id: string): void;
  };
  runtimes: {
    get(id: string): RuntimeRecord | null;
    put(id: string, value: RuntimeRecord): void;
    list(): RuntimeRecord[];
    delete(id: string): void;
  };
  parents: {
    get(id: string): ParentRecord | null;
    put(id: string, value: ParentRecord): void;
    list(): ParentRecord[];
    delete(id: string): void;
  };
  approvals: {
    get(id: string): ApprovalRecord | null;
    put(id: string, value: ApprovalRecord): void;
    list(): ApprovalRecord[];
    delete(id: string): void;
  };
  health: {
    get(id: string): HealthRecord | null;
    put(id: string, value: HealthRecord): void;
    list(): HealthRecord[];
    delete(id: string): void;
  };
  ownership: {
    get(id: string): OwnershipRecord | null;
    put(id: string, value: OwnershipRecord): void;
    list(): OwnershipRecord[];
    delete(id: string): void;
  };
  exclusions: {
    get(id: string): ExclusionRecord | null;
    put(id: string, value: ExclusionRecord): void;
    list(): ExclusionRecord[];
    delete(id: string): void;
  };
  preparations: {
    get(id: string): PreparationRecord | null;
    put(id: string, value: PreparationRecord): void;
    list(): PreparationRecord[];
    delete(id: string): void;
  };
  answers: {
    get(id: string): AnswerRecord | null;
    put(id: string, value: AnswerRecord): void;
    list(): AnswerRecord[];
    delete(id: string): void;
  };
  sessions: {
    get(id: string): SessionRecord | null;
    put(id: string, value: SessionRecord): void;
    list(): SessionRecord[];
    delete(id: string): void;
  };
}
export interface StoryRepositoryPort {
  resolveCommit(
    root: string,
    ref: string,
    signal?: AbortSignal,
  ): Promise<string>;
  validateBranch(root: string, branch: string): Promise<void>;
  fetchBranch(
    root: string,
    remote: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<void>;
  assertAncestor(
    root: string,
    ancestor: string,
    commit: string,
    signal?: AbortSignal,
  ): Promise<void>;
  head(root: string): Promise<string>;
  headParent(root: string): Promise<string>;
  headMessage(root: string): Promise<string>;
  fingerprintWorktree(
    root: string,
    excluded: string[],
    sourceCommit: string,
  ): Promise<string>;
}
