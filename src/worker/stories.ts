import { fingerprintWorktree } from "../repositories/fingerprint";
import { evidenceExclusions } from "../execution/ui-verification";
import type { Store } from "../storage/store";
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
import { gitText } from "../repositories/inspect";

export const storyKey = (
  run: Pick<StoryRun, "featureId" | "planVersion" | "storyId">,
) => `${run.featureId}:${run.planVersion}:${run.storyId}`;
export const executionOf = (store: Store, id: string) =>
  store.getRecord("story-execution", id) as StoryExecution | null;
export function storyRuns(store: Store, id: string): StoryRun[] {
  const execution = executionOf(store, id);
  return (store.listRecords("story-run") as StoryRun[]).filter(
    (r) =>
      r.featureId === id && r.planVersion === execution?.selection.planVersion,
  );
}
const started = (runs: StoryRun[]) =>
  runs.some((r) => r.state !== "pending" || r.childTaskId);
function comparable(plan: Plan) {
  const {
    taskId: _id,
    version: _version,
    sourceCommit: _source,
    ...scope
  } = plan;
  return JSON.stringify(scope);
}
export function validateStoryReplan(store: Store, task: Task, plan: Plan) {
  const execution = executionOf(store, task.id);
  if (!execution || !started(storyRuns(store, task.id))) return;
  const previous = PlanSchema.parse(
    store.getRecord("plan", `${task.id}:${execution.selection.planVersion}`),
  );
  for (const run of storyRuns(store, task.id).filter(
    (r) => r.state === "completed",
  )) {
    if (
      !plan.stories?.some((s) => s.id === run.storyId) ||
      comparable(
        projectStoryPlan(previous, run.storyId, previous.sourceCommit),
      ) !== comparable(projectStoryPlan(plan, run.storyId, plan.sourceCommit))
    )
      throw new Error("completed_story_changed");
    const old = previous.stories!.find((s) => s.id === run.storyId)!;
    const next = plan.stories!.find((s) => s.id === run.storyId)!;
    if (JSON.stringify(old) !== JSON.stringify(next))
      throw new Error("completed_story_changed");
  }
  selectedStories(plan, { ...execution.selection, planVersion: plan.version });
}
export function approveStorySelection(
  store: Store,
  task: Task,
  raw: StorySelection,
): void {
  store.atomic(() => {
    const plan = PlanSchema.parse(
      store.getRecord("plan", `${task.id}:${task.planVersion}`),
    );
    const selection = StorySelectionSchema.parse(raw),
      ordered = selectedStories(plan, selection);
    const old = executionOf(store, task.id),
      runs = storyRuns(store, task.id);
    if (old && started(runs)) {
      if (
        old.selection.mode !== selection.mode ||
        JSON.stringify([...old.selection.storyIds].sort()) !==
          JSON.stringify([...selection.storyIds].sort())
      )
        throw new Error("story_selection_locked");
      validateStoryReplan(store, task, plan);
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
export function effectiveStoryTask(store: Store, task: Task): Task {
  const e = executionOf(store, task.id);
  return e?.selection.mode === "shared_pr"
    ? {
        ...task,
        sourceCommit: e.aggregate ? task.sourceCommit : e.baselineCommit,
      }
    : task;
}
export function executionPlan(store: Store, task: Task): Plan {
  const plan = PlanSchema.parse(
    store.getRecord("plan", `${task.id}:${task.planVersion}`),
  );
  const e = executionOf(store, task.id);
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
export function requireStoryEvidence(store: Store, task: Task) {
  const e = executionOf(store, task.id);
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
export function recordStoryEvidence(store: Store, task: Task) {
  const e = executionOf(store, task.id);
  if (e?.selection.mode === "shared_pr")
    store.putRecord("story-evidence", task.id, {
      storyId: e.aggregate ? null : e.activeStoryId,
      planVersion: task.planVersion,
      baselineCommit: task.sourceCommit,
    });
}
export function completeSharedStory(
  store: Store,
  task: Task,
  checkpoint: {
    commit: string;
    checkpointPath: string;
    checkpointArtifactId?: string;
  },
) {
  const e = executionOf(store, task.id)!;
  const run = storyRuns(store, task.id).find(
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
        !storyRuns(store, task.id).some(
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
export async function prepareSeparateStory(
  store: Store,
  task: Task,
  signal: AbortSignal,
): Promise<StoryRun> {
  const e = executionOf(store, task.id)!;
  const plan = PlanSchema.parse(
    store.getRecord("plan", `${task.id}:${e.selection.planVersion}`),
  );
  const run = selectedStories(plan, e.selection)
    .map((s) => storyRuns(store, task.id).find((r) => r.storyId === s.id)!)
    .find((r) => r.state !== "completed");
  if (!run) throw new Error("stories_complete");
  if (run.childTaskId) return run;
  const repo = RepositorySchema.parse(
    store.getRecord("repository", task.repositoryId),
  );
  const story = plan.stories!.find((s) => s.id === run.storyId)!;
  let source = task.sourceCommit;
  if (story.dependsOn.length) {
    if (repo.remote)
      await gitText(
        repo.root,
        [
          "fetch",
          "--no-tags",
          "--",
          repo.remote,
          `+refs/heads/${task.targetBranch}:refs/remotes/${repo.remote}/${task.targetBranch}`,
        ],
        signal,
      );
    source = await gitText(
      repo.root,
      [
        "rev-parse",
        "--verify",
        `${repo.remote ? `refs/remotes/${repo.remote}/${task.targetBranch}` : `refs/heads/${task.targetBranch}`}^{commit}`,
      ],
      signal,
    );
    for (const id of story.dependsOn) {
      const previous = storyRuns(store, task.id).find((r) => r.storyId === id);
      if (previous?.state !== "completed" || !previous.commit)
        throw new Error(`story_dependency_not_integrated:${id}`);
      try {
        await gitText(
          repo.root,
          ["merge-base", "--is-ancestor", previous.commit, source],
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
    const current = store.getRecord("story-run", storyKey(run)) as StoryRun;
    if (current.childTaskId) return current;
    const child = store.createTask({
      repositoryId: task.repositoryId,
      title: `${task.title}: ${story.title}`.slice(0, 200),
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
      store.putRecord("plan", `${child.id}:1`, projected);
      store.updateTask(
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
      const profile = store.getRecord(
        "profile",
        `${task.repositoryId}:${source}`,
      );
      if (profile)
        store.putRecord("profile", `${child.repositoryId}:${source}`, profile);
    }
    const updated = {
      ...run,
      state: "running" as const,
      childTaskId: child.id,
      baselineCommit: source,
      updatedAt: Date.now(),
    };
    store.putRecord("story-run", storyKey(updated), updated);
    store.putRecord("story-execution", task.id, {
      ...e,
      activeStoryId: story.id,
    });
    store.addEvent(task.id, "story.child_created", {
      storyId: story.id,
      childTaskId: child.id,
    });
    return updated;
  });
}
export async function reconcileFeatureStories(
  store: Store,
  featureId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const task = store.getTask(featureId),
    e = executionOf(store, featureId);
  if (
    e?.selection.mode !== "separate_pr" ||
    task.reason !== "story_running" ||
    task.status !== "blocked"
  )
    return;
  store.atomic(() => {
    for (const run of storyRuns(store, featureId).filter(
      (r) => r.childTaskId && r.state !== "completed",
    )) {
      const child = store.getTask(run.childTaskId!),
        delivery = store.getRecord("delivery", child.id) as {
          commit: string;
          prUrl: string | null;
          reportPath: string;
        } | null;
      if (child.status === "completed" && delivery) {
        store.putRecord("story-run", storyKey(run), {
          ...run,
          state: "completed",
          commit: delivery.commit,
          prUrl: delivery.prUrl,
          checkpointPath: delivery.reportPath,
          updatedAt: Date.now(),
        });
        store.addEvent(task.id, "story.completed", {
          storyId: run.storyId,
          childTaskId: child.id,
          commit: delivery.commit,
        });
        const all = storyRuns(store, featureId).every(
          (r) => r.state === "completed",
        );
        store.updateTask(
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
        store.putRecord("story-run", storyKey(run), {
          ...run,
          state: child.status === "interrupted" ? "interrupted" : "blocked",
          updatedAt: Date.now(),
        });
        store.updateTask(
          task.id,
          task.revision,
          { status: "blocked", reason: `story_child_attention:${child.id}` },
          { type: "story.attention", data: { childTaskId: child.id } },
        );
        return;
      }
    }
    if (storyRuns(store, featureId).every((r) => r.state === "completed"))
      store.updateTask(
        task.id,
        task.revision,
        { stage: "deliver", status: "completed", reason: null },
        { type: "feature.completed", data: {} },
      );
  });
}

export async function assertSharedHead(
  store: Store,
  task: Task,
  delivery = false,
) {
  const e = executionOf(store, task.id);
  if (e?.selection.mode !== "shared_pr" || !task.worktree) return;
  const head = await gitText(task.worktree, ["rev-parse", "HEAD"]);
  if (head === e.baselineCommit) return;
  if (delivery && e.aggregate) {
    const plan = executionPlan(store, task),
      fingerprint = await fingerprintWorktree(
        task.worktree,
        evidenceExclusions(plan),
        task.sourceCommit,
      );
    const effect = store.getRecord(
      "effect",
      `${task.id}:commit:${fingerprint}`,
    ) as { state: string; parent: string; commit?: string } | null;
    if (effect?.state === "confirmed" && effect.commit === head) return;
    if (
      effect?.state === "intent" &&
      effect.parent === e.baselineCommit &&
      (await gitText(task.worktree, ["rev-parse", "HEAD^"])) ===
        effect.parent &&
      (await gitText(task.worktree, ["show", "-s", "--format=%B", "HEAD"])) ===
        `feat: ${task.title}\n\nHarness-Task: ${task.id}`
    )
      return;
  }
  throw new Error("story_head_changed");
}
