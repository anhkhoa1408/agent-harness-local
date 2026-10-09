import {createStoryGit} from "../infrastructure/repositories/story-git";
import {createRepositories} from "../infrastructure/persistence/repositories";
import {validation} from "../infrastructure/validation/gateway";
import {systemRuntime} from "../infrastructure/runtime/system";
import { PlanService } from "../application/planning";
import { StoryService } from "../application/stories";

import { join } from "node:path";

import { RepositorySchema, type Task, type Plan } from "../core/contracts";
import type { Store } from "../storage/store";

import { gitText } from "../repositories/inspect";

import { fingerprintWorktree } from "../repositories/fingerprint";

import { evidenceExclusions } from "../execution/ui-verification";

export function createStageContext(store: Store, data: string) {
  const storyService = new StoryService(createRepositories(store), createStoryGit(),validation,systemRuntime);
  const planService = new PlanService(createRepositories(store), storyService,validation,systemRuntime);
  const artifacts = (task: Task) => {
    const e = storyService.getExecution(task.id);
    return e?.selection.mode === "shared_pr"
      ? join(
          data,
          "artifacts",
          task.id,
          `stories-v${e.selection.planVersion}`,
          e.aggregate ? "aggregate" : e.activeStoryId!,
        )
      : join(data, "artifacts", task.id);
  };
  const repository = (task: Task) => ({
    ...RepositorySchema.parse(store.getRecord("repository", task.repositoryId)),
    head: task.sourceCommit,
  });
  const planOf = (task: Task) => storyService.getExecutionPlan(task);
  const stageTask = (task: Task) => ({
    id: task.id,
    title: task.title,
    requirement: task.requirement,
    sourceCommit: task.sourceCommit,
    planVersion: task.planVersion,
    splitIntoStories: task.splitIntoStories,
    storyId:
      storyService.getExecution(task.id)?.activeStoryId ?? task.storyId ?? null,
  });
  const fingerprint = (task: Task, plan: Plan) =>
    fingerprintWorktree(
      task.worktree!,
      evidenceExclusions(plan),
      task.sourceCommit,
    );
  return {
    store,
    data,
    storyService,
    planService,
    artifacts,
    repository,
    planOf,
    stageTask,
    fingerprint,
  };
}
export type StageContext = ReturnType<typeof createStageContext>;
