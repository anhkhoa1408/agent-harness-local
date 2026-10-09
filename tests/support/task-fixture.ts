import { aiStages, type Task, type Plan } from "../../src/domain/contracts";
export function taskFixture(patch: Partial<Task> = {}): Task {
  return {
    id: "task",
    repositoryId: "repo",
    title: "Feature",
    requirement: "New behavior",
    sourceCommit: "a".repeat(40),
    targetBranch: "main",
    deliveryMode: "local",
    models: Object.fromEntries(
      aiStages.map((s) => [
        s,
        {
          model: s === "plan" ? "strong" : "medium",
          effort: s === "plan" ? "high" : "medium",
        },
      ]),
    ) as Task["models"],
    stage: "plan",
    status: "waiting_approval",
    reason: null,
    revision: 0,
    planVersion: 1,
    approvedPlanVersion: null,
    repairCount: 0,
    worktree: null,
    branch: "codex/task-feature",
    resumeStage: null,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}
export function planFixture(patch: Partial<Plan> = {}): Plan {
  return {
    taskId: "task",
    version: 1,
    sourceCommit: "a".repeat(40),
    scope: "Feature",
    outOfScope: ["Legacy tests"],
    criteria: [
      { id: "AC-1", description: "Works", checkIds: ["feature-unit"] },
    ],
    steps: [
      {
        id: "one",
        description: "Implement",
        files: ["app.js"],
        dependsOn: [],
        inputs: "requirement",
        outputs: "feature",
        verification: "feature-unit",
      },
    ],
    checks: [
      {
        id: "feature-unit",
        executable: "node",
        args: ["--test", "feature.test.js"],
        cwd: ".",
        envNames: [],
        timeoutMs: 1000,
        reportPath: null,
        kind: "unit",
        required: true,
        minimumTests: 1,
        reportFormat: "tap",
        successPattern: null,
      },
    ],
    dependencies: [],
    environment: [],
    unresolved: [],
    ...patch,
  };
}
