import { randomUUID } from "node:crypto";
import { openDatabase, transaction } from "./database";
import {
  NewTaskSchema,
  TaskSchema,
  ControlCommandSchema,
  type NewTask,
  type Task,
  type ControlCommand,
  type Event,
} from "../core/contracts";

const json = (value: unknown): string => JSON.stringify(value ?? null);
type Row = { body: string };
export function openStore(filename: string) {
  const db = openDatabase(filename);
  function appendEvent(taskId: string, type: string, data: unknown) {
    db.prepare("INSERT INTO events(task_id,type,data,at) VALUES(?,?,?,?)").run(
      taskId,
      type,
      json(data),
      Date.now(),
    );
  }
  function getTask(id: string): Task {
    const row = db.prepare("SELECT body FROM tasks WHERE id=?").get(id) as
      Row | undefined;
    if (!row) throw new Error("task_not_found");
    return TaskSchema.parse(JSON.parse(row.body));
  }
  return {
    db,
    atomic<T>(work: () => T): T {
      return transaction(db, work);
    },
    createTask(raw: NewTask): Task {
      const input = NewTaskSchema.parse(raw);
      const id = randomUUID();
      const now = Date.now();
      const task: Task = {
        ...input,
        id,
        stage: "discover",
        status: "queued",
        reason: null,
        revision: 0,
        planVersion: null,
        approvedPlanVersion: null,
        repairCount: 0,
        worktree: null,
        branch: `codex/${id.slice(0, 8)}-${
          input.title
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40) || "task"
        }`,
        resumeStage: null,
        createdAt: now,
        updatedAt: now,
      };
      transaction(db, () => {
        db.prepare("INSERT INTO tasks VALUES(?,?,?)").run(id, 0, json(task));
        appendEvent(id, "task.created", {});
      });
      return task;
    },
    getTask,
    listTasks(): Task[] {
      return (
        db.prepare("SELECT body FROM tasks ORDER BY rowid DESC").all() as Row[]
      ).map((r) => TaskSchema.parse(JSON.parse(r.body)));
    },
    updateTask(
      id: string,
      expectedRevision: number,
      patch: Partial<Task>,
      event: { type: string; data: unknown },
    ): Task {
      return transaction(db, () => {
        const current = getTask(id);
        if (current.revision !== expectedRevision)
          throw new Error("revision_conflict");
        if (
          patch.featureId !== undefined ||
          patch.storyId !== undefined ||
          patch.id !== undefined ||
          patch.revision !== undefined ||
          patch.createdAt !== undefined
        )
          throw new Error("immutable_field");
        const updated = TaskSchema.parse({
          ...current,
          ...patch,
          revision: expectedRevision + 1,
          updatedAt: Date.now(),
        });
        const result = db
          .prepare(
            "UPDATE tasks SET revision=?,body=? WHERE id=? AND revision=?",
          )
          .run(updated.revision, json(updated), id, expectedRevision);
        if (result.changes !== 1) throw new Error("revision_conflict");
        appendEvent(id, event.type, event.data);
        return updated;
      });
    },
    addEvent(taskId: string, type: string, data: unknown) {
      appendEvent(taskId, type, data);
    },
    events(taskId: string, after: number): Event[] {
      return (
        db
          .prepare(
            "SELECT seq,task_id,type,data,at FROM events WHERE task_id=? AND seq>? ORDER BY seq LIMIT 500",
          )
          .all(taskId, after) as {
          seq: number;
          task_id: string;
          type: string;
          data: string;
          at: number;
        }[]
      ).map((r) => ({
        seq: r.seq,
        taskId: r.task_id,
        type: r.type,
        data: JSON.parse(r.data),
        at: r.at,
      }));
    },
    enqueue(raw: ControlCommand): boolean {
      const command = ControlCommandSchema.parse(raw);
      const body = json(command);
      return transaction(db, () => {
        const old = db
          .prepare("SELECT body FROM commands WHERE id=?")
          .get(command.id) as Row | undefined;
        if (old) {
          if (old.body !== body) throw new Error("command_conflict");
          return false;
        }
        getTask(command.taskId);
        db.prepare(
          "INSERT INTO commands(id,task_id,body,state) VALUES(?,?,?,'pending')",
        ).run(command.id, command.taskId, body);
        return true;
      });
    },
    nextCommand(): ControlCommand | null {
      return transaction(db, () => {
        const row = db
          .prepare(
            "SELECT body FROM commands WHERE state='pending' ORDER BY CASE json_extract(body,'$.kind') WHEN 'cancel' THEN 0 WHEN 'pause' THEN 1 ELSE 2 END,rowid LIMIT 1",
          )
          .get() as Row | undefined;
        if (!row) return null;
        const command = ControlCommandSchema.parse(JSON.parse(row.body));
        db.prepare(
          "UPDATE commands SET state='running' WHERE id=? AND state='pending'",
        ).run(command.id);
        return command;
      });
    },
    runningCommands(): ControlCommand[] {
      return (
        db
          .prepare("SELECT body FROM commands WHERE state='running'")
          .all() as Row[]
      ).map((r) => ControlCommandSchema.parse(JSON.parse(r.body)));
    },
    finishCommand(id: string, outcome: unknown) {
      db.prepare(
        "UPDATE commands SET state='done',outcome=? WHERE id=? AND state='running'",
      ).run(json(outcome), id);
    },
    putRecord(kind: string, id: string, value: unknown) {
      db.prepare(
        "INSERT INTO records(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
      ).run(kind, id, json(value));
    },
    getRecord(kind: string, id: string): unknown {
      const row = db
        .prepare("SELECT body FROM records WHERE kind=? AND id=?")
        .get(kind, id) as Row | undefined;
      return row ? JSON.parse(row.body) : null;
    },
    listRecords(kind: string): unknown[] {
      return (
        db
          .prepare("SELECT body FROM records WHERE kind=? ORDER BY rowid")
          .all(kind) as Row[]
      ).map((r) => JSON.parse(r.body));
    },
    deleteRecord(kind: string, id: string) {
      db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
    },
    close() {
      db.close();
    },
  };
}
export type Store = ReturnType<typeof openStore>;
