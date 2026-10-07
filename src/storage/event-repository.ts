import { EVENT_PAGE_SIZE } from "./limits";

import { type Event } from "../core/contracts";
import type { DatabaseSync } from "node:sqlite";
import { json } from "./serialization";

export function createEventRepository(db: DatabaseSync) {
  function appendEvent(taskId: string, type: string, data: unknown) {
    db.prepare("INSERT INTO events(task_id,type,data,at) VALUES(?,?,?,?)").run(
      taskId,
      type,
      json(data),
      Date.now(),
    );
  }
  return {
    addEvent(taskId: string, type: string, data: unknown) {
      appendEvent(taskId, type, data);
    },
    events(taskId: string, after: number): Event[] {
      return (
        db
          .prepare(
            `SELECT seq,task_id,type,data,at FROM events WHERE task_id=? AND seq>? ORDER BY seq LIMIT ${EVENT_PAGE_SIZE}`,
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
  };
}
