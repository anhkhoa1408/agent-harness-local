import { planKey } from "../../domain/utils/record-key";
export { storyKey } from "../../domain/utils/record-key";
import { ApplicationErrorCode } from "../constants/index";
import type { ValidationPort } from "../validation";
import type { RuntimePort } from "../runtime";
import type { ApplicationStore, StoryRepositoryPort } from "../ports";
import type {
  Task,
  Plan,
  StorySelection,
  StoryExecution,
  StoryRun,
} from "../../domain/contracts";
import { projectStoryPlan, projectSelectedPlan } from "../../domain/stories";
import { validateStoryReplan, approveStorySelection } from "./selection";
import {
  assertEvidence,
  recordEvidence,
  completeSharedStory,
  assertSharedHead,
} from "./shared-pr";
import { prepareSeparateStory, reconcileFeatureStories } from "./separate-pr";

export class StoryService {
  constructor(
    private readonly store: ApplicationStore,
    private readonly repository: StoryRepositoryPort,
    private readonly validation: ValidationPort,
    private readonly runtime: RuntimePort,
  ) {}
  getExecution(id: string) {
    return this.store.storyExecutions.get(id) as StoryExecution | null;
  }
  listStoryRuns(id: string): StoryRun[] {
    const store = this.store;

    const execution = this.getExecution(id);
    return (store.storyRuns.list() as StoryRun[]).filter(
      (r) =>
        r.featureId === id &&
        r.planVersion === execution?.selection.planVersion,
    );
  }
  validateStoryReplan(task: Task, plan: Plan) {
    return validateStoryReplan(this.store, this, this.validation, task, plan);
  }
  approveStorySelection(task: Task, raw: StorySelection): void {
    return approveStorySelection(
      this.store,
      this,
      this.validation,
      this.runtime,
      task,
      raw,
    );
  }
  getEffectiveTask(task: Task): Task {
    const e = this.getExecution(task.id);
    return e?.selection.mode === "shared_pr"
      ? {
          ...task,
          sourceCommit: e.aggregate ? task.sourceCommit : e.baselineCommit,
        }
      : task;
  }
  getExecutionPlan(task: Task): Plan {
    const store = this.store;

    const plan = this.validation.plan(
      store.plans.get(planKey(task.id, task.planVersion)),
    );
    const e = this.getExecution(task.id);
    if (
      !e ||
      e.selection.planVersion !== plan.version ||
      e.selection.mode !== "shared_pr"
    )
      return plan;
    return e.aggregate
      ? projectSelectedPlan(plan, e.selection)
      : projectStoryPlan(plan, e.activeStoryId!, e.baselineCommit);
  }
  assertEvidence(task: Task) {
    return assertEvidence(this.store, this, task);
  }
  recordEvidence(task: Task) {
    return recordEvidence(this.store, this, task);
  }
  completeSharedStory(
    task: Task,
    checkpoint: {
      commit: string;
      checkpointPath: string;
      checkpointArtifactId?: string;
    },
  ) {
    return completeSharedStory(
      this.store,
      this,
      this.validation,
      this.runtime,
      task,
      checkpoint,
    );
  }
  prepareSeparateStory(task: Task, signal: AbortSignal) {
    return prepareSeparateStory(
      this.store,
      this,
      this.repository,
      this.validation,
      this.runtime,
      task,
      signal,
    );
  }
  reconcileFeatureStories(featureId: string, signal: AbortSignal) {
    return reconcileFeatureStories(
      this.store,
      this,
      this.runtime,
      featureId,
      signal,
    );
  }
  assertSharedHead(task: Task, delivery = false) {
    return assertSharedHead(this.store, this, this.repository, task, delivery);
  }
  getCheckpointContext(task: Task) {
    this.assertEvidence(task);
    const execution = this.getExecution(task.id);
    if (
      execution?.selection.mode !== "shared_pr" ||
      execution.aggregate ||
      !execution.activeStoryId
    )
      throw new Error(ApplicationErrorCode.STORY_CHECKPOINT_UNAVAILABLE);
    return {
      plan: this.getExecutionPlan(task),
      storyId: execution.activeStoryId,
    };
  }
}
