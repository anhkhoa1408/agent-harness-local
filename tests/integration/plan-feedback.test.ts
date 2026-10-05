import { test, expect } from "vitest";
import { openStore } from "../../src/storage/store";
import {
  addPlanComment,
  requestPlanRevision,
  planComments,
  savePlan,
} from "../../src/server/services";
import { taskFixture, planFixture } from "../support/task-fixture";

test("versioned comments revise the plan without resetting worktree or repair budget", () => {
  const store = openStore(":memory:");
  try {
    const task = store.createTask(taskFixture());
    const plan = planFixture({ taskId: task.id });
    savePlan(store, task.id, plan);
    const current = store.getTask(task.id);
    store.updateTask(
      task.id,
      current.revision,
      { worktree: "/existing", repairCount: 2, resumeStage: "repair" },
      { type: "fixture", data: {} },
    );
    addPlanComment(store, task.id, {
      version: 1,
      target: "step:one",
      text: "Reuse repository",
    });
    expect(() =>
      addPlanComment(store, task.id, {
        version: 1,
        target: "step:missing",
        text: "Change",
      }),
    ).toThrow("invalid_comment_target");
    expect(() =>
      addPlanComment(store, task.id, {
        version: 1,
        target: "general",
        text: " ",
      }),
    ).toThrow();
    expect(() =>
      addPlanComment(store, task.id, {
        version: 2,
        target: "general",
        text: "Change",
      }),
    ).toThrow("stale_plan");
    expect(planComments(store, task.id)).toMatchObject([
      { version: 1, target: "step:one", text: "Reuse repository" },
    ]);
    requestPlanRevision(store, task.id, { version: 1 });
    expect(store.getTask(task.id)).toMatchObject({
      stage: "plan",
      status: "queued",
      approvedPlanVersion: null,
      worktree: "/existing",
      repairCount: 2,
      resumeStage: "repair",
    });
    expect(() =>
      addPlanComment(store, task.id, {
        version: 1,
        target: "general",
        text: "Late",
      }),
    ).toThrow("invalid_status");
    savePlan(store, task.id, { ...plan, version: 2 });
    expect(store.getTask(task.id)).toMatchObject({
      status: "waiting_approval",
      planVersion: 2,
      approvedPlanVersion: null,
    });
    expect(() => requestPlanRevision(store, task.id, { version: 1 })).toThrow(
      "stale_plan",
    );
    expect(store.getRecord("plan", `${task.id}:1`)).toEqual(plan);
    expect(planComments(store, task.id)).toHaveLength(1);
    expect(() => requestPlanRevision(store, task.id, { version: 2 })).toThrow(
      "plan_feedback_required",
    );
  } finally {
    store.close();
  }
});
