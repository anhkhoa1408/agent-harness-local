import { StoryService } from "../support/services";

import { gitText as readStoryGit } from "../../src/infrastructure/repositories/inspect";
import { fingerprintWorktree as fingerprintStoryWorktree } from "../../src/infrastructure/repositories/fingerprint";
import { test, expect } from "vitest";
import { openStore } from "../../src/infrastructure/persistence/store";
import { taskFixture } from "../support/task-fixture";
import { storiesPlan } from "../support/story-fixture";
import { createTempRepo } from "../support/temp-repo";
import {
  inspectRepository,
  gitText,
} from "../../src/infrastructure/repositories/inspect";
import { StorySelectionSchema } from "../../src/infrastructure/validation/contracts";
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
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).approveStorySelection(task, { ...selection(), storyIds: ["B"] }),
    ).toThrow("story_dependency_required");
    expect(
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecution(task.id),
    ).toBeNull();
    new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).approveStorySelection(task, selection());
    expect(
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecution(task.id)?.activeStoryId,
    ).toBe("A");
    expect(
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).listStoryRuns(task.id),
    ).toHaveLength(2);
    expect(() =>
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).approveStorySelection(task, { ...selection(), planVersion: 2 }),
    ).toThrow("stale_plan");
  } finally {
    store.close();
  }
});
test("started feature locks selection; replan preserves completed story and repair count", () => {
  const { store, task, plan } = fixture();
  try {
    new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).approveStorySelection(task, selection());
    const run = new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).listStoryRuns(task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, {
      ...run,
      state: "completed",
      commit: "b".repeat(40),
    });
    expect(() =>
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).approveStorySelection(task, {
        ...selection(),
        mode: "separate_pr",
      }),
    ).toThrow("story_selection_locked");
    expect(() =>
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).validateStoryReplan(task, {
        ...plan,
        version: 2,
        steps: [{ ...plan.steps[0], files: ["different.js"] }, plan.steps[1]],
      }),
    ).toThrow("completed_story_changed");
    expect(() =>
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).validateStoryReplan(task, { ...plan, version: 2 }),
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
    new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).approveStorySelection(task, selection("separate_pr"));
    const first = await new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).prepareSeparateStory(task, new AbortController().signal);
    const again = await new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).prepareSeparateStory(task, new AbortController().signal);
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
    await new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).reconcileFeatureStories(task.id, new AbortController().signal);
    expect(store.getTask(task.id).status).toBe("paused");
    await expect(
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).prepareSeparateStory(
        store.getTask(task.id),
        new AbortController().signal,
      ),
    ).rejects.toThrow("story_dependency_not_integrated");
    // A real dependency commit present on target opens B, with refreshed source and approval required.
    const a = new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).listStoryRuns(task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, { ...a, commit: head });
    const next = await new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).prepareSeparateStory(
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
    new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).approveStorySelection(task, selection("separate_pr", true));
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
    const a = new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).listStoryRuns(task.id)[0];
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
    await new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).reconcileFeatureStories(task.id, new AbortController().signal);
    expect(store.getTask(task.id).status).toBe("queued");
    const b = new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).listStoryRuns(task.id)[1];
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
    await new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).reconcileFeatureStories(task.id, new AbortController().signal);
    expect(store.getTask(task.id).status).toBe("completed");
  } finally {
    store.close();
  }
});

test("worker validates selection atomically with plan approval and records story attempt identity", async () => {
  const { runWorker } = await import("../../src/bootstrap/worker");
  const { unavailableHandlers } = await import("../../src/bootstrap/stages");
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
    active =
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecution(task.id)?.activeStoryId ?? null;
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
    expect(
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecution(task.id),
    ).toBeNull();
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
      (
        store.listRecords(
          "attempt",
        ) as import("../../src/application/pipeline-contracts").Attempt[]
      ).find((a) => a.stage === "implement")?.storyId,
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
    new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).approveStorySelection(task, selection("separate_pr"));
    await gitText(f.root, ["checkout", "-b", "story-a"]);
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await writeFile(join(f.root, "app.js"), "delivered A");
    await gitText(f.root, ["add", "app.js"]);
    await gitText(f.root, ["commit", "-m", "A"]);
    const commit = await gitText(f.root, ["rev-parse", "HEAD"]);
    await gitText(f.root, ["checkout", "main"]);
    const a = new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).listStoryRuns(task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, {
      ...a,
      state: "completed",
      commit,
    });
    await expect(
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).prepareSeparateStory(task, new AbortController().signal),
    ).rejects.toThrow("story_dependency_not_integrated:A");
    await gitText(f.root, ["merge", "--squash", "story-a"]);
    await gitText(f.root, ["commit", "-m", "Squash A"]);
    await expect(
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).prepareSeparateStory(task, new AbortController().signal),
    ).rejects.toThrow("story_dependency_not_integrated:A");
    await gitText(f.root, ["merge", "--no-edit", "story-a"]);
    const integrated = await gitText(f.root, ["rev-parse", "HEAD"]);
    const b = await new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).prepareSeparateStory(task, new AbortController().signal),
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
    new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).approveStorySelection(task, selection());
    const a = new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).listStoryRuns(task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, {
      ...a,
      state: "completed",
      commit: "b".repeat(40),
      checkpointPath: "/checkpoint",
    });
    store.putRecord("story-execution", task.id, {
      ...new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecution(task.id),
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
    new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).approveStorySelection(current, { ...selection(), planVersion: 2 });
    expect(
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      })
        .listStoryRuns(task.id)
        .find((r) => r.storyId === "A")?.checkpointPath,
    ).toBe("/checkpoint");
    expect(
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecution(task.id)?.baselineCommit,
    ).toBe("b".repeat(40));
    expect(
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecution(task.id)?.activeStoryId,
    ).toBe("B");
    expect(store.getTask(task.id).repairCount).toBe(2);
    expect(store.getRecord("story-run", `${task.id}:1:A`)).not.toBeNull();
  } finally {
    store.close();
  }
});
test.each(["pause", "cancel"] as const)(
  "%s feature stops its active child and retains completed checkpoints",
  async (kind) => {
    const { runWorker } = await import("../../src/bootstrap/worker"),
      { unavailableHandlers } = await import("../../src/bootstrap/stages");
    const { store, task } = fixture();
    const stop = new AbortController();
    let began = false;
    try {
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).approveStorySelection(task, selection("separate_pr"));
      const a = new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).listStoryRuns(task.id)[0];
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
      const b = new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).listStoryRuns(task.id)[1];
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
        new StoryService(store, {
          readGit: readStoryGit,
          fingerprintWorktree: fingerprintStoryWorktree,
        })
          .listStoryRuns(task.id)
          .find((r) => r.storyId === "A")?.state,
      ).toBe("completed");
      expect(
        new StoryService(store, {
          readGit: readStoryGit,
          fingerprintWorktree: fingerprintStoryWorktree,
        })
          .listStoryRuns(task.id)
          .find((r) => r.storyId === "B")?.state,
      ).toBe("interrupted");
    } finally {
      stop.abort();
      store.close();
    }
  },
);
test("separate coordinator cannot prepare without current plan approval", async () => {
  const { createHandlers } = await import("../../src/bootstrap/stages");
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
    new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).approveStorySelection(task, selection("separate_pr"));
    await expect(
      createHandlers(
        store,
        {} as import("../../src/infrastructure/codex/types").AgentClient,
        "/private/tmp",
      ).prepare(task, new AbortController().signal),
    ).rejects.toThrow("plan_not_approved");
    expect(store.listTasks()).toHaveLength(1);
  } finally {
    store.close();
  }
});
