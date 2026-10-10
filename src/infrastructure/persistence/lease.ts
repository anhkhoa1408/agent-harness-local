import type { DatabaseSync } from "node:sqlite";
import { transaction } from "./database";
import type { Store } from "./store";
export type Lease = { owner: string; epoch: number; expiresAt: number };
function init(db: DatabaseSync) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS worker_lease(singleton INTEGER PRIMARY KEY CHECK(singleton=1),owner TEXT NOT NULL,epoch INTEGER NOT NULL,expires_at INTEGER NOT NULL)",
  );
}
export function claimLease(
  db: DatabaseSync,
  owner: string,
  now: number,
  ttlMs: number,
): Lease | null {
  init(db);
  return transaction(db, () => {
    const old = db
      .prepare(
        "SELECT owner,epoch,expires_at FROM worker_lease WHERE singleton=1",
      )
      .get() as
      { owner: string; epoch: number; expires_at: number } | undefined;
    if (old && old.expires_at > now) return null;
    const lease = {
      owner,
      epoch: (old?.epoch ?? 0) + 1,
      expiresAt: now + ttlMs,
    };
    db.prepare("INSERT OR REPLACE INTO worker_lease VALUES(1,?,?,?)").run(
      owner,
      lease.epoch,
      lease.expiresAt,
    );
    return lease;
  });
}
export function renewLease(
  db: DatabaseSync,
  lease: Lease,
  now: number,
  ttlMs: number,
): boolean {
  const result = db
    .prepare(
      "UPDATE worker_lease SET expires_at=? WHERE singleton=1 AND owner=? AND epoch=? AND expires_at>?",
    )
    .run(now + ttlMs, lease.owner, lease.epoch, now);
  if (result.changes === 1) {
    lease.expiresAt = now + ttlMs;
    return true;
  }
  return false;
}
export function assertLease(db: DatabaseSync, lease: Lease, now = Date.now()) {
  if (
    !db
      .prepare(
        "SELECT 1 FROM worker_lease WHERE singleton=1 AND owner=? AND epoch=? AND expires_at>?",
      )
      .get(lease.owner, lease.epoch, now)
  )
    throw new Error("lease_lost");
}
export function releaseLease(db: DatabaseSync, lease: Lease) {
  db.prepare(
    "UPDATE worker_lease SET expires_at=0 WHERE singleton=1 AND owner=? AND epoch=?",
  ).run(lease.owner, lease.epoch);
}
export function fencedStore(store: Store, lease: Lease, now = Date.now): Store {
  const writes = new Set([
    "atomic",
    "createTask",
    "updateTask",
    "addEvent",
    "enqueue",
    "nextCommand",
    "finishCommand",
    "putRecord",
    "deleteRecord",
    "removeRepository",
  ]);
  return new Proxy(store, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (writes.has(String(key)))
        return (...args: unknown[]) =>
          transaction(store.db, () => {
            assertLease(store.db, lease, now());
            return value.apply(target, args);
          });
      return value;
    },
  });
}
