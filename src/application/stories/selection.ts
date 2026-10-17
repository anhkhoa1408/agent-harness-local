import { StoryRunState } from "../../domain/constants/story-run-state";
import { planKey, storyKey } from "../../domain/utils/record-key";
import { ApplicationErrorCode } from "../constants/index";
import { assertCompletedStoryScopeUnchanged } from "../../domain/story-replan";
import { selectedStories } from "../../domain/stories";
import type {
  Task,
  Plan,
  StoryRun,
  StorySelection,
  StoryExecution,
} from "../../domain/contracts";
import type { ApplicationStore } from "../ports";
import type { ValidationPort } from "../validation";
import type { RuntimePort } from "../runtime";
import type { StoryStatePort } from "./state";

const started = (runs: StoryRun[]) =>
  runs.some((r) => r.state !== "pending" || r.childTaskId);

export function validateStoryReplan(
  store: ApplicationStore,
  stories: StoryStatePort,
  validation: ValidationPort,
  task: Task,
  plan: Plan,
) {
  const execution = stories.getExecution(task.id);
  if (!execution || !started(stories.listStoryRuns(task.id))) return;
  const previous = validation.plan(
    store.plans.get(planKey(task.id, execution.selection.planVersion)),
  );
  assertCompletedStoryScopeUnchanged(
    previous,
    plan,
    stories.listStoryRuns(task.id),
  );
  selectedStories(plan, {
    ...execution.selection,
    planVersion: plan.version,
  });
}

export function approveStorySelection(
  store: ApplicationStore,
  stories: StoryStatePort & {
    validateStoryReplan(task: Task, plan: Plan): void;
  },
  validation: ValidationPort,
  runtime: RuntimePort,
  task: Task,
  raw: StorySelection,
): void {
  store.atomic(() => {
    const plan = validation.plan(
      store.plans.get(planKey(task.id, task.planVersion)),
    );
    const selection = validation.storySelection(raw);
    const ordered = selectedStories(plan, selection);
    const old = stories.getExecution(task.id);
    const runs = stories.listStoryRuns(task.id);
    if (old && started(runs)) {
      if (
        old.selection.mode !== selection.mode ||
        JSON.stringify([...old.selection.storyIds].sort()) !==
          JSON.stringify([...selection.storyIds].sort())
      )
        throw new Error(ApplicationErrorCode.STORY_SELECTION_LOCKED);
      stories.validateStoryReplan(task, plan);
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
        state: StoryRunState.PENDING,
        baselineCommit: task.sourceCommit,
        ...prior,
        updatedAt: runtime.now(),
      };
      run.planVersion = plan.version;
      store.storyRuns.put(storyKey(run), run);
    }
    const active = ordered.find(
      (s) =>
        !runs.some(
          (r) =>
            retain && r.storyId === s.id && r.state === StoryRunState.COMPLETED,
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
