import type { DatabaseSync } from "node:sqlite";
import { json, type RecordBodyRow as Row } from "./serialization";

export function createRecordRepository(db: DatabaseSync) {
  return {
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
  };
}
