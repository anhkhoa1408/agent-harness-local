import { planFixture } from "./task-fixture";
export function storiesPlan() {
  const p = planFixture();
  return {
    ...p,
    criteria: [
      ...p.criteria,
      { id: "AC-2", description: "Second", checkIds: ["second"] },
    ],
    steps: [
      ...p.steps,
      { ...p.steps[0], id: "two", dependsOn: ["one"], files: ["second.js"] },
    ],
    checks: [...p.checks, { ...p.checks[0], id: "second" }],
    stories: [
      {
        id: "A",
        title: "First",
        outcome: "First works",
        points: 2 as const,
        dependsOn: [],
        criterionIds: ["AC-1"],
        stepIds: ["one"],
      },
      {
        id: "B",
        title: "Second",
        outcome: "Second works",
        points: 3 as const,
        dependsOn: ["A"],
        criterionIds: ["AC-2"],
        stepIds: ["two"],
      },
    ],
  };
}
