import {
  MAX_TITLE_CHARACTERS,
  MAX_REQUIREMENT_CHARACTERS,
  MIN_CHECK_TIMEOUT_MS,
  MAX_CHECK_TIMEOUT_MS,
  MAX_SCREENSHOT_ID_CHARACTERS,
  MAX_VIEWPORT_PIXELS,
  MAX_SELECTED_SCREENSHOTS,
  MAX_VISUAL_EVIDENCE_CHARACTERS,
  MAX_STORY_ID_CHARACTERS,
  MAX_PLAN_COMMENT_CHARACTERS,
  MAX_COMMAND_ID_CHARACTERS,
} from "./limits";
import { z } from "zod";
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
export const StageSchema = z.enum(stages);
export const StatusSchema = z.enum([
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
]);
export type Stage = z.infer<typeof StageSchema>;
export type Status = z.infer<typeof StatusSchema>;
export type AiStage = (typeof aiStages)[number];
export const ModelChoiceSchema = z.object({
  model: z.string().min(1),
  effort: z.string().min(1),
});
export const ModelMapSchema = z.object(
  Object.fromEntries(aiStages.map((s) => [s, ModelChoiceSchema])) as Record<
    AiStage,
    typeof ModelChoiceSchema
  >,
);
export type ModelChoice = z.infer<typeof ModelChoiceSchema>;
export type ModelMap = z.infer<typeof ModelMapSchema>;
export const ExecutionModeSchema = z.enum(["manual", "auto"]);
export const NewTaskSchema = z.object({
  splitIntoStories: z.boolean().optional(),
  featureId: z.string().optional(),
  storyId: z.string().optional(),
  repositoryId: z.string().min(1),
  title: z.string().trim().min(1).max(MAX_TITLE_CHARACTERS),
  requirement: z.string().trim().min(1).max(MAX_REQUIREMENT_CHARACTERS),
  sourceCommit: z.string().regex(/^[a-f0-9]{40,64}$/),
  targetBranch: z.string().min(1),
  deliveryMode: z.enum(["github", "local"]),
  executionMode: ExecutionModeSchema.optional(),
  models: ModelMapSchema,
});
export const TaskSchema = NewTaskSchema.extend({
  id: z.string().min(1),
  stage: StageSchema,
  status: StatusSchema,
  reason: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  planVersion: z.number().int().positive().nullable(),
  approvedPlanVersion: z.number().int().positive().nullable(),
  repairCount: z.number().int().nonnegative(),
  worktree: z.string().nullable(),
  branch: z.string().min(1),
  resumeStage: StageSchema.nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Task = z.infer<typeof TaskSchema>;
export type NewTask = z.infer<typeof NewTaskSchema>;
export const ControlCommandSchema = z.object({
  id: z.string().min(1).max(MAX_COMMAND_ID_CHARACTERS),
  taskId: z.string().min(1),
  kind: z.enum([
    "start",
    "answer",
    "approve",
    "pause",
    "resume",
    "cancel",
    "configure",
    "grant",
    "comment",
    "revise",
  ]),
  expectedRevision: z.number().int().nonnegative(),
  payload: z.unknown(),
});
export type ControlCommand = z.infer<typeof ControlCommandSchema>;
export type Event = {
  seq: number;
  taskId: string;
  type: string;
  data: unknown;
  at: number;
};
export const RepositorySchema = z.object({
  id: z.string(),
  root: z.string(),
  baseBranch: z.string(),
  remote: z.string().nullable(),
  head: z.string(),
  dirty: z.boolean(),
});
export type Repository = z.infer<typeof RepositorySchema>;
export const CommandSpecSchema = z.object({
  id: z.string().min(1),
  executable: z.string().min(1),
  args: z.array(z.string()),
  cwd: z.string().min(1),
  envNames: z.array(z.string()),
  timeoutMs: z
    .number()
    .int()
    .min(MIN_CHECK_TIMEOUT_MS)
    .max(MAX_CHECK_TIMEOUT_MS),
  reportPath: z.string().nullable(),
});
export type CommandSpec = z.infer<typeof CommandSpecSchema>;
export const RepoProfileSchema = z.object({
  repositoryId: z.string(),
  sourceCommit: z.string(),
  languages: z.array(z.string()),
  areas: z.array(z.object({ path: z.string(), purpose: z.string() })),
  commands: z.array(CommandSpecSchema),
  prerequisites: z.array(z.string()),
  evidence: z.array(z.object({ path: z.string(), reason: z.string() })),
  unknowns: z.array(z.string()),
});
export type RepoProfile = z.infer<typeof RepoProfileSchema>;
export const CheckSpecSchema = CommandSpecSchema.extend({
  kind: z.enum(["unit", "integration", "e2e", "build", "typecheck"]),
  required: z.boolean(),
  minimumTests: z.number().int().nonnegative(),
  reportFormat: z.enum(["junit", "tap", "exit-code"]),
  successPattern: z.string().nullable(),
});
export type CheckSpec = z.infer<typeof CheckSpecSchema>;
export const UiVerificationSchema = z.object({
  screenshots: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-zA-Z0-9_-]+$/)
          .max(MAX_SCREENSHOT_ID_CHARACTERS),
        checkId: z.string().min(1),
        path: z.string().min(1),
        criterionIds: z.array(z.string().min(1)).min(1),
        viewport: z.object({
          width: z.number().int().min(1).max(MAX_VIEWPORT_PIXELS),
          height: z.number().int().min(1).max(MAX_VIEWPORT_PIXELS),
        }),
        referencePath: z.string().min(1).nullable(),
      }),
    )
    .min(1)
    .max(MAX_SELECTED_SCREENSHOTS),
});
export const VisualReviewSchema = z.object({
  screenshots: z
    .array(
      z.object({
        id: z.string(),
        passed: z.boolean(),
        evidence: z.string().trim().min(1).max(MAX_VISUAL_EVIDENCE_CHARACTERS),
      }),
    )
    .max(MAX_SELECTED_SCREENSHOTS),
});
export const StorySchema = z.object({
  id: z
    .string()
    .min(1)
    .max(MAX_STORY_ID_CHARACTERS)
    .regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().min(1),
  outcome: z.string().min(1),
  points: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(5),
    z.literal(8),
  ]),
  dependsOn: z.array(z.string()),
  criterionIds: z.array(z.string()).min(1),
  stepIds: z.array(z.string()).min(1),
});
export type Story = z.infer<typeof StorySchema>;
export const StorySelectionSchema = z.object({
  planVersion: z.number().int().positive(),
  storyIds: z.array(z.string()).min(1),
  mode: z.enum(["separate_pr", "shared_pr"]),
  continueAutomatically: z.boolean().default(false),
});
export type StorySelection = z.infer<typeof StorySelectionSchema>;
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
export const PlanSchema = z.object({
  stories: z.array(StorySchema).min(1).optional(),
  taskId: z.string(),
  version: z.number().int().positive(),
  sourceCommit: z.string(),
  scope: z.string().min(1),
  outOfScope: z.array(z.string()),
  criteria: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string().min(1),
      checkIds: z.array(z.string()),
    }),
  ),
  steps: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string().min(1),
      files: z.array(z.string()),
      dependsOn: z.array(z.string()),
      inputs: z.string().min(1),
      outputs: z.string().min(1),
      verification: z.string().min(1),
    }),
  ),
  checks: z.array(CheckSpecSchema),
  uiVerification: UiVerificationSchema.nullable().optional(),
  dependencies: z.array(z.string()),
  environment: z.array(z.string()),
  unresolved: z.array(z.string()),
});
export type Plan = z.infer<typeof PlanSchema>;
export const AnalysisSchema = z.object({
  requirement: z.string().min(1),
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      recommendation: z.string(),
    }),
  ),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
export const ReviewSchema = z.object({
  taskId: z.string(),
  fingerprint: z.string(),
  planVersion: z.number().int().positive(),
  findings: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(["critical", "important", "minor"]),
      criterionId: z.string().nullable(),
      path: z.string(),
      line: z.number().int().nonnegative(),
      description: z.string(),
      evidence: z.string(),
      status: z.enum(["open", "resolved", "disputed"]),
    }),
  ),
  criteria: z.array(
    z.object({ id: z.string(), passed: z.boolean(), evidence: z.string() }),
  ),
  verdict: z.enum(["pass", "changes_requested", "needs_input"]),
});
export type Review = z.infer<typeof ReviewSchema>;

export const PlanCommentInputSchema = z.object({
  version: z.number().int().positive(),
  target: z.string().min(1),
  text: z.string().trim().min(1).max(MAX_PLAN_COMMENT_CHARACTERS),
});
export type PlanComment = z.infer<typeof PlanCommentInputSchema> & {
  id: string;
  taskId: string;
  at: number;
};
