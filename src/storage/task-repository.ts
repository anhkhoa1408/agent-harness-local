import { BRANCH_SLUG_CHARACTERS, BRANCH_ID_PREFIX_CHARACTERS } from "./limits";
import { randomUUID } from "node:crypto";
import { transaction } from "./database";
import {
  NewTaskSchema,
  TaskSchema,
  type NewTask,
  type Task,
} from "../core/contracts";
import type { DatabaseSync } from "node:sqlite";
import { json, type RecordBodyRow as Row } from "./serialization";

export function createTaskRepository(
  db: DatabaseSync,
  appendEvent: (taskId: string, type: string, data: unknown) => void,
) {
  function getTask(id: string): Task {
    const row = db.prepare("SELECT body FROM tasks WHERE id=?").get(id) as
      Row | undefined;
    if (!row) throw new Error("task_not_found");
    return TaskSchema.parse(JSON.parse(row.body));
  }
  return {
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
        branch: `codex/${id.slice(0, BRANCH_ID_PREFIX_CHARACTERS)}-${
          input.title
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, BRANCH_SLUG_CHARACTERS) || "task"
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
  };
}
