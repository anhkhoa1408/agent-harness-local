import { PersistenceErrorCode } from "./constants/persistence-error-code";
import {
  ApplicationErrorCode,
  EventType,
} from "../../application/constants/index";
import {
  initializeTask,
  assertMutableTaskPatch,
} from "../../domain/task-policy";
import { randomUUID } from "node:crypto";
import { transaction } from "./database";
import {
  NewTaskSchema,
  TaskSchema,
  type NewTask,
  type Task,
} from "../validation/contracts";
import type { DatabaseSync } from "node:sqlite";
import { json, type RecordBodyRow as Row } from "./serialization";

export function createTaskRepository(
  db: DatabaseSync,
  appendEvent: (taskId: string, type: string, data: unknown) => void,
) {
  function getTask(id: string): Task {
    const row = db.prepare("SELECT body FROM tasks WHERE id=?").get(id) as
      Row | undefined;
    if (!row) throw new Error(PersistenceErrorCode.TASK_NOT_FOUND);
    return TaskSchema.parse(JSON.parse(row.body));
  }
  return {
    createTask(raw: NewTask): Task {
      const input = NewTaskSchema.parse(raw);
      const id = randomUUID();
      const now = Date.now();
      const task = initializeTask(input, id, now);
      transaction(db, () => {
        db.prepare("INSERT INTO tasks VALUES(?,?,?)").run(id, 0, json(task));
        appendEvent(id, EventType.TASK_CREATED, {});
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
          throw new Error(ApplicationErrorCode.REVISION_CONFLICT);
        assertMutableTaskPatch(patch);
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
        if (result.changes !== 1)
          throw new Error(ApplicationErrorCode.REVISION_CONFLICT);
        appendEvent(id, event.type, event.data);
        return updated;
      });
    },
  };
}
