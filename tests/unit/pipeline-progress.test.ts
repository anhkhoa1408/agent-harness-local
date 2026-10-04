import { test, expect } from "vitest";
import {
  pipelineProgress,
  type ProgressAttempt,
} from "../../src/core/pipeline-progress";
import { taskFixture } from "../support/task-fixture";
import type { Stage } from "../../src/core/contracts";
const task = (stage: Stage, status = "running") =>
  taskFixture({ stage, status: status as any });
const done = (
  stage: Stage,
  nextStage: Stage,
  output: unknown = null,
): ProgressAttempt => ({
  taskId: "task",
  stage,
  status: "completed",
  nextStage,
  nextStatus: "queued",
  output,
});
const state = (nodes: ReturnType<typeof pipelineProgress>, s: Stage) =>
  nodes.find((n) => n.stage === s)!.state;
const opening = [
  done("discover", "analyze"),
  done("analyze", "plan"),
  done("plan", "prepare"),
  done("prepare", "implement"),
];
test("only completed attempts are green; current implementation is orange and future stays pending", () => {
  const nodes = pipelineProgress(task("implement"), opening);
  expect(state(nodes, "discover")).toBe("done");
  expect(state(nodes, "implement")).toBe("current");
  expect(state(nodes, "verify")).toBe("pending");
  expect(state(nodes, "repair")).toBe("pending");
  expect(state(pipelineProgress(task("implement"), []), "discover")).toBe(
    "pending",
  );
});
test("failed verification is not green during repair and repair invalidates downstream evidence", () => {
  const attempts = [
    ...opening,
    done("implement", "verify"),
    done("verify", "repair", [{ status: "failed" }]),
    {
      taskId: "task",
      stage: "repair",
      status: "running",
      output: null,
    } as ProgressAttempt,
  ];
  const nodes = pipelineProgress(task("repair"), attempts);
  expect(state(nodes, "verify")).toBe("pending");
  expect(state(nodes, "repair")).toBe("current");
  expect(state(nodes, "review")).toBe("pending");
});
test("replan clears old downstream completion and waiting approval remains current", () => {
  const attempts = [
    ...opening,
    done("implement", "verify"),
    done("verify", "review"),
    done("review", "repair"),
    done("repair", "plan"),
    done("plan", "plan"),
  ];
  const nodes = pipelineProgress(task("plan", "waiting_approval"), attempts);
  expect(state(nodes, "plan")).toBe("current");
  expect(state(nodes, "prepare")).toBe("pending");
  expect(state(nodes, "implement")).toBe("pending");
  expect(state(nodes, "verify")).toBe("pending");
  expect(nodes.find((n) => n.stage === "plan")!.label).toBe("Chờ duyệt");
});
test("delivery is green when complete; repair that never ran is skipped, not green", () => {
  const attempts = [
    ...opening,
    done("implement", "verify"),
    done("verify", "review"),
    done("review", "deliver"),
    { ...done("deliver", "deliver"), nextStatus: "completed" as const },
  ];
  const nodes = pipelineProgress(task("deliver", "completed"), attempts);
  expect(state(nodes, "deliver")).toBe("done");
  expect(state(nodes, "repair")).toBe("skipped");
});
test("paused, cancelled, blocked and queued stages cannot appear as active work", () => {
  expect(
    pipelineProgress(task("implement", "paused"), opening).find(
      (n) => n.stage === "implement",
    )!.label,
  ).toBe("Tạm dừng");
  expect(
    state(
      pipelineProgress(task("implement", "cancelled"), opening),
      "implement",
    ),
  ).toBe("stopped");
  expect(
    state(pipelineProgress(task("implement", "blocked"), opening), "implement"),
  ).toBe("attention");
  expect(
    state(pipelineProgress(task("discover", "queued"), []), "discover"),
  ).toBe("pending");
});
test("legacy completed attempt with failed checks or replan output never implies pass", () => {
  const nodes = pipelineProgress(task("repair"), [
    {
      ...done("verify", "review", [{ status: "failed" }]),
      nextStage: undefined,
      nextStatus: undefined,
    },
    {
      ...done("implement", "plan", { needsReplan: true }),
      nextStage: undefined,
      nextStatus: undefined,
    },
  ]);
  expect(state(nodes, "verify")).not.toBe("done");
  expect(state(nodes, "implement")).not.toBe("done");
});
test("approved plan turns green after the approval gate", () => {
  const approved = taskFixture({
    stage: "prepare",
    status: "queued",
    approvedPlanVersion: 1,
  });
  const attempts = [
    done("discover", "analyze"),
    done("analyze", "plan"),
    {
      ...done("plan", "plan", { version: 1 }),
      nextStatus: "waiting_approval" as const,
    },
  ];
  expect(state(pipelineProgress(approved, attempts), "plan")).toBe("done");
});
test("clarification and queued replan invalidate old completion before a new attempt starts", () => {
  const attempts = [
    ...opening,
    done("implement", "verify"),
    done("verify", "review"),
    {
      ...done("review", "review", { verdict: "needs_input" }),
      nextStatus: "waiting_input" as const,
    },
  ];
  for (const status of ["queued", "paused", "running"] as const) {
    const clarified = taskFixture({
      stage: "analyze",
      status,
      approvedPlanVersion: null,
    });
    const nodes = pipelineProgress(clarified, attempts);
    for (const s of [
      "plan",
      "prepare",
      "implement",
      "verify",
      "review",
    ] as const)
      expect(state(nodes, s)).toBe("pending");
  }
  const replanning = pipelineProgress(task("plan", "queued"), attempts);
  expect(state(replanning, "implement")).toBe("pending");
  expect(state(replanning, "verify")).toBe("pending");
});
