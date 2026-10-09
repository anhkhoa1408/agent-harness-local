import type {Plan,Repository,NewTask,ModelMap,PlanComment,StorySelection,ExecutionMode,RepoProfile,Analysis,Review,VisualReview} from "../domain/contracts";
import type {Settings} from "./models";
import type {OutputCodec,MutationResult,PlanOutput} from "./agent-execution";
export interface ValidationPort {
  plan(value:unknown):Plan;
  repository(value:unknown):Repository;
  settings(value:unknown):Settings;
  newTask(value:unknown):NewTask;
  models(value:unknown):ModelMap;
  comment(value:unknown):Omit<PlanComment,"id"|"taskId"|"at">;
  revision(value:unknown):{version:number};
  storySelection(value:unknown):StorySelection;
  executionMode(value:unknown):ExecutionMode;
  planOutput(value:unknown):Plan;
  outputs:{profile:OutputCodec<RepoProfile>;analysis:OutputCodec<Analysis>;plan:OutputCodec<PlanOutput>;review:OutputCodec<Review>;visual:OutputCodec<VisualReview>;mutation:OutputCodec<MutationResult>};
}
