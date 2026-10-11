import { expect, test, vi } from "vitest";
import { openStore } from "../../src/infrastructure/persistence/store";
import { createRecordRepository } from "../../src/infrastructure/persistence/record-repository";
import { createServices } from "../../src/bootstrap/services";
import { DashboardService } from "../../src/application/dashboard";
import { systemRuntime } from "../../src/infrastructure/runtime/system";
import { validation } from "../../src/infrastructure/validation/gateway";
import type { Attempt } from "../../src/application/pipeline-contracts";
import { taskFixture } from "../support/task-fixture";

function attempt(
  taskId: string,
  id: string,
  patch: Partial<Attempt> = {},
): Attempt {
  return {
    id,
    taskId,
    stage: "discover",
    status: "completed",
    nextStage: "analyze",
    nextStatus: "queued",
    output: null,
    leaseEpoch: 1,
    model: null,
    bundleHash: null,
    threadId: null,
    turnId: null,
    fingerprint: null,
    ...patch,
  };
}

function dashboard(store: ReturnType<typeof openStore>) {
  const services = createServices(store);
  return {
    data: services.store,
    service: new DashboardService(
      services.store,
      services.stories,
      services.plans,
      systemRuntime,
      validation,
      { diff: async () => "" },
    ),
  };
}

test("dashboard reads attempts in linear passes while preserving task and attempt order", () => {
  const raw = openStore(":memory:");
  try {
    const { data, service } = dashboard(raw);
    const tasks = Array.from({ length: 12 }, () =>
      raw.createTask(taskFixture()),
    );
    for (let round = 0; round < 2; round++) {
      for (const task of tasks)
        data.attempts.put(
          `${task.id}:${round}`,
          attempt(task.id, `${task.id}:${round}`),
        );
    }
    const storedAttempts = data.attempts.list();
    let taskIdReads = 0;
    vi.spyOn(data.attempts, "list").mockImplementation(() =>
      storedAttempts.map((item) => ({
        ...item,
        get taskId() {
          taskIdReads++;
          return item.taskId;
        },
      })),
    );
    const result = service.tasks();
    expect(result.map((task) => task.id)).toEqual(
      [...tasks].reverse().map((task) => task.id),
    );
    expect(
      result.every(
        (task) =>
          task.pipeline.find((node) => node.stage === "analyze")?.state ===
          "pending",
      ),
    ).toBe(true);
    expect(taskIdReads).toBeLessThanOrEqual(storedAttempts.length * 2);
  } finally {
    raw.close();
  }
});

test("dashboard keeps interleaved repair/replan history isolated and includes tasks without attempts", () => {
  const raw = openStore(":memory:");
  try {
    const { data, service } = dashboard(raw);
    const first = raw.createTask(taskFixture());
    const second = raw.createTask(taskFixture());
    const empty = raw.createTask(taskFixture());
    raw.updateTask(
      first.id,
      0,
      { stage: "plan", status: "waiting_approval" },
      { type: "test", data: {} },
    );
    raw.updateTask(
      second.id,
      0,
      { stage: "review", status: "running" },
      { type: "test", data: {} },
    );
    const history = [
      attempt(first.id, "a1", { stage: "implement", nextStage: "verify" }),
      attempt(second.id, "b1", { stage: "implement", nextStage: "verify" }),
      attempt(first.id, "a2", {
        stage: "verify",
        nextStage: "repair",
        output: [{ status: "failed" }],
      }),
      attempt(second.id, "b2", {
        stage: "verify",
        nextStage: "review",
        output: [{ status: "passed" }],
      }),
      attempt(first.id, "a3", {
        stage: "repair",
        nextStage: "plan",
        output: { needsReplan: true },
      }),
    ];
    for (const item of history) data.attempts.put(item.id, item);
    const byTask = new Map(
      service.tasks().map((task) => [task.id, task.pipeline]),
    );
    expect(
      byTask.get(first.id)?.find((node) => node.stage === "implement")?.state,
    ).toBe("pending");
    expect(
      byTask.get(first.id)?.find((node) => node.stage === "plan")?.label,
    ).toBe("Chờ duyệt");
    expect(
      byTask.get(second.id)?.find((node) => node.stage === "verify")?.state,
    ).toBe("done");
    expect(
      byTask.get(second.id)?.find((node) => node.stage === "review")?.state,
    ).toBe("current");
    expect(
      byTask.get(empty.id)?.every((node) => node.state === "pending"),
    ).toBe(true);
  } finally {
    raw.close();
  }
});

test("record CRUD prepares four statements once and retains upsert insertion order", () => {
  const raw = openStore(":memory:");
  try {
    const prepare = vi.spyOn(raw.db, "prepare");
    const records = createRecordRepository(raw.db);
    records.putRecord("plan", "b", { version: 1 });
    records.putRecord("plan", "a", { version: 2 });
    records.putRecord("plan", "b", { version: 3 });
    expect(records.getRecord("plan", "b")).toEqual({ version: 3 });
    expect(records.listRecords("plan")).toEqual([
      { version: 3 },
      { version: 2 },
    ]);
    records.deleteRecord("plan", "b");
    expect(records.getRecord("plan", "b")).toBeNull();
    expect(records.listRecords("plan")).toEqual([{ version: 2 }]);
    expect(prepare).toHaveBeenCalledTimes(4);
  } finally {
    raw.close();
  }
});

test("prepared record statements remain connection-local and usable after rollback", () => {
  const first = openStore(":memory:");
  const second = openStore(":memory:");
  try {
    first.putRecord("plan", "same", { version: 1 });
    second.putRecord("plan", "same", { version: 2 });
    expect(() =>
      first.atomic(() => {
        first.putRecord("plan", "same", { version: 3 });
        first.deleteRecord("plan", "same");
        throw Error("rollback");
      }),
    ).toThrow("rollback");
    expect(first.getRecord("plan", "same")).toEqual({ version: 1 });
    expect(second.getRecord("plan", "same")).toEqual({ version: 2 });
    first.putRecord("plan", "same", { version: 4 });
    expect(first.getRecord("plan", "same")).toEqual({ version: 4 });
  } finally {
    first.close();
    second.close();
  }
});
