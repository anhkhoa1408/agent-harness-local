import type { DatabaseSync } from "node:sqlite";
import { json, type RecordBodyRow as Row } from "./serialization";

export function createRecordRepository(db: DatabaseSync) {
  // Statements belong to this connection; the store still owns transactions and fencing.
  const put = db.prepare(
    "INSERT INTO records(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
  );
  const get = db.prepare("SELECT body FROM records WHERE kind=? AND id=?");
  const list = db.prepare(
    "SELECT body FROM records WHERE kind=? ORDER BY rowid",
  );
  const remove = db.prepare("DELETE FROM records WHERE kind=? AND id=?");
  return {
    putRecord(kind: string, id: string, value: unknown) {
      put.run(kind, id, json(value));
    },
    getRecord(kind: string, id: string): unknown {
      const row = get.get(kind, id) as Row | undefined;
      return row ? JSON.parse(row.body) : null;
    },
    listRecords(kind: string): unknown[] {
      return (list.all(kind) as Row[]).map((row) => JSON.parse(row.body));
    },
    deleteRecord(kind: string, id: string) {
      remove.run(kind, id);
    },
  };
}
