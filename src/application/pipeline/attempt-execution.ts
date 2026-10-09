import { StoryService, storyKey } from "../stories";
import { STAGE_TIMEOUT_MS } from "../limits";

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
      task!,
      AbortSignal.any([abort.signal, AbortSignal.timeout(STAGE_TIMEOUT_MS)]),
    );
    if (hasLostLease()) return;
    const current = store.tasks.get(next.id);
    store.atomic(() => {
      const run = storyService
        .listStoryRuns(next.featureId ?? next.id)
        .find((r) => r.storyId === attempt.storyId);
      if (
        run &&
        run.state !== "completed" &&
        (entry.stop ||
          ["blocked", "interrupted", "paused"].includes(result.status))
      )
        store.storyRuns.put(storyKey(run), {
          ...run,
          state:
            entry.stop || ["paused", "interrupted"].includes(result.status)
              ? "interrupted"
              : "blocked",
          updatedAt: runtime.now(),
        });
      store.attempts.put(attempt.id, {
        ...attempt,
        ...(store.attempts.get(attempt.id) as object),
        status: "completed",
        output: result.output,
        nextStage: result.stage,
        nextStatus: entry.stop ?? result.status,
      });
      // Some handlers save a versioned plan and perform their own atomic transition.
      if (current.status === "running")
        store.tasks.update(
          current.id,
          current.revision,
          {
            stage: result.stage,
            status: entry.stop ?? result.status,
            reason: result.reason,
          },
          event("stage.completed", {
            stage: next.stage,
            output: result.output,
          }),
        );
    });
  } catch (error) {
    if (hasLostLease()) return;
    const current = store.tasks.get(next.id),
      message = error instanceof Error ? error.message : String(error);
    const unknown = message.includes("runtime_state_unknown");
    store.atomic(() => {
      if (unknown)
        store.exclusions.put(current.id, {
          taskId: current.id,
          reason: "runtime_state_unknown",
          bootId,
        });
      const run = storyService
        .listStoryRuns(next.featureId ?? next.id)
        .find((r) => r.storyId === attempt.storyId);
      if (run && run.state !== "completed")
        store.storyRuns.put(storyKey(run), {
          ...run,
          state: abort.signal.aborted ? "interrupted" : "blocked",
          updatedAt: runtime.now(),
        });
      store.attempts.put(attempt.id, {
        ...attempt,
        ...(store.attempts.get(attempt.id) as object),
        status: abort.signal.aborted ? "interrupted" : "failed",
        output: { error: message },
      });
      store.tasks.update(
        current.id,
        current.revision,
        {
          status: unknown
            ? "interrupted"
            : (entry.stop ?? (signal.aborted ? "paused" : "blocked")),
          reason: unknown ? "runtime_state_unknown" : message,
        },
        event("stage.stopped", { error: message }),
      );
    });
  } finally {
  }
}
