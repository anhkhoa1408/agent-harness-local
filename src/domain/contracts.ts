export const stages = [
  "discover",
  "analyze",
  "plan",
  "prepare",
  "implement",
  "verify",
  "review",
  "repair",
  "deliver",
] as const;

export const aiStages = [
  "discover",
  "analyze",
  "plan",
  "implement",
  "review",
  "repair",
] as const;

export type Stage =
  | "discover"
  | "analyze"
  | "plan"
  | "prepare"
  | "implement"
  | "verify"
  | "review"
  | "repair"
  | "deliver";

export const statuses = [
  "queued",
  "running",
  "waiting_input",
  "waiting_approval",
  "blocked",
  "paused",
  "interrupted",
  "completed",
  "cancelled",
  "failed",
] as const;
export type Status = (typeof statuses)[number];

export type AiStage = (typeof aiStages)[number];

export type ModelChoice = { model: string; effort: string };

export type ModelMap = Record<AiStage, ModelChoice>;

export type Task = NewTask & {
  id: string;
  stage: Stage;
  status: Status;
  reason: string | null;
  revision: number;
  planVersion: number | null;
  approvedPlanVersion: number | null;
  repairCount: number;
  worktree: string | null;
  branch: string;
  resumeStage: Stage | null;
  createdAt: number;
  updatedAt: number;
};

export type ExecutionMode = "manual" | "auto";
export type NewTask = {
  repositoryId: string;
  title: string;
  requirement: string;
  sourceCommit: string;
  targetBranch: string;
  deliveryMode: "github" | "local";
  models: ModelMap;
  splitIntoStories?: boolean;
  featureId?: string;
  storyId?: string;
  executionMode?: ExecutionMode;
};

export type ControlCommand = {
  id: string;
  taskId: string;
  kind:
    | "start"
    | "answer"
    | "approve"
    | "pause"
    | "resume"
    | "cancel"
    | "configure"
    | "grant"
    | "comment"
    | "revise";
  expectedRevision: number;
  payload: unknown;
};

export type Event = {
  seq: number;
  taskId: string;
  type: string;
  data: unknown;
  at: number;
};

export type Repository = {
  id: string;
  root: string;
  baseBranch: string;
  remote: string | null;
  head: string;
  dirty: boolean;
};

export type CommandSpec = {
  id: string;
  executable: string;
  args: string[];
  cwd: string;
  envNames: string[];
  timeoutMs: number;
  reportPath: string | null;
};

export type RepoProfile = {
  repositoryId: string;
  sourceCommit: string;
  languages: string[];
  areas: { path: string; purpose: string }[];
  commands: CommandSpec[];
  prerequisites: string[];
  evidence: { path: string; reason: string }[];
  unknowns: string[];
};

export type CheckSpec = CommandSpec & {
  kind: "unit" | "integration" | "e2e" | "build" | "typecheck";
  required: boolean;
  minimumTests: number;
  reportFormat: "junit" | "tap" | "exit-code";
  successPattern: string | null;
};

export type Story = {
  id: string;
  title: string;
  outcome: string;
  points: 1 | 2 | 5 | 3 | 8;
  dependsOn: string[];
  criterionIds: string[];
  stepIds: string[];
};

export type StorySelection = {
  planVersion: number;
  storyIds: string[];
  mode: "separate_pr" | "shared_pr";
  continueAutomatically: boolean;
};

export type StoryRun = {
  featureId: string;
  planVersion: number;
  storyId: string;
  state: "pending" | "running" | "completed" | "interrupted" | "blocked";
  childTaskId?: string;
  baselineCommit: string;
  commit?: string;
  checkpointPath?: string;
  checkpointArtifactId?: string;
  prUrl?: string | null;
  updatedAt: number;
};

export type StoryExecution = {
  selection: StorySelection;
  activeStoryId: string | null;
  baselineCommit: string;
  aggregate: boolean;
};

export type UiVerification = {
  screenshots: {
    id: string;
    checkId: string;
    path: string;
    criterionIds: string[];
    viewport: { width: number; height: number };
    referencePath: string | null;
  }[];
};
export type VisualReview = {
  screenshots: { id: string; passed: boolean; evidence: string }[];
};
export type Plan = {
  taskId: string;
  version: number;
  sourceCommit: string;
  scope: string;
  outOfScope: string[];
  criteria: { id: string; description: string; checkIds: string[] }[];
  steps: {
    id: string;
    description: string;
    files: string[];
    dependsOn: string[];
    inputs: string;
    outputs: string;
    verification: string;
  }[];
  checks: CheckSpec[];
  dependencies: string[];
  environment: string[];
  unresolved: string[];
  stories?: Story[];
  uiVerification?: UiVerification | null;
};

export type Analysis = {
  requirement: string;
  questions: { id: string; question: string; recommendation: string }[];
};

export type Review = {
  taskId: string;
  fingerprint: string;
  planVersion: number;
  findings: {
    id: string;
    severity: "critical" | "important" | "minor";
    criterionId: string | null;
    path: string;
    line: number;
    description: string;
    evidence: string;
    status: "open" | "resolved" | "disputed";
  }[];
  criteria: { id: string; passed: boolean; evidence: string }[];
  verdict: "pass" | "changes_requested" | "needs_input";
};

export type PlanComment = { version: number; target: string; text: string } & {
  id: string;
  taskId: string;
  at: number;
};
