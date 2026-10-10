import { join } from "node:path";
import type { Store } from "../infrastructure/persistence/store";
import type { Task, Plan, Repository } from "../domain/contracts";
import { evidenceExclusions } from "../domain/evidence";
import { validation } from "../infrastructure/validation/gateway";
import { contextIO } from "../infrastructure/context/preparation";
import { verificationIO } from "../infrastructure/execution/verification";
import { deliveryIO } from "../infrastructure/delivery/adapters";
import { prepareWorktree } from "../infrastructure/repositories/worktree";
import { synchronizeBase } from "../infrastructure/repositories/prepare-base";
import {
  sourceDocuments,
  gitText,
} from "../infrastructure/repositories/inspect";
import { fingerprintWorktree } from "../infrastructure/repositories/fingerprint";
import { createServices } from "./services";
export function createStageContext(raw: Store, data: string) {
  const services = createServices(raw, data),
    store = services.store,
    storyService = services.stories,
    planService = services.plans;
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
    ...validation.repository(store.repositories.get(task.repositoryId)),
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
    contextIO,
    verificationIO,
    deliveryIO: deliveryIO(data),
    repositoryIO: {
      sourceDocuments,
      prepareWorktree: (repo: Repository, task: Task) =>
        prepareWorktree(repo, task, join(data, "worktrees")),
      synchronizeBase: (
        repo: Repository,
        task: Task,
        path: string,
        signal: AbortSignal,
        resolve: (conflicts: string[]) => Promise<void>,
      ) =>
        synchronizeBase(
          repo,
          task,
          path,
          join(data, "worktrees"),
          signal,
          resolve,
        ),
      diff: (root: string, source: string) =>
        gitText(root, ["diff", source, "--"]),
    },
    validation,
    storyService,
    planService,
    artifacts,
    repository,
    planOf,
    stageTask,
    fingerprint,
  };
}
export type { StageContext } from "../application/pipeline/context";
