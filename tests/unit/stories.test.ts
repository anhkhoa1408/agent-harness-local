import { test, expect } from "vitest";
import {
  PlanSchema,
  StorySchema,
  StorySelectionSchema,
  TaskSchema,
} from "../../src/core/contracts";
import {
  validateStories,
  selectedStories,
  projectStoryPlan,
  projectSelectedPlan,
} from "../../src/core/stories";
import { planFixture, taskFixture } from "../support/task-fixture";
import { storiesPlan } from "../support/story-fixture";
const select = (storyIds = ["A", "B"]) =>
  StorySelectionSchema.parse({ planVersion: 1, storyIds, mode: "shared_pr" });
test("legacy contracts parse, points are bounded and selection defaults to pause", () => {
  expect(TaskSchema.parse(taskFixture()).splitIntoStories).toBeUndefined();
  expect(PlanSchema.parse(planFixture()).stories).toBeUndefined();
  expect(
    StorySchema.safeParse({ ...storiesPlan().stories[0], points: 4 }).success,
  ).toBe(false);
  expect(select().continueAutomatically).toBe(false);
});
test("valid stories cover plan and topological order ignores selection order", () => {
  expect(validateStories(storiesPlan())).toEqual([]);
  expect(
    selectedStories(storiesPlan(), select(["B", "A"])).map((s) => s.id),
  ).toEqual(["A", "B"]);
});
test.each([
  "duplicate",
  "unknown",
  "self",
  "cycle",
  "missing_mapping",
  "duplicate_mapping",
  "step_dependency",
])("reject %s", (kind) => {
  const p = storiesPlan();
  if (kind === "duplicate") p.stories[1].id = "A";
  if (kind === "unknown") p.stories[1].dependsOn = ["unknown"];
  if (kind === "self") p.stories[1].dependsOn = ["B"];
  if (kind === "cycle") p.stories[0].dependsOn = ["B"];
  if (kind === "missing_mapping") p.stories[1].criterionIds = ["missing"];
  if (kind === "duplicate_mapping") p.stories[1].stepIds = ["one"];
  if (kind === "step_dependency") p.stories[1].dependsOn = [];
  expect(validateStories(p).length).toBeGreaterThan(0);
});
test("reject empty, duplicate, unknown, incomplete and stale selections", () => {
  for (const ids of [[], ["A", "A"], ["X"], ["B"]])
    expect(() => selectedStories(storiesPlan(), select(ids))).toThrow();
  expect(() =>
    selectedStories(storiesPlan(), { ...select(), planVersion: 2 }),
  ).toThrow("stale_plan");
});
test("projection uses baseline and maps only owned criteria/checks/steps", () => {
  const p = projectStoryPlan(storiesPlan(), "B", "b".repeat(40));
  expect(p.sourceCommit).toBe("b".repeat(40));
  expect(p.stories).toBeUndefined();
  expect(p.criteria.map((c) => c.id)).toEqual(["AC-2"]);
  expect(p.checks.map((c) => c.id)).toEqual(["second"]);
  expect(p.steps[0].dependsOn).toEqual([]);
  expect(
    projectSelectedPlan(storiesPlan(), select(["A"])).steps.map((s) => s.id),
  ).toEqual(["one"]);
});
test("screenshots requiring multiple stories only appear in aggregate projection", () => {
  const p = storiesPlan();
  p.checks[0].kind = "e2e";
  const plan = {
    ...p,
    uiVerification: {
      screenshots: [
        {
          id: "combined",
          path: "screen.png",
          checkId: "feature-unit",
          criterionIds: ["AC-1", "AC-2"],
          viewport: { width: 800, height: 600 },
          referencePath: null,
        },
      ],
    },
  };
  expect(projectStoryPlan(plan, "A", p.sourceCommit).uiVerification).toBeNull();
  expect(
    projectSelectedPlan(plan, select()).uiVerification?.screenshots,
  ).toHaveLength(1);
});
test("unmapped required checks remain mandatory in every delivery projection", () => {
  const plan = storiesPlan();
  plan.checks.push({ ...plan.checks[0], id: "global-security" });
  expect(
    projectStoryPlan(plan, "A", plan.sourceCommit).checks.map((c) => c.id),
  ).toContain("global-security");
  expect(projectSelectedPlan(plan, select()).checks.map((c) => c.id)).toContain(
    "global-security",
  );
});
