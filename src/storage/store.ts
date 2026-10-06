import { openDatabase, transaction } from "./database";
import { createTaskRepository } from "./task-repository";
import { createEventRepository } from "./event-repository";
import { createCommandQueue } from "./command-queue";
import { createRecordRepository } from "./record-repository";
export function openStore(filename: string) {
  const db = openDatabase(filename);
  const events = createEventRepository(db);
  const tasks = createTaskRepository(db, events.addEvent);
  const commands = createCommandQueue(db, tasks.getTask);
  const records = createRecordRepository(db);
  return {
    db,
    atomic<T>(work: () => T): T {
      return transaction(db, work);
    },
    ...tasks,
    ...commands,
    ...records,
    ...events,
    close() {
      db.close();
    },
  };
}
export type Store = ReturnType<typeof openStore>;
