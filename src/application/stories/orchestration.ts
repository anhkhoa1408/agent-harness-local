import type { ValidationPort } from "../validation";
import type { RuntimePort } from "../runtime";
import { MAX_TITLE_CHARACTERS } from "../../domain/limits";
import { type Task, type StoryRun } from "../../domain/contracts";
import { selectedStories, projectStoryPlan } from "../../domain/stories";
import { evidenceExclusions } from "../../domain/evidence";
import { storyKey } from "../../domain/story-key";
import type { ApplicationStore, StoryRepositoryPort } from "../ports";
type StoryStatePort = {
  getExecution(
    id: string,
  ): import("../../domain/contracts").StoryExecution | null;
  listStoryRuns(id: string): StoryRun[];
  getExecutionPlan(task: Task): import("../../domain/contracts").Plan;
};
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
    store.plans.get(`${task.id}:${e.selection.planVersion}`),
  );
  const run = selectedStories(plan, e.selection)
    .map((s) => stories.listStoryRuns(task.id).find((r) => r.storyId === s.id)!)
    .find((r) => r.state !== "completed");
  if (!run) throw new Error("stories_complete");
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
      if (previous?.state !== "completed" || !previous.commit)
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
      title: `${task.title}: ${story.title}`.slice(0, MAX_TITLE_CHARACTERS),
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
        { planVersion: 1, approvedPlanVersion: 1, stage: "prepare" },
        {
          type: "story.plan_inherited",
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
      state: "running" as const,
      childTaskId: child.id,
      baselineCommit: source,
      updatedAt: runtime.now(),
    };
    store.storyRuns.put(storyKey(updated), updated);
    store.storyExecutions.put(task.id, {
      ...e,
      activeStoryId: story.id,
    });
    store.events.add(task.id, "story.child_created", {
      storyId: story.id,
      childTaskId: child.id,
    });
    return updated;
  });
}
export async function reconcileFeatureStories(
  store: ApplicationStore,
  stories: StoryStatePort,
  repository: StoryRepositoryPort,
  validation: ValidationPort,
  runtime: RuntimePort,
  featureId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const task = store.tasks.get(featureId),
    e = stories.getExecution(featureId);
  if (
    e?.selection.mode !== "separate_pr" ||
    task.reason !== "story_running" ||
    task.status !== "blocked"
  )
    return;
  store.atomic(() => {
    for (const run of stories
      .listStoryRuns(featureId)
      .filter((r) => r.childTaskId && r.state !== "completed")) {
      const child = store.tasks.get(run.childTaskId!),
        delivery = store.deliveries.get(child.id) as {
          commit: string;
          prUrl: string | null;
          reportPath: string;
        } | null;
      if (child.status === "completed" && delivery) {
        store.storyRuns.put(storyKey(run), {
          ...run,
          state: "completed",
          commit: delivery.commit,
          prUrl: delivery.prUrl,
          checkpointPath: delivery.reportPath,
          updatedAt: runtime.now(),
        });
        store.events.add(task.id, "story.completed", {
          storyId: run.storyId,
          childTaskId: child.id,
          commit: delivery.commit,
        });
        const all = stories
          .listStoryRuns(featureId)
          .every((r) => r.state === "completed");
        store.tasks.update(
          task.id,
          task.revision,
          {
            stage: all ? "deliver" : "prepare",
            status: all
              ? "completed"
              : e.selection.continueAutomatically
                ? "queued"
                : "paused",
            reason:
              all || e.selection.continueAutomatically
                ? null
                : "story_checkpoint",
          },
          { type: "feature.progress", data: { storyId: run.storyId } },
        );
        return;
      }
      if (
        ["blocked", "interrupted", "failed", "cancelled"].includes(child.status)
      ) {
        store.storyRuns.put(storyKey(run), {
          ...run,
          state: child.status === "interrupted" ? "interrupted" : "blocked",
          updatedAt: runtime.now(),
        });
        store.tasks.update(
          task.id,
          task.revision,
          { status: "blocked", reason: `story_child_attention:${child.id}` },
          { type: "story.attention", data: { childTaskId: child.id } },
        );
        return;
      }
    }
    if (stories.listStoryRuns(featureId).every((r) => r.state === "completed"))
      store.tasks.update(
        task.id,
        task.revision,
        { stage: "deliver", status: "completed", reason: null },
        { type: "feature.completed", data: {} },
      );
  });
}
export async function assertSharedHead(
  store: ApplicationStore,
  stories: StoryStatePort,
  repository: StoryRepositoryPort,
  task: Task,
  delivery = false,
) {
  const e = stories.getExecution(task.id);
  if (e?.selection.mode !== "shared_pr" || !task.worktree) return;
  const head = await repository.head(task.worktree);
  if (head === e.baselineCommit) return;
  if (delivery && e.aggregate) {
    const plan = stories.getExecutionPlan(task),
      fingerprint = await repository.fingerprintWorktree(
        task.worktree,
        evidenceExclusions(plan),
        task.sourceCommit,
      );
    const effect = store.effects.get(`${task.id}:commit:${fingerprint}`) as {
      state: string;
      parent: string;
      commit?: string;
    } | null;
    if (effect?.state === "confirmed" && effect.commit === head) return;
    if (
      effect?.state === "intent" &&
      effect.parent === e.baselineCommit &&
      (await repository.headParent(task.worktree)) === effect.parent &&
      (await repository.headMessage(task.worktree)) ===
        `feat: ${task.title}\n\nHarness-Task: ${task.id}`
    )
      return;
  }
  throw new Error("story_head_changed");
}
