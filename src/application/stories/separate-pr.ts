import { StoryRunState } from "../../domain/constants/story-run-state";
import { TaskReason } from "../../domain/constants/task-reason";
import { planKey } from "../../domain/utils/record-key";
import { TaskStatus } from "../../domain/constants/task-status";
import { ApplicationErrorCode, EventType } from "../constants/index";
import { ValidationLimits } from "../../domain/constants/validation-limits";
import { PipelineStage } from "../../domain/constants/pipeline-stage";
import type { ValidationPort } from "../validation";
import type { RuntimePort } from "../runtime";

import { type Task, type StoryRun } from "../../domain/contracts";
import { selectedStories, projectStoryPlan } from "../../domain/stories";
import { storyKey } from "../../domain/utils/record-key";
import type { ApplicationStore, StoryRepositoryPort } from "../ports";
import type { StoryStatePort } from "./state";
export async function prepareSeparateStory(
  store: ApplicationStore,
  stories: StoryStatePort,
  repository: StoryRepositoryPort,
  validation: ValidationPort,
  runtime: RuntimePort,
  task: Task,
  signal: AbortSignal,
): Promise<StoryRun> {
  const e = stories.getExecution(task.id)!;
  const plan = validation.plan(
    store.plans.get(planKey(task.id, e.selection.planVersion)),
  );
  const run = selectedStories(plan, e.selection)
    .map((s) => stories.listStoryRuns(task.id).find((r) => r.storyId === s.id)!)
    .find((r) => r.state !== StoryRunState.COMPLETED);
  if (!run) throw new Error(ApplicationErrorCode.STORIES_COMPLETE);
  if (run.childTaskId) return run;
  const repo = validation.repository(store.repositories.get(task.repositoryId));
  const story = plan.stories!.find((s) => s.id === run.storyId)!;
  let source = task.sourceCommit;
  if (story.dependsOn.length) {
    if (repo.remote)
      await repository.fetchBranch(
        repo.root,
        repo.remote,
        task.targetBranch,
        signal,
      );
    source = await repository.resolveCommit(
      repo.root,
      repo.remote
        ? `refs/remotes/${repo.remote}/${task.targetBranch}`
        : `refs/heads/${task.targetBranch}`,
      signal,
    );
    for (const id of story.dependsOn) {
      const previous = stories
        .listStoryRuns(task.id)
        .find((r) => r.storyId === id);
      if (previous?.state !== StoryRunState.COMPLETED || !previous.commit)
        throw new Error(`story_dependency_not_integrated:${id}`);
      try {
        await repository.assertAncestor(
          repo.root,
          previous.commit,
          source,
          signal,
        );
      } catch {
        signal.throwIfAborted();
        throw new Error(`story_dependency_not_integrated:${id}`);
      }
    }
  }
  signal.throwIfAborted();
  return store.atomic(() => {
    const current = store.storyRuns.get(storyKey(run)) as StoryRun;
    if (current.childTaskId) return current;
    const child = store.tasks.create({
      repositoryId: task.repositoryId,
      title: `${task.title}: ${story.title}`.slice(
        0,
        ValidationLimits.MAX_TITLE_CHARACTERS,
      ),
      requirement: `Implement ONLY story ${story.id}: ${story.outcome}. Acceptance: ${plan.criteria
        .filter((c) => story.criterionIds.includes(c.id))
        .map((c) => c.description)
        .join(
          "; ",
        )}. Other stories are out of scope. Feature background: ${task.requirement}`,
      sourceCommit: source,
      targetBranch: task.targetBranch,
      deliveryMode: task.deliveryMode,
      executionMode: task.executionMode,
      models: task.models,
      featureId: task.id,
      storyId: story.id,
    });
    if (source === plan.sourceCommit) {
      const projected = {
        ...projectStoryPlan(plan, story.id, source),
        taskId: child.id,
        version: 1,
      };
      store.plans.put(`${child.id}:1`, projected);
      store.tasks.update(
        child.id,
        child.revision,
        {
          planVersion: 1,
          approvedPlanVersion: 1,
          stage: PipelineStage.PREPARE,
        },
        {
          type: EventType.STORY_PLAN_INHERITED,
          data: {
            featureId: task.id,
            version: plan.version,
            storyId: story.id,
          },
        },
      );
      const profile = store.profiles.get(`${task.repositoryId}:${source}`);
      if (profile)
        store.profiles.put(`${child.repositoryId}:${source}`, profile);
    }
    const updated = {
      ...run,
      state: StoryRunState.RUNNING,
      childTaskId: child.id,
      baselineCommit: source,
      updatedAt: runtime.now(),
    };
    store.storyRuns.put(storyKey(updated), updated);
    store.storyExecutions.put(task.id, {
      ...e,
      activeStoryId: story.id,
    });
    store.events.add(task.id, EventType.STORY_CHILD_CREATED, {
      storyId: story.id,
      childTaskId: child.id,
    });
    return updated;
  });
}
export async function reconcileFeatureStories(
  store: ApplicationStore,
  stories: StoryStatePort,
  runtime: RuntimePort,
  featureId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const task = store.tasks.get(featureId);
  const e = stories.getExecution(featureId);
  if (
    e?.selection.mode !== "separate_pr" ||
    task.reason !== TaskReason.STORY_RUNNING ||
    task.status !== TaskStatus.BLOCKED
  )
    return;
  store.atomic(() => {
    for (const run of stories
      .listStoryRuns(featureId)
      .filter((r) => r.childTaskId && r.state !== StoryRunState.COMPLETED)) {
      const child = store.tasks.get(run.childTaskId!);
      const delivery = store.deliveries.get(child.id) as {
        commit: string;
        prUrl: string | null;
        reportPath: string;
      } | null;
      if (child.status === TaskStatus.COMPLETED && delivery) {
        store.storyRuns.put(storyKey(run), {
          ...run,
          state: StoryRunState.COMPLETED,
          commit: delivery.commit,
          prUrl: delivery.prUrl,
          checkpointPath: delivery.reportPath,
          updatedAt: runtime.now(),
        });
        store.events.add(task.id, EventType.STORY_COMPLETED, {
          storyId: run.storyId,
          childTaskId: child.id,
          commit: delivery.commit,
        });
        const all = stories
          .listStoryRuns(featureId)
          .every((r) => r.state === StoryRunState.COMPLETED);
        store.tasks.update(
          task.id,
          task.revision,
          {
            stage: all ? PipelineStage.DELIVER : PipelineStage.PREPARE,
            status: all
              ? TaskStatus.COMPLETED
              : e.selection.continueAutomatically
                ? TaskStatus.QUEUED
                : TaskStatus.PAUSED,
            reason:
              all || e.selection.continueAutomatically
                ? null
                : "story_checkpoint",
          },
          { type: EventType.FEATURE_PROGRESS, data: { storyId: run.storyId } },
        );
        return;
      }
      if (
        [
          TaskStatus.BLOCKED,
          TaskStatus.INTERRUPTED,
          TaskStatus.FAILED,
          TaskStatus.CANCELLED,
        ].some((value) => value === child.status)
      ) {
        store.storyRuns.put(storyKey(run), {
          ...run,
          state:
            child.status === TaskStatus.INTERRUPTED
              ? StoryRunState.INTERRUPTED
              : StoryRunState.BLOCKED,
          updatedAt: runtime.now(),
        });
        store.tasks.update(
          task.id,
          task.revision,
          {
            status: TaskStatus.BLOCKED,
            reason: `story_child_attention:${child.id}`,
          },
          { type: EventType.STORY_ATTENTION, data: { childTaskId: child.id } },
        );
        return;
      }
    }
    if (
      stories
        .listStoryRuns(featureId)
        .every((r) => r.state === StoryRunState.COMPLETED)
    )
      store.tasks.update(
        task.id,
        task.revision,
        {
          stage: PipelineStage.DELIVER,
          status: TaskStatus.COMPLETED,
          reason: null,
        },
        { type: EventType.FEATURE_COMPLETED, data: {} },
      );
  });
}
