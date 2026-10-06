import { StoryService, storyKey } from "../../src/application/story-service";
import { PlanService } from "../../src/application/plan-service";
import { gitText as readStoryGit } from "../../src/repositories/inspect";
import { fingerprintWorktree as fingerprintStoryWorktree } from "../../src/repositories/fingerprint";
import { test, expect } from "vitest";
import { openStore } from "../../src/storage/store";
import { taskFixture, planFixture } from "../support/task-fixture";

test("versioned comments revise the plan without resetting worktree or repair budget", () => {
  const store = openStore(":memory:");
  try {
    const task = store.createTask(taskFixture());
    const plan = planFixture({ taskId: task.id });
    new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).savePlan(task.id, plan);
    const current = store.getTask(task.id);
    store.updateTask(
      task.id,
      current.revision,
      { worktree: "/existing", repairCount: 2, resumeStage: "repair" },
      { type: "fixture", data: {} },
    );
    new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).addPlanComment(task.id, {
      version: 1,
      target: "step:one",
      text: "Reuse repository",
    });
    expect(() =>
      new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).addPlanComment(task.id, {
        version: 1,
        target: "step:missing",
        text: "Change",
      }),
    ).toThrow("invalid_comment_target");
    expect(() =>
      new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).addPlanComment(task.id, {
        version: 1,
        target: "general",
        text: " ",
      }),
    ).toThrow();
    expect(() =>
      new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).addPlanComment(task.id, {
        version: 2,
        target: "general",
        text: "Change",
      }),
    ).toThrow("stale_plan");
    expect(new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).planComments(task.id)).toMatchObject([
      { version: 1, target: "step:one", text: "Reuse repository" },
    ]);
    new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).requestPlanRevision(task.id, { version: 1 });
    expect(store.getTask(task.id)).toMatchObject({
      stage: "plan",
      status: "queued",
      approvedPlanVersion: null,
      worktree: "/existing",
      repairCount: 2,
      resumeStage: "repair",
    });
    expect(() =>
      new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).addPlanComment(task.id, {
        version: 1,
        target: "general",
        text: "Late",
      }),
    ).toThrow("invalid_status");
    new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).savePlan(task.id, { ...plan, version: 2 });
    expect(store.getTask(task.id)).toMatchObject({
      status: "waiting_approval",
      planVersion: 2,
      approvedPlanVersion: null,
    });
    expect(() => new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).requestPlanRevision(task.id, { version: 1 })).toThrow(
      "stale_plan",
    );
    expect(store.getRecord("plan", `${task.id}:1`)).toEqual(plan);
    expect(new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).planComments(task.id)).toHaveLength(1);
    expect(() => new PlanService(store, new StoryService(store, { readGit: readStoryGit, fingerprintWorktree: fingerprintStoryWorktree })).requestPlanRevision(task.id, { version: 2 })).toThrow(
      "plan_feedback_required",
    );
  } finally {
    store.close();
  }
});
