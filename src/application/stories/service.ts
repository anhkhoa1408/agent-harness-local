import type { ValidationPort } from "../validation";
import type { RuntimePort } from "../runtime";
import { storyKey } from "../../domain/story-key";
export { storyKey } from "../../domain/story-key";
import {
  prepareSeparateStory,
  reconcileFeatureStories,
  assertSharedHead,
} from "./orchestration";
import { assertCompletedStoryScopeUnchanged } from "../../domain/story-replan";

import type { ApplicationStore, StoryRepositoryPort } from "../ports";
import {
  type Task,
  type Plan,
  type StorySelection,
  type StoryExecution,
  type StoryRun,
} from "../../domain/contracts";
import {
  selectedStories,
  projectStoryPlan,
  projectSelectedPlan,
} from "../../domain/stories";
const started = (runs: StoryRun[]) =>
  runs.some((r) => r.state !== "pending" || r.childTaskId);
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
    const store = this.store;

    const execution = this.getExecution(task.id);
    if (!execution || !started(this.listStoryRuns(task.id))) return;
    const previous = this.validation.plan(
      store.plans.get(`${task.id}:${execution.selection.planVersion}`),
    );
    assertCompletedStoryScopeUnchanged(
      previous,
      plan,
      this.listStoryRuns(task.id),
    );
    selectedStories(plan, {
      ...execution.selection,
      planVersion: plan.version,
    });
  }
  approveStorySelection(task: Task, raw: StorySelection): void {
    const store = this.store;

    store.atomic(() => {
      const plan = this.validation.plan(
        store.plans.get(`${task.id}:${task.planVersion}`),
      );
      const selection = this.validation.storySelection(raw),
        ordered = selectedStories(plan, selection);
      const old = this.getExecution(task.id),
        runs = this.listStoryRuns(task.id);
      if (old && started(runs)) {
        if (
          old.selection.mode !== selection.mode ||
          JSON.stringify([...old.selection.storyIds].sort()) !==
            JSON.stringify([...selection.storyIds].sort())
        )
          throw new Error("story_selection_locked");
        this.validateStoryReplan(task, plan);
      }
      const retain = !!old && started(runs);
      for (const story of ordered) {
        const prior = retain
          ? runs.find((r) => r.storyId === story.id)
          : undefined;
        const run: StoryRun = {
          featureId: task.id,
          planVersion: plan.version,
          storyId: story.id,
          state: "pending",
          baselineCommit: task.sourceCommit,
          ...prior,
          updatedAt: this.runtime.now(),
        };
        run.planVersion = plan.version;
        store.storyRuns.put(storyKey(run), run);
      }
      const active = ordered.find(
        (s) =>
          !runs.some(
            (r) => retain && r.storyId === s.id && r.state === "completed",
          ),
      );
      store.storyExecutions.put(task.id, {
        selection,
        activeStoryId: active?.id ?? null,
        baselineCommit: retain ? old!.baselineCommit : task.sourceCommit,
        aggregate: retain && old!.aggregate,
      } satisfies StoryExecution);
    });
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
      store.plans.get(`${task.id}:${task.planVersion}`),
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
    const store = this.store;

    const e = this.getExecution(task.id);
    if (!e || e.selection.mode !== "shared_pr") return;
    const expected = {
      storyId: e.aggregate ? null : e.activeStoryId,
      planVersion: task.planVersion,
      baselineCommit: task.sourceCommit,
    };
    if (
      JSON.stringify(store.storyEvidence.get(task.id)) !==
      JSON.stringify(expected)
    )
      throw new Error("stale_story_evidence");
  }
  recordEvidence(task: Task) {
    const store = this.store;

    const e = this.getExecution(task.id);
    if (e?.selection.mode === "shared_pr")
      store.storyEvidence.put(task.id, {
        storyId: e.aggregate ? null : e.activeStoryId,
        planVersion: task.planVersion,
        baselineCommit: task.sourceCommit,
      });
  }
  completeSharedStory(
    task: Task,
    checkpoint: {
      commit: string;
      checkpointPath: string;
      checkpointArtifactId?: string;
    },
  ) {
    const store = this.store;

    const e = this.getExecution(task.id)!;
    const run = this.listStoryRuns(task.id).find(
      (r) => r.storyId === e.activeStoryId,
    )!;
    return store.atomic(() => {
      store.storyRuns.put(storyKey(run), {
        ...run,
        state: "completed",
        ...checkpoint,
        updatedAt: this.runtime.now(),
      });
      const plan = this.validation.plan(
        store.plans.get(`${task.id}:${task.planVersion}`),
      );
      const next = selectedStories(plan, e.selection).find(
        (s) =>
          !this.listStoryRuns(task.id).some(
            (r) => r.storyId === s.id && r.state === "completed",
          ),
      );
      store.storyExecutions.put(task.id, {
        ...e,
        activeStoryId: next?.id ?? null,
        baselineCommit: checkpoint.commit,
        aggregate: !next,
      });
      store.checks.delete(task.id);
      store.reviews.delete(task.id);
      store.acceptance.delete(task.id);
      store.storyEvidence.delete(task.id);
      store.events.add(task.id, "story.checkpoint", {
        storyId: run.storyId,
        ...checkpoint,
      });
      const result = {
        stage: next ? ("prepare" as const) : ("verify" as const),
        status: e.selection.continueAutomatically
          ? ("queued" as const)
          : ("paused" as const),
        reason: e.selection.continueAutomatically ? null : "story_checkpoint",
        output: checkpoint,
      };
      const current = store.tasks.get(task.id);
      store.tasks.update(
        task.id,
        current.revision,
        {
          stage: result.stage,
          status: result.status,
          reason: result.reason,
          resumeStage: null,
        },
        {
          type: "story.advanced",
          data: { storyId: next?.id ?? null, aggregate: !next },
        },
      );
      return result;
    });
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
      this.repository,
      this.validation,
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
      throw new Error("story_checkpoint_unavailable");
    return {
      plan: this.getExecutionPlan(task),
      storyId: execution.activeStoryId,
    };
  }
}
