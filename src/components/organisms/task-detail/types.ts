import type {
  Analysis,
  ControlCommand,
  Plan,
  PlanComment,
  Review,
  Task,
  StoryRun,
  StoryExecution,
} from "@/presentation/dto";
import type { StageNode } from "@/domain/pipeline-progress";
import type { CheckResult } from "@/domain/evidence";
import type { Delivery } from "@/presentation/dto";

export type TaskDetailData = {
  task: Task;
  stories?: { execution: StoryExecution | null; runs: StoryRun[] };
  pipeline: StageNode[];
  plan: Plan | null;
  comments: PlanComment[];
  analysis: Analysis | null;
  checks: CheckResult[] | null;
  review: Review | null;
  acceptance: unknown;
  delivery: Delivery | null;
  runtime: unknown;
  approvals: { id: string; params: unknown }[];
  artifacts: { id: string; type: string }[];
  diff: string;
};
export type TaskCommand = (
  kind: ControlCommand["kind"],
  payload?: unknown,
) => Promise<void>;
