import type { Store } from "../storage/store";

import { workerEvent as event } from "./events";
export function restoreInterruptedTasks(store: Store, bootId: string | null) {
  // Unknown runtimes survive process death. An explicit reconciliation is required before reuse.
  for (const task of store.listTasks().filter((t) => t.status === "running"))
    store.atomic(() => {
      const ownership = store.getRecord("ownership", task.id) as {
        bootId: string | null;
      } | null;
      store.putRecord("exclusion", task.id, {
        taskId: task.id,
        reason: "runtime_state_unknown",
        bootId: ownership?.bootId ?? null,
      });
      store.updateTask(
        task.id,
        task.revision,
        { status: "interrupted", reason: "runtime_state_unknown" },
        event("recovery.required"),
      );
    });
  for (const record of store.listRecords("exclusion") as {
    taskId: string;
    bootId: string | null;
  }[]) {
    if (bootId && record.bootId && bootId !== record.bootId)
      store.atomic(() => {
        const task = store.getTask(record.taskId);
        store.deleteRecord("exclusion", task.id);
        if (!["completed", "cancelled"].includes(task.status))
          store.updateTask(
            task.id,
            task.revision,
            { status: "paused", reason: "host_restart_confirmed" },
            event("recovery.stopped"),
          );
      });
  }
  for (const command of store.runningCommands())
    store.finishCommand(command.id, {
      error: "interrupted_command_check_state",
    });
}
