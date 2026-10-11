import { AttemptStatus } from "../../domain/constants/attempt-status";
import { StoryRunState } from "../../domain/constants/story-run-state";
import { errorMessage } from "../utils/index";
import {
  ApplicationErrorCode,
  EventType,
  WorkerTiming,
} from "../constants/index";
import { TaskStatus } from "../../domain/constants/task-status";
import { StoryService, storyKey } from "../stories";

import type { ApplicationStore } from "../ports";
import type { RuntimePort } from "../runtime";

import { type Task } from "../../domain/contracts";

import type {
  Attempt,
  Handlers,
  ActiveStageAttempt,
} from "../pipeline-contracts";
import { workerEvent as event } from "./events";
export async function executeStageAttempt(
  store: ApplicationStore,
  handlers: Handlers,
  storyService: StoryService,
  bootId: string | null,
  next: Task,
  attempt: Attempt,
  task: Task,
  entry: ActiveStageAttempt,
  signal: AbortSignal,
  hasLostLease: () => boolean,
  runtime: RuntimePort,
) {
  const abort = entry.abort;

  try {
    const result = await handlers[next.stage](
      task,
      AbortSignal.any([
        abort.signal,
        AbortSignal.timeout(WorkerTiming.STAGE_TIMEOUT_MS),
      ]),
    );
    if (hasLostLease()) return;
    const current = store.tasks.get(next.id);
    store.atomic(() => {
      const run = storyService
        .listStoryRuns(next.featureId ?? next.id)
        .find((r) => r.storyId === attempt.storyId);
      if (
        run &&
        run.state !== StoryRunState.COMPLETED &&
        (entry.stop ||
          [TaskStatus.BLOCKED, TaskStatus.INTERRUPTED, TaskStatus.PAUSED].some(
            (value) => value === result.status,
          ))
      )
        store.storyRuns.put(storyKey(run), {
          ...run,
          state:
            entry.stop ||
            [TaskStatus.PAUSED, TaskStatus.INTERRUPTED].some(
              (value) => value === result.status,
            )
              ? StoryRunState.INTERRUPTED
              : StoryRunState.BLOCKED,
          updatedAt: runtime.now(),
        });
      store.attempts.put(attempt.id, {
        ...attempt,
        ...store.attempts.get(attempt.id),
        status: AttemptStatus.COMPLETED,
        output: result.output,
        nextStage: result.stage,
        nextStatus: entry.stop ?? result.status,
      });
      // Some handlers save a versioned plan and perform their own atomic transition.
      if (current.status === TaskStatus.RUNNING)
        store.tasks.update(
          current.id,
          current.revision,
          {
            stage: result.stage,
            status: entry.stop ?? result.status,
            reason: result.reason,
          },
          event(EventType.STAGE_COMPLETED, {
            stage: next.stage,
            output: result.output,
          }),
        );
    });
  } catch (error) {
    if (hasLostLease()) return;
    const current = store.tasks.get(next.id);
    const message = errorMessage(error, String);
    const unknown = message.includes(
      ApplicationErrorCode.RUNTIME_STATE_UNKNOWN,
    );
    store.atomic(() => {
      if (unknown)
        store.exclusions.put(current.id, {
          taskId: current.id,
          reason: ApplicationErrorCode.RUNTIME_STATE_UNKNOWN,
          bootId,
        });
      const run = storyService
        .listStoryRuns(next.featureId ?? next.id)
        .find((r) => r.storyId === attempt.storyId);
      if (run && run.state !== StoryRunState.COMPLETED)
        store.storyRuns.put(storyKey(run), {
          ...run,
          state: abort.signal.aborted
            ? StoryRunState.INTERRUPTED
            : StoryRunState.BLOCKED,
          updatedAt: runtime.now(),
        });
      store.attempts.put(attempt.id, {
        ...attempt,
        ...store.attempts.get(attempt.id),
        status: abort.signal.aborted
          ? AttemptStatus.INTERRUPTED
          : AttemptStatus.FAILED,
        output: { error: message },
      });
      store.tasks.update(
        current.id,
        current.revision,
        {
          status: unknown
            ? TaskStatus.INTERRUPTED
            : (entry.stop ??
              (signal.aborted ? TaskStatus.PAUSED : TaskStatus.BLOCKED)),
          reason: unknown
            ? ApplicationErrorCode.RUNTIME_STATE_UNKNOWN
            : message,
        },
        event(EventType.STAGE_STOPPED, { error: message }),
      );
    });
  }
}
