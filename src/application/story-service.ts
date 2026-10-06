import { storyKey } from "../core/story-key";
export { storyKey } from "../core/story-key";
import {
  prepareSeparateStory,
  reconcileFeatureStories,
  assertSharedHead,
} from "./story-orchestration";
import { assertCompletedStoryScopeUnchanged } from "../core/story-replan";
import { MAX_TITLE_CHARACTERS } from "../core/limits";
import { evidenceExclusions } from "../execution/ui-verification";
import type { ApplicationStore, StoryRepositoryPort } from "./ports";
import {
  PlanSchema,
  StorySelectionSchema,
  RepositorySchema,
  type Task,
  type Plan,
  type StorySelection,
  type StoryExecution,
  type StoryRun,
} from "../core/contracts";
import {
  selectedStories,
  projectStoryPlan,
  projectSelectedPlan,
} from "../core/stories";
const started = (runs: StoryRun[]) =>
  runs.some((r) => r.state !== "pending" || r.childTaskId);
export class StoryService {
  constructor(
    private readonly store: ApplicationStore,
    private readonly repository: StoryRepositoryPort,
  ) {}
  getExecution(id: string) {
    return this.store.getRecord("story-execution", id) as StoryExecution | null;
  }
  listStoryRuns(id: string): StoryRun[] {
    const store = this.store;

    const execution = this.getExecution(id);
    return (store.listRecords("story-run") as StoryRun[]).filter(
      (r) =>
        r.featureId === id &&
        r.planVersion === execution?.selection.planVersion,
    );
  }
  validateStoryReplan(task: Task, plan: Plan) {
    const store = this.store;

    const execution = this.getExecution(task.id);
    if (!execution || !started(this.listStoryRuns(task.id))) return;
    const previous = PlanSchema.parse(
      store.getRecord("plan", `${task.id}:${execution.selection.planVersion}`),
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
      const plan = PlanSchema.parse(
        store.getRecord("plan", `${task.id}:${task.planVersion}`),
      );
      const selection = StorySelectionSchema.parse(raw),
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
          updatedAt: Date.now(),
        };
        run.planVersion = plan.version;
        store.putRecord("story-run", storyKey(run), run);
      }
      const active = ordered.find(
        (s) =>
          !runs.some(
            (r) => retain && r.storyId === s.id && r.state === "completed",
          ),
      );
      store.putRecord("story-execution", task.id, {
        selection,
        activeStoryId: active?.id ?? null,
        baselineCommit: retain ? old!.baselineCommit : task.sourceCommit,
        aggregate: retain && old!.aggregate,
      } satisfies StoryExecution);
    });
  }
  getEffectiveTask(task: Task): Task {
    const store = this.store;

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

    const plan = PlanSchema.parse(
      store.getRecord("plan", `${task.id}:${task.planVersion}`),
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
      JSON.stringify(store.getRecord("story-evidence", task.id)) !==
      JSON.stringify(expected)
    )
      throw new Error("stale_story_evidence");
  }
  recordEvidence(task: Task) {
    const store = this.store;

    const e = this.getExecution(task.id);
    if (e?.selection.mode === "shared_pr")
      store.putRecord("story-evidence", task.id, {
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
      store.putRecord("story-run", storyKey(run), {
        ...run,
        state: "completed",
        ...checkpoint,
        updatedAt: Date.now(),
      });
      const plan = PlanSchema.parse(
        store.getRecord("plan", `${task.id}:${task.planVersion}`),
      );
      const next = selectedStories(plan, e.selection).find(
        (s) =>
          !this.listStoryRuns(task.id).some(
            (r) => r.storyId === s.id && r.state === "completed",
          ),
      );
      store.putRecord("story-execution", task.id, {
        ...e,
        activeStoryId: next?.id ?? null,
        baselineCommit: checkpoint.commit,
        aggregate: !next,
      });
      store.deleteRecord("checks", task.id);
      store.deleteRecord("review", task.id);
      store.deleteRecord("acceptance", task.id);
      store.deleteRecord("story-evidence", task.id);
      store.addEvent(task.id, "story.checkpoint", {
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
      const current = store.getTask(task.id);
      store.updateTask(
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
      task,
      signal,
    );
  }
  reconcileFeatureStories(featureId: string, signal: AbortSignal) {
    return reconcileFeatureStories(
      this.store,
      this,
      this.repository,
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
