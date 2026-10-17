import type {
  Plan,
  StoryExecution,
  StoryRun,
  Task,
} from "../../domain/contracts";

export type StoryStatePort = {
  getExecution(id: string): StoryExecution | null;
  listStoryRuns(id: string): StoryRun[];
  getExecutionPlan(task: Task): Plan;
};
