import { test, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../../src/storage/store";
import { claimLease, renewLease, fencedStore } from "../../src/storage/lease";
import { decideRecovery } from "../../src/worker/recovery";
import { runWorker } from "../../src/worker/engine";
import { taskFixture } from "../support/task-fixture";
import { stages } from "../../src/core/contracts";
import { spawn } from "node:child_process";
import { once } from "node:events";
test("SIGKILL and worker restart preserve interrupted attempt without another writer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crash-worker")),
    db = join(dir, "db"),
    store = openStore(db),
    stop = new AbortController();
  const task = store.createTask(taskFixture());
  let calls = 0;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/support/crash-worker.ts", db],
    { cwd: process.cwd(), stdio: "ignore" },
  );
  try {
    for (let i = 0; i < 100 && store.getTask(task.id).status !== "running"; i++)
      await new Promise((r) => setTimeout(r, 20));
    expect(store.getTask(task.id).status).toBe("running");
    child.kill("SIGKILL");
    await once(child, "exit");
    store.db.prepare("UPDATE worker_lease SET expires_at=0").run();
    const running = runWorker(
      store,
      Object.fromEntries(
        stages.map((stage) => [
          stage,
          async () => {
            calls++;
            return { stage, status: "blocked", reason: null, output: null };
          },
        ]),
      ) as any,
      stop.signal,
    );
    await new Promise((r) => setTimeout(r, 80));
    stop.abort();
    await running;
    expect(calls).toBe(0);
    expect(store.getTask(task.id).status).toBe("interrupted");
    expect(store.listRecords("attempt")).toHaveLength(1);
  } finally {
    stop.abort();
    child.kill("SIGKILL");
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("two connections share one owner and expired epoch cannot append events or effects", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lease"));
  const a = openStore(join(dir, "db")),
    b = openStore(join(dir, "db"));
  try {
    const lease = claimLease(a.db, "a", 100, 100)!;
    expect(claimLease(b.db, "b", 101, 100)).toBeNull();
    const guarded = fencedStore(a, lease, () => 201);
    expect(() => guarded.putRecord("effect", "x", {})).toThrow("lease_lost");
    expect(renewLease(a.db, lease, 201, 100)).toBe(false);
    expect(claimLease(b.db, "b", 201, 100)?.epoch).toBe(2);
    expect(a.getRecord("effect", "x")).toBeNull();
  } finally {
    a.close();
    b.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("unknown old runtime never allows another writer", () => {
  expect(
    decideRecovery({ agent: "unknown", process: "stopped", effect: "absent" }),
  ).toBe("wait");
  expect(
    decideRecovery({ agent: "stopped", process: "stopped", effect: "unknown" }),
  ).toBe("reconcile");
  expect(
    decideRecovery({ agent: "stopped", process: "stopped", effect: "absent" }),
  ).toBe("resume");
});
test("one queued task produces one attempt and shutdown releases lease", async () => {
  const dir = await mkdtemp(join(tmpdir(), "worker")),
    store = openStore(join(dir, "db")),
    stop = new AbortController();
  let calls = 0;
  try {
    const task = store.createTask(taskFixture());
    const handler = async () => {
      calls++;
      return {
        stage: "analyze" as const,
        status: "waiting_input" as const,
        reason: null,
        output: {},
      };
    };
    const handlers = Object.fromEntries(
      stages.map((s) => [s, handler]),
    ) as unknown as Parameters<typeof runWorker>[1];
    const running = runWorker(store, handlers, stop.signal);
    await new Promise((r) => setTimeout(r, 80));
    stop.abort();
    await running;
    expect(calls).toBe(1);
    expect(store.getTask(task.id).status).toBe("waiting_input");
    expect(store.listRecords("attempt")).toHaveLength(1);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("crash recovery excludes every queued writer even if unknown task is cancelled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "recovery")),
    store = openStore(join(dir, "db")),
    stop = new AbortController();
  let calls = 0;
  try {
    const old = store.createTask(taskFixture());
    store.updateTask(
      old.id,
      0,
      { status: "running", stage: "implement" },
      { type: "fixture", data: {} },
    );
    store.createTask(taskFixture());
    const handler = async () => {
      calls++;
      return {
        stage: "analyze" as const,
        status: "waiting_input" as const,
        reason: null,
        output: {},
      };
    };
    const running = runWorker(
      store,
      Object.fromEntries(stages.map((s) => [s, handler])) as any,
      stop.signal,
    );
    await new Promise((r) => setTimeout(r, 60));
    const interrupted = store.getTask(old.id);
    store.enqueue({
      id: "cancel-old",
      taskId: old.id,
      kind: "cancel",
      expectedRevision: interrupted.revision,
      payload: {},
    });
    await new Promise((r) => setTimeout(r, 60));
    stop.abort();
    await running;
    expect(calls).toBe(0);
    expect(store.getRecord("exclusion", old.id)).not.toBeNull();
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
