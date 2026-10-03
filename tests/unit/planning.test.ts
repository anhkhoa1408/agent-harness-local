import { test, expect } from "vitest";
import { taskFixture, planFixture } from "../support/task-fixture";
import {
  approvePlan,
  canImplement,
  stageAfterPreparation,
} from "../../src/core/transitions";
import { validatePlan } from "../../src/core/acceptance";
test("replanning after a repair keeps the repair stage and budget", () => {
  const task = approvePlan(
    taskFixture({ repairCount: 3, resumeStage: "repair" }),
    planFixture(),
    1,
  );
  expect(stageAfterPreparation(task)).toBe("repair");
  expect(task.repairCount).toBe(3);
  expect(stageAfterPreparation(taskFixture({ repairCount: 1 }))).toBe("repair");
});
test("editing a plan invalidates prior approval", () => {
  const plan = planFixture();
  const task = approvePlan(taskFixture(), plan, 1);
  expect(canImplement(task, plan)).toBe(true);
  expect(canImplement(task, planFixture({ version: 2 }))).toBe(false);
  expect(() => approvePlan(task, planFixture({ version: 2 }), 1)).toThrow(
    "stale_plan",
  );
});
test("unresolved questions, missing checks and dependency cycles cannot be approved", () => {
  for (const patch of [
    { unresolved: ["Which?"] },
    { checks: [] },
    { criteria: [{ id: "AC-1", description: "Works", checkIds: [] }] },
    { steps: [{ ...planFixture().steps[0], dependsOn: ["one"] }] },
  ])
    expect(validatePlan(planFixture(patch)).length).toBeGreaterThan(0);
  expect(
    canImplement(
      taskFixture({ approvedPlanVersion: 1 }),
      planFixture({ taskId: "other" }),
    ),
  ).toBe(false);
});
