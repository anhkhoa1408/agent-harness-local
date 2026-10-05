import { test, expect } from "vitest";
import { openStore } from "../../src/storage/store";
import { taskFixture } from "../support/task-fixture";
import { storiesPlan } from "../support/story-fixture";
import {
  approveStorySelection,
  storyRuns,
  executionOf,
  prepareSeparateStory,
  reconcileFeatureStories,
  validateStoryReplan,
} from "../../src/worker/stories";
import { createTempRepo } from "../support/temp-repo";
import { inspectRepository, gitText } from "../../src/repositories/inspect";
import { StorySelectionSchema } from "../../src/core/contracts";
const selection = (
  mode: "shared_pr" | "separate_pr" = "shared_pr",
  auto = false,
) =>
  StorySelectionSchema.parse({
    planVersion: 1,
    storyIds: ["A", "B"],
    mode,
    continueAutomatically: auto,
  });
function fixture(source = "a".repeat(40)) {
  const store = openStore(":memory:");
  const t = store.createTask({
    ...taskFixture(),
    sourceCommit: source,
    splitIntoStories: true,
  });
  const task = store.updateTask(
    t.id,
    0,
    { stage: "plan", status: "waiting_approval", planVersion: 1 },
    { type: "fixture", data: {} },
  );
  const plan = { ...storiesPlan(), taskId: task.id, sourceCommit: source };
  store.putRecord("plan", `${task.id}:1`, plan);
  return { store, task, plan };
}
test("selection approval persists runs, baseline and ordered active story; errors write nothing", () => {
  const { store, task } = fixture();
  try {
    expect(() =>
      approveStorySelection(store, task, { ...selection(), storyIds: ["B"] }),
    ).toThrow("story_dependency_required");
    expect(executionOf(store, task.id)).toBeNull();
    approveStorySelection(store, task, selection());
    expect(executionOf(store, task.id)?.activeStoryId).toBe("A");
    expect(storyRuns(store, task.id)).toHaveLength(2);
    expect(() =>
      approveStorySelection(store, task, { ...selection(), planVersion: 2 }),
    ).toThrow("stale_plan");
  } finally {
    store.close();
  }
});
test("started feature locks selection; replan preserves completed story and repair count", () => {
  const { store, task, plan } = fixture();
  try {
    approveStorySelection(store, task, selection());
    const run = storyRuns(store, task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, {
      ...run,
      state: "completed",
      commit: "b".repeat(40),
    });
    expect(() =>
      approveStorySelection(store, task, {
        ...selection(),
        mode: "separate_pr",
      }),
    ).toThrow("story_selection_locked");
    expect(() =>
      validateStoryReplan(store, task, {
        ...plan,
        version: 2,
        steps: [{ ...plan.steps[0], files: ["different.js"] }, plan.steps[1]],
      }),
    ).toThrow("completed_story_changed");
    expect(() =>
      validateStoryReplan(store, task, { ...plan, version: 2 }),
    ).not.toThrow();
    expect(store.getTask(task.id).repairCount).toBe(0);
  } finally {
    store.close();
  }
});
test("separate child idempotency, boundary pause and dependency integration by ancestry", async () => {
  const f = await createTempRepo({ "app.js": "original" });
  const head = await gitText(f.root, ["rev-parse", "HEAD"]);
  const { store, task } = fixture(head);
  try {
    const repo = await inspectRepository(f.root, "main", null);
    store.putRecord("repository", task.repositoryId, repo);
    approveStorySelection(store, task, selection("separate_pr"));
    const first = await prepareSeparateStory(
      store,
      task,
      new AbortController().signal,
    );
    const again = await prepareSeparateStory(
      store,
      task,
      new AbortController().signal,
    );
    expect(first.childTaskId).toBe(again.childTaskId);
    expect(store.listTasks()).toHaveLength(2);
    const child = store.getTask(first.childTaskId!);
    expect(child.approvedPlanVersion).toBe(1);
    expect(child.featureId).toBe(task.id);
    store.putRecord("delivery", child.id, {
      mode: "local",
      commit: "b".repeat(40),
      reportPath: "/report",
      prUrl: null,
    });
    store.updateTask(
      child.id,
      child.revision,
      { status: "completed" },
      { type: "done", data: {} },
    );
    const current = store.getTask(task.id);
    store.updateTask(
      task.id,
      current.revision,
      { status: "blocked", reason: "story_running", stage: "prepare" },
      { type: "wait", data: {} },
    );
    await reconcileFeatureStories(store, task.id, new AbortController().signal);
    expect(store.getTask(task.id).status).toBe("paused");
    await expect(
      prepareSeparateStory(
        store,
        store.getTask(task.id),
        new AbortController().signal,
      ),
    ).rejects.toThrow("story_dependency_not_integrated");
    // A real dependency commit present on target opens B, with refreshed source and approval required.
    const a = storyRuns(store, task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, { ...a, commit: head });
    const next = await prepareSeparateStory(
      store,
      store.getTask(task.id),
      new AbortController().signal,
    );
    expect(next.storyId).toBe("B");
    expect(store.listTasks()).toHaveLength(3);
  } finally {
    store.close();
    await f.dispose();
  }
});
test("auto-next queues coordinator, last delivery completes feature", async () => {
  const { store, task } = fixture();
  try {
    approveStorySelection(store, task, selection("separate_pr", true));
    const child = store.createTask(taskFixture());
    store.putRecord("delivery", child.id, {
      mode: "local",
      commit: "b".repeat(40),
      reportPath: "/report",
      prUrl: null,
    });
    store.updateTask(
      child.id,
      0,
      { status: "completed" },
      { type: "done", data: {} },
    );
    const a = storyRuns(store, task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, {
      ...a,
      childTaskId: child.id,
      state: "running",
    });
    store.updateTask(
      task.id,
      task.revision,
      { stage: "prepare", status: "blocked", reason: "story_running" },
      { type: "wait", data: {} },
    );
    await reconcileFeatureStories(store, task.id, new AbortController().signal);
    expect(store.getTask(task.id).status).toBe("queued");
    const b = storyRuns(store, task.id)[1];
    store.putRecord("story-run", `${task.id}:1:B`, {
      ...b,
      state: "completed",
      commit: "c".repeat(40),
    });
    const t = store.getTask(task.id);
    store.updateTask(
      t.id,
      t.revision,
      { status: "blocked", reason: "story_running" },
      { type: "wait", data: {} },
    );
    await reconcileFeatureStories(store, task.id, new AbortController().signal);
    expect(store.getTask(task.id).status).toBe("completed");
  } finally {
    store.close();
  }
});

test("worker validates selection atomically with plan approval and records story attempt identity", async () => {
  const { runWorker } = await import("../../src/worker/engine");
  const { unavailableHandlers } = await import("../../src/worker/stages");
  const { store, task } = fixture();
  const stop = new AbortController();
  const handlers = unavailableHandlers();
  let active: string | null = null;
  handlers.prepare = async () => ({
    stage: "implement",
    status: "queued",
    reason: null,
    output: null,
  });
  handlers.implement = async () => {
    active = executionOf(store, task.id)?.activeStoryId ?? null;
    return {
      stage: "implement",
      status: "paused",
      reason: "fixture",
      output: null,
    };
  };
  try {
    store.enqueue({
      id: "bad",
      taskId: task.id,
      kind: "approve",
      expectedRevision: task.revision,
      payload: { version: 1, selection: { ...selection(), storyIds: ["B"] } },
    });
    const running = runWorker(store, handlers, stop.signal);
    await new Promise((r) => setTimeout(r, 80));
    expect(store.getTask(task.id).approvedPlanVersion).toBeNull();
    expect(executionOf(store, task.id)).toBeNull();
    store.enqueue({
      id: "good",
      taskId: task.id,
      kind: "approve",
      expectedRevision: store.getTask(task.id).revision,
      payload: { version: 1, selection: selection() },
    });
    for (let i = 0; i < 100 && active === null; i++)
      await new Promise((r) => setTimeout(r, 10));
    stop.abort();
    await running;
    expect(active).toBe("A");
    expect(store.getTask(task.id).approvedPlanVersion).toBe(1);
    expect(
      (store.listRecords("attempt") as any[]).find(
        (a) => a.stage === "implement",
      )?.storyId,
    ).toBe("A");
  } finally {
    stop.abort();
    store.close();
  }
});
test("dependent child refreshes source after real integration and requires a new approved plan", async () => {
  const f = await createTempRepo({ "app.js": "original" }),
    head = await gitText(f.root, ["rev-parse", "HEAD"]),
    { store, task } = fixture(head);
  try {
    store.putRecord(
      "repository",
      task.repositoryId,
      await inspectRepository(f.root, "main", null),
    );
    approveStorySelection(store, task, selection("separate_pr"));
    await gitText(f.root, ["checkout", "-b", "story-a"]);
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await writeFile(join(f.root, "app.js"), "delivered A");
    await gitText(f.root, ["add", "app.js"]);
    await gitText(f.root, ["commit", "-m", "A"]);
    const commit = await gitText(f.root, ["rev-parse", "HEAD"]);
    await gitText(f.root, ["checkout", "main"]);
    const a = storyRuns(store, task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, {
      ...a,
      state: "completed",
      commit,
    });
    await expect(
      prepareSeparateStory(store, task, new AbortController().signal),
    ).rejects.toThrow("story_dependency_not_integrated:A");
    await gitText(f.root, ["merge", "--squash", "story-a"]);
    await gitText(f.root, ["commit", "-m", "Squash A"]);
    await expect(
      prepareSeparateStory(store, task, new AbortController().signal),
    ).rejects.toThrow("story_dependency_not_integrated:A");
    await gitText(f.root, ["merge", "--no-edit", "story-a"]);
    const integrated = await gitText(f.root, ["rev-parse", "HEAD"]);
    const b = await prepareSeparateStory(
        store,
        task,
        new AbortController().signal,
      ),
      child = store.getTask(b.childTaskId!);
    expect(child.sourceCommit).toBe(integrated);
    expect(child.approvedPlanVersion).toBeNull();
    expect(child.stage).toBe("discover");
    expect(child.requirement).toContain("Implement ONLY story B");
  } finally {
    store.close();
    await f.dispose();
  }
});
test("replan migrates completed checkpoints and active baseline without resetting repair budget", () => {
  const { store, task, plan } = fixture();
  try {
    approveStorySelection(store, task, selection());
    const a = storyRuns(store, task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, {
      ...a,
      state: "completed",
      commit: "b".repeat(40),
      checkpointPath: "/checkpoint",
    });
    store.putRecord("story-execution", task.id, {
      ...executionOf(store, task.id),
      activeStoryId: "B",
      baselineCommit: "b".repeat(40),
    });
    const current = store.updateTask(
      task.id,
      task.revision,
      { repairCount: 2, planVersion: 2 },
      { type: "replan", data: {} },
    );
    store.putRecord("plan", `${task.id}:2`, { ...plan, version: 2 });
    approveStorySelection(store, current, { ...selection(), planVersion: 2 });
    expect(
      storyRuns(store, task.id).find((r) => r.storyId === "A")?.checkpointPath,
    ).toBe("/checkpoint");
    expect(executionOf(store, task.id)?.baselineCommit).toBe("b".repeat(40));
    expect(executionOf(store, task.id)?.activeStoryId).toBe("B");
    expect(store.getTask(task.id).repairCount).toBe(2);
    expect(store.getRecord("story-run", `${task.id}:1:A`)).not.toBeNull();
  } finally {
    store.close();
  }
});
test.each(["pause", "cancel"] as const)(
  "%s feature stops its active child and retains completed checkpoints",
  async (kind) => {
    const { runWorker } = await import("../../src/worker/engine"),
      { unavailableHandlers } = await import("../../src/worker/stages");
    const { store, task } = fixture();
    const stop = new AbortController();
    let began = false;
    try {
      approveStorySelection(store, task, selection("separate_pr"));
      const a = storyRuns(store, task.id)[0];
      store.putRecord("story-run", `${task.id}:1:A`, {
        ...a,
        state: "completed",
        commit: "b".repeat(40),
      });
      const child = store.createTask({
        ...taskFixture(),
        featureId: task.id,
        storyId: "B",
      });
      store.updateTask(
        child.id,
        child.revision,
        { stage: "implement" },
        { type: "fixture", data: {} },
      );
      const b = storyRuns(store, task.id)[1];
      store.putRecord("story-run", `${task.id}:1:B`, {
        ...b,
        state: "running",
        childTaskId: child.id,
      });
      store.updateTask(
        task.id,
        task.revision,
        { stage: "prepare", status: "blocked", reason: "story_running" },
        { type: "wait", data: {} },
      );
      const handlers = unavailableHandlers();
      handlers.implement = async (_t, signal) => {
        began = true;
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new Error("interrupted")),
            { once: true },
          ),
        );
        throw new Error("unreachable");
      };
      const running = runWorker(store, handlers, stop.signal);
      for (let i = 0; i < 100 && !began; i++)
        await new Promise((r) => setTimeout(r, 10));
      expect(began).toBe(true);
      store.enqueue({
        id: `${kind}-feature`,
        taskId: task.id,
        kind,
        expectedRevision: store.getTask(task.id).revision,
        payload: {},
      });
      for (
        let i = 0;
        i < 100 && store.getTask(child.id).status === "running";
        i++
      )
        await new Promise((r) => setTimeout(r, 10));
      stop.abort();
      await running;
      expect(store.getTask(task.id).status).toBe(
        kind === "pause" ? "paused" : "cancelled",
      );
      expect(store.getTask(child.id).status).toBe(
        kind === "pause" ? "paused" : "cancelled",
      );
      expect(
        storyRuns(store, task.id).find((r) => r.storyId === "A")?.state,
      ).toBe("completed");
      expect(
        storyRuns(store, task.id).find((r) => r.storyId === "B")?.state,
      ).toBe("interrupted");
    } finally {
      stop.abort();
      store.close();
    }
  },
);
test("separate coordinator cannot prepare without current plan approval", async () => {
  const { createHandlers } = await import("../../src/worker/stages");
  const { store, task } = fixture();
  try {
    store.putRecord("repository", task.repositoryId, {
      id: task.repositoryId,
      root: "/private/tmp",
      baseBranch: "main",
      remote: null,
      head: task.sourceCommit,
      dirty: false,
    });
    approveStorySelection(store, task, selection("separate_pr"));
    await expect(
      createHandlers(store, {} as any, "/private/tmp").prepare(
        task,
        new AbortController().signal,
      ),
    ).rejects.toThrow("plan_not_approved");
    expect(store.listTasks()).toHaveLength(1);
  } finally {
    store.close();
  }
});
