import { expect, onTestFinished, test } from "vitest";
import { processControlCommand } from "../../src/application/pipeline/control-commands";
import type { ActiveStageAttempt } from "../../src/application/pipeline-contracts";
import type { ControlCommand, Task } from "../../src/domain/contracts";
import { openStore } from "../../src/infrastructure/persistence/store";
import { createRepositories } from "../../src/infrastructure/persistence/repositories";
import { systemRuntime } from "../../src/infrastructure/runtime/system";
import { validation } from "../../src/infrastructure/validation/gateway";
import { gitText } from "../../src/infrastructure/repositories/inspect";
import { fingerprintWorktree } from "../../src/infrastructure/repositories/fingerprint";
import { PlanService, StoryService } from "../support/services";
import { taskFixture } from "../support/task-fixture";
import { storiesPlan } from "../support/story-fixture";

function fixture(patch: Partial<Task> = {}) {
  const store = openStore(":memory:");
  onTestFinished(() => store.close());
  const created = store.createTask(taskFixture());
  const task = store.updateTask(
    created.id,
    created.revision,
    { stage: "plan", status: "waiting_approval", planVersion: 1, ...patch },
    { type: "fixture", data: {} },
  );
  store.putRecord("plan", `${task.id}:1`, {
    ...storiesPlan(),
    taskId: task.id,
  });
  const stories = new StoryService(store, {
    readGit: gitText,
    fingerprintWorktree,
  });
  const plans = new PlanService(store, stories);
  const data = createRepositories(store);
  let sequence = 0;
  function execute(
    kind: ControlCommand["kind"],
    payload: unknown = {},
    active: ActiveStageAttempt | null = null,
    expectedRevision = store.getTask(task.id).revision,
  ) {
    const command: ControlCommand = {
      id: `command-${++sequence}`,
      taskId: task.id,
      kind,
      expectedRevision,
      payload,
    };
    store.enqueue(command);
    const next = store.nextCommand();
    expect(next).toEqual(command);
    const after = store.events(task.id, 0).at(-1)!.seq;
    processControlCommand(
      data,
      stories,
      plans,
      active,
      command,
      validation,
      systemRuntime,
    );
    const row = store.db
      .prepare("SELECT state,outcome FROM commands WHERE id=?")
      .get(command.id) as {
      state: string;
      outcome: string;
    };
    expect(row.state).toBe("done");
    return {
      command,
      outcome: JSON.parse(row.outcome),
      events: store
        .events(task.id, after)
        .map(({ type, data }) => ({ type, data })),
    };
  }
  return { store, task, stories, plans, execute };
}

const selection = {
  planVersion: 1,
  storyIds: ["A", "B"],
  mode: "separate_pr" as const,
  continueAutomatically: false,
};

test.each([
  { status: "paused", revision: 0, error: "revision_conflict" },
  { status: "completed", revision: 1, error: "terminal_task" },
  { status: "cancelled", revision: 1, error: "terminal_task" },
] as const)(
  "rejects $error for $status without updating the task",
  ({ status, revision, error }) => {
    const { store, task, execute } = fixture({ status });
    const result = execute("resume", {}, null, revision);
    expect(result.outcome).toEqual({ error: `Error: ${error}` });
    expect(store.getTask(task.id)).toEqual(task);
    expect(result.events).toEqual([
      {
        type: "command.rejected",
        data: { commandId: result.command.id, error: `Error: ${error}` },
      },
    ]);
  },
);

test.each(["pause", "cancel"] as const)(
  "%s enqueues child control before abort and finishes after abort",
  (kind) => {
    const { store, task, stories, execute } = fixture({
      splitIntoStories: true,
      stage: "implement",
      status: "running",
    });
    stories.approveStorySelection(task, selection);
    const child = store.createTask(
      taskFixture({ featureId: task.id, storyId: "A" }),
    );
    const run = stories.listStoryRuns(task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, {
      ...run,
      state: "running",
      childTaskId: child.id,
    });
    const active: ActiveStageAttempt = {
      taskId: task.id,
      abort: new AbortController(),
      promise: Promise.resolve(),
      stop: null,
    };
    let duringAbort: unknown;
    active.abort.signal.addEventListener("abort", () => {
      duringAbort = {
        child: store.nextCommand(),
        running: store.runningCommands().map((c) => c.id),
        stop: active.stop,
      };
    });
    const result = execute(kind, {}, active);
    expect(duringAbort).toEqual({
      child: {
        id: `command-1:child:${child.id}`,
        taskId: child.id,
        kind,
        expectedRevision: 0,
        payload: {},
      },
      running: ["command-1", `command-1:child:${child.id}`],
      stop: kind === "pause" ? "paused" : "cancelled",
    });
    expect(active.abort.signal.aborted).toBe(true);
    expect(store.getTask(task.id)).toEqual(task);
    expect(stories.listStoryRuns(task.id)[0].state).toBe("running");
    expect(result.outcome).toEqual({ ok: true });
    expect(result.events).toEqual([]);
  },
);

test.each(["pause", "cancel"] as const)(
  "%s without an active attempt preserves resume stage and interrupts the story",
  (kind) => {
    const { store, task, stories, execute } = fixture({
      splitIntoStories: true,
      stage: "repair",
      status: "queued",
      repairCount: 4,
    });
    stories.approveStorySelection(task, { ...selection, mode: "shared_pr" });
    const run = stories.listStoryRuns(task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, {
      ...run,
      state: "running",
    });
    const result = execute(kind);
    expect(store.getTask(task.id)).toMatchObject({
      revision: 2,
      status: kind === "pause" ? "paused" : "cancelled",
      resumeStage: "repair",
      repairCount: 4,
      reason: null,
    });
    expect(stories.listStoryRuns(task.id)[0].state).toBe("interrupted");
    expect(result.events).toEqual([{ type: `task.${kind}`, data: {} }]);
    expect(result.outcome).toEqual({ ok: true });
  },
);

test.each(["start", "resume"] as const)(
  "%s refuses an unknown runtime without queueing work",
  (kind) => {
    const { store, task, execute } = fixture({
      status: "interrupted",
      reason: "runtime_state_unknown",
    });
    expect(execute(kind).outcome).toEqual({
      error: "Error: runtime_reconciliation_required",
    });
    expect(store.getTask(task.id)).toEqual(task);
    expect(store.nextCommand()).toBeNull();
  },
);

test.each(["start", "resume"] as const)(
  "%s resumes a separate child using a stable id and leaves the feature blocked",
  (kind) => {
    const { store, task, stories, execute } = fixture({
      splitIntoStories: true,
      status: "paused",
    });
    stories.approveStorySelection(task, selection);
    const child = store.createTask(
      taskFixture({ featureId: task.id, storyId: "A" }),
    );
    store.updateTask(
      child.id,
      0,
      { status: "paused" },
      { type: "fixture", data: {} },
    );
    const run = stories.listStoryRuns(task.id)[0];
    store.putRecord("story-run", `${task.id}:1:A`, {
      ...run,
      state: "interrupted",
      childTaskId: child.id,
    });
    const result = execute(kind);
    const childCommand = store.nextCommand()!;
    expect(childCommand).toEqual({
      id: `command-1:child:${child.id}`,
      taskId: child.id,
      kind: "resume",
      expectedRevision: 1,
      payload: {},
    });
    expect(store.enqueue(childCommand)).toBe(false);
    expect(store.enqueue(result.command)).toBe(false);
    expect(store.nextCommand()).toBeNull();
    expect(store.getTask(task.id)).toMatchObject({
      revision: 2,
      status: "blocked",
      reason: "story_running",
    });
    expect(result.events).toEqual([{ type: "task.resumed", data: {} }]);
    expect(result.outcome).toEqual({ ok: true });
  },
);

test.each(["start", "resume"] as const)(
  "%s queues a paused task without a child",
  (kind) => {
    const { store, task, execute } = fixture({
      stage: "repair",
      status: "paused",
      repairCount: 3,
    });
    expect(execute(kind).outcome).toEqual({ ok: true });
    expect(store.getTask(task.id)).toMatchObject({
      revision: 2,
      stage: "repair",
      status: "queued",
      reason: null,
      repairCount: 3,
    });
  },
);

test("approval rejects an invalid story selection without persisting partial approval", () => {
  const { store, task, stories, execute } = fixture({ splitIntoStories: true });
  const result = execute("approve", {
    version: 1,
    selection: { ...selection, storyIds: ["B"] },
  });
  expect(result.outcome).toEqual({
    error: "Error: story_dependency_required",
  });
  expect(store.getTask(task.id)).toEqual(task);
  expect(stories.getExecution(task.id)).toBeNull();
  expect(store.listRecords("story-run")).toEqual([]);
  expect(result.events.map((e) => e.type)).toEqual(["command.rejected"]);
});

test("approval persists ordered story runs together with the approval event", () => {
  const { store, task, stories, execute } = fixture({ splitIntoStories: true });
  const chosen = { ...selection, storyIds: ["B", "A"] };
  const result = execute("approve", { version: 1, selection: chosen });
  expect(result.outcome).toEqual({ ok: true });
  expect(store.getTask(task.id)).toMatchObject({
    revision: 2,
    stage: "prepare",
    status: "queued",
    approvedPlanVersion: 1,
  });
  expect(stories.listStoryRuns(task.id).map((r) => r.storyId)).toEqual([
    "A",
    "B",
  ]);
  expect(stories.getExecution(task.id)?.activeStoryId).toBe("A");
  expect(result.events).toEqual([
    { type: "plan.approved", data: { version: 1, selection: chosen } },
  ]);
});

test("approval rolls back nested story writes when the task update fails", () => {
  const { store, task, stories, execute } = fixture({ splitIntoStories: true });
  store.db.exec(`
    CREATE TRIGGER reject_approval BEFORE UPDATE ON tasks
    BEGIN SELECT RAISE(ABORT, 'fixture_approval_write_failed'); END;
  `);
  const result = execute("approve", { version: 1, selection });
  expect(result.outcome).toEqual({
    error: "Error: fixture_approval_write_failed",
  });
  expect(store.getTask(task.id)).toEqual(task);
  expect(stories.getExecution(task.id)).toBeNull();
  expect(store.listRecords("story-run")).toEqual([]);
  expect(result.events.map((e) => e.type)).toEqual(["command.rejected"]);
});

test("comment prevents approval until revision and preserves worktree and repair count", () => {
  const { store, task, plans, execute } = fixture({
    worktree: "/existing",
    repairCount: 3,
  });
  expect(execute("revise", { version: 1 }).outcome).toEqual({
    error: "Error: plan_feedback_required",
  });
  expect(
    execute("comment", { version: 1, target: "step:missing", text: "Change" })
      .outcome,
  ).toEqual({ error: "Error: invalid_comment_target" });
  expect(
    execute("comment", {
      version: 1,
      target: "general",
      text: "Clarify checks",
    }).outcome,
  ).toEqual({ ok: true });
  expect(plans.planComments(task.id)).toMatchObject([
    { target: "general", text: "Clarify checks", version: 1 },
  ]);
  expect(execute("approve", { version: 1 }).outcome).toEqual({
    error: "Error: plan_feedback_requires_revision",
  });
  const result = execute("revise", { version: 1 });
  expect(result.outcome).toEqual({ ok: true });
  expect(store.getTask(task.id)).toMatchObject({
    revision: 3,
    stage: "plan",
    status: "queued",
    approvedPlanVersion: null,
    worktree: "/existing",
    repairCount: 3,
  });
  expect(result.events).toEqual([
    { type: "plan.revision_requested", data: { version: 1 } },
  ]);
});

test.each([
  { status: "paused", answer: "Clarification", error: "invalid_status" },
  { status: "waiting_input", answer: "  ", error: "answer_required" },
] as const)(
  "answer rejects $error without adding a record",
  ({ status, answer, error }) => {
    const { store, task, execute } = fixture({ status });
    expect(execute("answer", { answer }).outcome).toEqual({
      error: `Error: ${error}`,
    });
    expect(store.getTask(task.id)).toEqual(task);
    expect(store.listRecords("answer")).toEqual([]);
  },
);

test("answer retains raw input in its record while normalizing the updated requirement", () => {
  const { store, task, execute } = fixture({
    status: "waiting_input",
    approvedPlanVersion: 1,
  });
  const result = execute("answer", { answer: "  Keep whitespace  " });
  expect(result.outcome).toEqual({ ok: true });
  expect(store.getRecord("answer", `${task.id}:1`)).toEqual({
    answer: "  Keep whitespace  ",
    at: expect.any(Number),
  });
  expect(store.getTask(task.id)).toMatchObject({
    revision: 2,
    requirement: "New behavior\nUser clarification:   Keep whitespace",
    stage: "analyze",
    status: "queued",
    approvedPlanVersion: null,
    reason: null,
  });
  expect(result.events).toEqual([{ type: "requirement.answered", data: {} }]);
});

test("configure is gated at stage boundaries and applies model effort policy", () => {
  const { store, task, execute } = fixture({ status: "running" });
  expect(execute("configure", { deliveryMode: "github" }).outcome).toEqual({
    error: "Error: stage_boundary_required",
  });
  expect(store.getTask(task.id)).toEqual(task);
  store.updateTask(
    task.id,
    task.revision,
    { status: "paused" },
    { type: "fixture", data: {} },
  );
  const models = { ...task.models, plan: { model: "strong", effort: "low" } };
  const result = execute("configure", {
    deliveryMode: "github",
    executionMode: "auto",
    models,
  });
  expect(result.outcome).toEqual({ ok: true });
  expect(store.getTask(task.id)).toMatchObject({
    revision: 3,
    deliveryMode: "github",
    executionMode: "auto",
    models: { plan: { model: "strong", effort: "high" } },
  });
  expect(result.events).toEqual([{ type: "task.configured", data: {} }]);
});

test.each(["accept", "decline"] as const)(
  "grant %s updates only a pending approval belonging to the task",
  (decision) => {
    const { store, task, execute } = fixture();
    const approval = {
      id: "approval",
      taskId: task.id,
      requestId: 7,
      method: "exec",
      params: {},
      decision: null,
    };
    store.putRecord("approval", "approval", {
      ...approval,
      taskId: "other-task",
    });
    expect(execute("grant", { id: "approval", decision }).outcome).toEqual({
      error: "Error: approval_request_expired",
    });
    store.putRecord("approval", "approval", approval);
    expect(
      execute("grant", { id: "approval", decision: "invalid" }).outcome,
    ).toEqual({ error: "Error: approval_request_expired" });
    const result = execute("grant", { id: "approval", decision });
    expect(result.outcome).toEqual({ ok: true });
    expect(store.getRecord("approval", "approval")).toEqual({
      ...approval,
      decision,
    });
    expect(result.events).toEqual([]);
    expect(execute("grant", { id: "approval", decision }).outcome).toEqual({
      error: "Error: approval_request_expired",
    });
    expect(store.getTask(task.id)).toEqual(task);
  },
);
