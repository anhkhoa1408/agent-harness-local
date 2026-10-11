import { TaskStatus } from "../../domain/constants/task-status";
import { ApplicationErrorCode, EventType } from "../constants/index";
import type { ApplicationStore } from "../ports";
import type { Attempt } from "../pipeline-contracts";

import { workerEvent as event } from "./events";
export function restoreInterruptedTasks(
  store: ApplicationStore,
  bootId: string | null,
) {
  // The previous worker's attempts ended; agent/process safety still uses exclusions below.
  for (const attempt of store.attempts.list() as Attempt[])
    if (attempt.status === TaskStatus.RUNNING)
      store.attempts.put(attempt.id, {
        ...attempt,
        status: TaskStatus.INTERRUPTED,
        output: { error: "worker_restart_runtime_unknown" },
      });
  // Unknown runtimes survive process death. An explicit reconciliation is required before reuse.
  for (const task of store.tasks
    .list()
    .filter((t) => t.status === TaskStatus.RUNNING))
    store.atomic(() => {
      const ownership = store.ownership.get(task.id) as {
        bootId: string | null;
      } | null;
      store.exclusions.put(task.id, {
        taskId: task.id,
        reason: ApplicationErrorCode.RUNTIME_STATE_UNKNOWN,
        bootId: ownership?.bootId ?? null,
      });
      store.tasks.update(
        task.id,
        task.revision,
        {
          status: TaskStatus.INTERRUPTED,
          reason: ApplicationErrorCode.RUNTIME_STATE_UNKNOWN,
        },
        event(EventType.RECOVERY_REQUIRED),
      );
    });
  for (const record of store.exclusions.list() as {
    taskId: string;
    bootId: string | null;
  }[]) {
    if (bootId && record.bootId && bootId !== record.bootId)
      store.atomic(() => {
        const task = store.tasks.get(record.taskId);
        store.exclusions.delete(task.id);
        if (
          ![TaskStatus.COMPLETED, TaskStatus.CANCELLED].some(
            (value) => value === task.status,
          )
        )
          store.tasks.update(
            task.id,
            task.revision,
            { status: TaskStatus.PAUSED, reason: "host_restart_confirmed" },
            event(EventType.RECOVERY_STOPPED),
          );
      });
  }
  for (const command of store.commands.running())
    store.commands.finish(command.id, {
      error: "interrupted_command_check_state",
    });
}
