import { test, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../../src/storage/store";
import { createHttpHandler } from "../../src/server/http";
import { bootstrapSession } from "../../src/server/local-session";
import { taskFixture } from "../support/task-fixture";
import { TaskService } from "../support/services";
import { inspectRepository, gitText } from "../../src/repositories/inspect";
import { createTempRepo } from "../support/temp-repo";
import { runWorker } from "../../src/worker/engine";
import { stages } from "../../src/core/contracts";

async function fixture() {
  const data = await mkdtemp(join(tmpdir(), "repository-removal-"));
  const store = openStore(":memory:");
  const handle = createHttpHandler(store, data, async () => []);
  const base = "http://127.0.0.1:3100",
    host = "127.0.0.1:3100";
  const boot = bootstrapSession(
    new Request(`${base}/session`, {
      headers: { host, "sec-fetch-mode": "navigate", "sec-fetch-site": "none" },
    }),
    store,
  );
  const cookie = boot.headers.get("set-cookie")!.split(";")[0];
  const { csrf } = await (
    await handle(
      new Request(`${base}/api/session`, {
        headers: { host, cookie },
      }),
    )
  ).json();
  return {
    store,
    data,
    request: (path: string, method = "GET", extra = {}) =>
      handle(
        new Request(`${base}/api/${path}`, {
          method,
          headers: {
            host,
            cookie,
            origin: base,
            "x-harness-csrf": csrf,
            ...extra,
          },
        }),
      ),
    async dispose() {
      store.close();
      await rm(data, { recursive: true, force: true });
    },
  };
}

test("creating a task cannot recreate history after its repository was removed during validation", async () => {
  const f = await fixture();
  const repo = await createTempRepo({});
  try {
    f.store.putRecord("repository", "repo", {
      ...(await inspectRepository(repo.root, "main", null)),
      id: "repo",
    });
    const service = new TaskService(f.store, { readGit: gitText }, async () => {
      expect((await f.request("repositories/repo", "DELETE")).status).toBe(200);
      return [
        { id: "strong", efforts: ["high"], isDefault: false },
        { id: "medium", efforts: ["medium"], isDefault: false },
      ];
    });
    await expect(service.createTask({ ...taskFixture() })).rejects.toThrow(
      "repository_not_found",
    );
    expect(f.store.listTasks()).toEqual([]);
  } finally {
    await f.dispose();
    await repo.dispose();
  }
});

test("removal cannot race a worker claiming a queued task", async () => {
  const data = await mkdtemp(join(tmpdir(), "repository-claim-"));
  const store = openStore(join(data, "db"));
  const otherConnection = openStore(join(data, "db"));
  otherConnection.db.exec("PRAGMA busy_timeout=1");
  const stop = new AbortController();
  let removalError: unknown;
  let attempted = false;
  let executions = 0;
  const listTasks = store.listTasks;
  store.listTasks = () => {
    const tasks = listTasks();
    // Interleave a separate database writer after the queue snapshot is read.
    tasks.reverse = () => {
      if (!attempted) {
        attempted = true;
        try {
          otherConnection.removeRepository("repo");
        } catch (error) {
          removalError = error;
        }
      }
      return Array.prototype.reverse.call(tasks);
    };
    return tasks;
  };
  try {
    store.putRecord("repository", "repo", { id: "repo" });
    const task = store.createTask(taskFixture());
    const handlers = Object.fromEntries(
      stages.map((stage) => [
        stage,
        async () => {
          executions++;
          stop.abort();
          return { stage, status: "paused", reason: null, output: null };
        },
      ]),
    ) as unknown as Parameters<typeof runWorker>[1];
    await expect(
      runWorker(store, handlers, stop.signal),
    ).resolves.toBeUndefined();
    expect(attempted).toBe(true);
    expect(removalError).toBeInstanceOf(Error);
    expect(executions).toBe(1);
    expect(store.getTask(task.id).status).toBe("paused");
  } finally {
    stop.abort();
    store.close();
    otherConnection.close();
    await rm(data, { recursive: true, force: true });
  }
});

test("removal deletes task history, stories, profiles and artifacts while preserving other repositories and Git files", async () => {
  const f = await fixture();
  try {
    const root = join(f.data, "repo"),
      worktree = join(f.data, "worktree");
    for (const dir of [root, worktree]) {
      await mkdir(dir);
      await writeFile(join(dir, "keep.txt"), "code");
    }
    f.store.putRecord("repository", "repo", { id: "repo", root });
    f.store.putRecord("repository", "other", { id: "other" });
    const task = f.store.createTask(taskFixture());
    const child = f.store.createTask(
      taskFixture({ featureId: task.id, storyId: "story" }),
    );
    const other = f.store.createTask(taskFixture({ repositoryId: "other" }));
    const expectedRemaining = f.store.db.prepare("SELECT * FROM records").all();
    for (const t of [task, child]) {
      f.store.updateTask(
        t.id,
        0,
        { status: "completed", worktree },
        { type: "done", data: {} },
      );
      f.store.enqueue({
        id: `command-${t.id}`,
        taskId: t.id,
        kind: "cancel",
        expectedRevision: 1,
        payload: {},
      });
      f.store.putRecord("analysis", t.id, { summary: "history" });
      f.store.putRecord("checks", t.id, []);
      f.store.putRecord("bundle", `${t.id}:plan`, { hash: "bundle" });
      f.store.putRecord("answer", `${t.id}:1`, { answer: "answer" });
      f.store.putRecord("effect", `${t.id}:commit:hash`, {
        state: "confirmed",
      });
      f.store.putRecord("plan", `${t.id}:1`, { taskId: t.id });
      for (const kind of ["attempt", "approval", "plan-comment", "artifact"])
        f.store.putRecord(kind, `${kind}-${t.id}`, { taskId: t.id });
      f.store.putRecord("parent", t.id, { threadId: "parent" });
      await mkdir(join(f.data, "artifacts", t.id), { recursive: true });
      await writeFile(join(f.data, "artifacts", t.id, "log.txt"), "history");
    }
    f.store.putRecord("story-run", `${task.id}:1:story`, {
      featureId: task.id,
      childTaskId: child.id,
    });
    f.store.putRecord("profile", "repo:hash", { repositoryId: "repo" });
    f.store.putRecord("profile", "other:hash", { repositoryId: "other" });
    f.store.putRecord("checks", other.id, [{ result: "keep" }]);
    await mkdir(join(f.data, "artifacts", other.id), { recursive: true });
    await writeFile(join(f.data, "artifacts", other.id, "log.txt"), "keep");
    const response = await f.request("repositories/repo", "DELETE");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deletedTasks: 2 });
    expect(f.store.listTasks().map((t) => t.id)).toEqual([other.id]);
    expect(f.store.db.prepare("SELECT * FROM commands").all()).toEqual([]);
    expect(
      f.store.db.prepare("SELECT DISTINCT task_id FROM events").all(),
    ).toEqual([{ task_id: other.id }]);
    const remaining = f.store.db.prepare("SELECT * FROM records").all();
    expect(remaining).toEqual([
      ...expectedRemaining.filter((r) => r.id !== "repo"),
      {
        kind: "profile",
        id: "other:hash",
        body: JSON.stringify({ repositoryId: "other" }),
      },
      {
        kind: "checks",
        id: other.id,
        body: JSON.stringify([{ result: "keep" }]),
      },
    ]);
    for (const t of [task, child]) {
      await expect(
        readFile(join(f.data, "artifacts", t.id, "log.txt")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect((await f.request(`tasks/${t.id}`)).status).toBe(404);
    }
    expect((await f.request(`artifacts/artifact-${task.id}`)).status).toBe(404);
    for (const dir of [root, worktree])
      expect(await readFile(join(dir, "keep.txt"), "utf8")).toBe("code");
    expect(
      await readFile(join(f.data, "artifacts", other.id, "log.txt"), "utf8"),
    ).toBe("keep");
  } finally {
    await f.dispose();
  }
});

for (const active of ["running", "attempt", "exclusion", "command"] as const) {
  test(`removal refuses ${active} execution without deleting any history`, async () => {
    const f = await fixture();
    try {
      f.store.putRecord("repository", "repo", { id: "repo" });
      const task = f.store.createTask(taskFixture());
      if (active === "running")
        f.store.updateTask(
          task.id,
          0,
          { status: "running" },
          { type: "started", data: {} },
        );
      if (active === "attempt")
        f.store.putRecord("attempt", "active", {
          taskId: task.id,
          status: "running",
        });
      if (active === "exclusion")
        f.store.putRecord("exclusion", task.id, {
          taskId: task.id,
          reason: "runtime_state_unknown",
        });
      if (active === "command") {
        f.store.enqueue({
          id: "active",
          taskId: task.id,
          kind: "cancel",
          expectedRevision: 0,
          payload: {},
        });
        f.store.nextCommand();
      }
      const before = ["tasks", "records", "events", "commands"].map((table) =>
        f.store.db.prepare(`SELECT * FROM ${table}`).all(),
      );
      const response = await f.request("repositories/repo", "DELETE");
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "repository_busy" });
      expect(
        ["tasks", "records", "events", "commands"].map((table) =>
          f.store.db.prepare(`SELECT * FROM ${table}`).all(),
        ),
      ).toEqual(before);
    } finally {
      await f.dispose();
    }
  });
}

test("removal ignores an old running attempt after a later attempt has finished", async () => {
  const f = await fixture();
  try {
    f.store.putRecord("repository", "repo", { id: "repo" });
    const task = f.store.createTask(taskFixture());
    f.store.putRecord("attempt", "old", { taskId: task.id, status: "running" });
    f.store.putRecord("attempt", "new", {
      taskId: task.id,
      status: "completed",
    });
    f.store.updateTask(
      task.id,
      0,
      { status: "completed" },
      { type: "done", data: {} },
    );
    expect((await f.request("repositories/repo", "DELETE")).status).toBe(200);
    expect(f.store.listTasks()).toEqual([]);
  } finally {
    await f.dispose();
  }
});

test("removal allows a recovered task once a host restart confirmed the previous process stopped", async () => {
  const f = await fixture();
  try {
    f.store.putRecord("repository", "repo", { id: "repo" });
    const task = f.store.createTask(taskFixture());
    f.store.putRecord("attempt", "old", { taskId: task.id, status: "running" });
    f.store.updateTask(
      task.id,
      0,
      { status: "paused", reason: "host_restart_confirmed" },
      { type: "recovered", data: {} },
    );
    expect((await f.request("repositories/repo", "DELETE")).status).toBe(200);
    expect(f.store.listTasks()).toEqual([]);
  } finally {
    await f.dispose();
  }
});

test("removal rolls back the database if deleting related history fails", async () => {
  const f = await fixture();
  try {
    f.store.putRecord("repository", "repo", { id: "repo" });
    const task = f.store.createTask(taskFixture());
    f.store.enqueue({
      id: "command",
      taskId: task.id,
      kind: "cancel",
      expectedRevision: 0,
      payload: {},
    });
    f.store.db.exec(
      "CREATE TRIGGER fail_removal BEFORE DELETE ON commands BEGIN SELECT RAISE(ABORT, 'fixture_failure'); END",
    );
    const before = ["tasks", "records", "events", "commands"].map((table) =>
      f.store.db.prepare(`SELECT * FROM ${table}`).all(),
    );
    expect((await f.request("repositories/repo", "DELETE")).status).toBe(400);
    expect(
      ["tasks", "records", "events", "commands"].map((table) =>
        f.store.db.prepare(`SELECT * FROM ${table}`).all(),
      ),
    ).toEqual(before);
  } finally {
    await f.dispose();
  }
});

test("removal requires session and CSRF, returns 404 for missing repositories and supports empty repositories", async () => {
  const f = await fixture();
  try {
    f.store.putRecord("repository", "repo", { id: "repo" });
    for (const extra of [
      { cookie: "" },
      { "x-harness-csrf": "" },
      { origin: "https://evil.test" },
    ])
      expect(
        (await f.request("repositories/repo", "DELETE", extra)).status,
      ).toBe(403);
    expect(f.store.getRecord("repository", "repo")).not.toBeNull();
    expect((await f.request("repositories/missing", "DELETE")).status).toBe(
      404,
    );
    const response = await f.request("repositories/repo", "DELETE");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deletedTasks: 0 });
    expect(f.store.getRecord("repository", "repo")).toBeNull();
  } finally {
    await f.dispose();
  }
});
