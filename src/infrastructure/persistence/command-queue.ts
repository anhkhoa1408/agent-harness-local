import { transaction } from "./database";
import {
  ControlCommandSchema,
  type Task,
  type ControlCommand,
} from "../validation/contracts";
import type { DatabaseSync } from "node:sqlite";
import { json, type RecordBodyRow as Row } from "./serialization";

export function createCommandQueue(
  db: DatabaseSync,
  getTask: (id: string) => Task,
) {
  return {
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
  };
}
