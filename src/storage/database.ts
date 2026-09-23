import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function openDatabase(filename: string): DatabaseSync {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL REFERENCES tasks(id),type TEXT NOT NULL,data TEXT NOT NULL,at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),body TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','running','done')),outcome TEXT);
    CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
  `);
  return db;
}
let savepoint = 0;
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  const nested = db.isTransaction;
  const name = `tx_${++savepoint}`;
  db.exec(nested ? `SAVEPOINT ${name}` : "BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec(nested ? `RELEASE ${name}` : "COMMIT");
    return result;
  } catch (error) {
    db.exec(nested ? `ROLLBACK TO ${name}` : "ROLLBACK");
    if (nested) db.exec(`RELEASE ${name}`);
    throw error;
  }
}
