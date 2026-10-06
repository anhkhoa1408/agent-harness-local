import { createStoryCheckpoint } from "../../delivery/checkpoint";

import { createDelivery } from "../../delivery/github";

import type { StageHandlerContext } from "../handler-context";
import type { StageHandler } from "../types";

export function createDeliverHandler(
  context: StageHandlerContext,
): StageHandler {
  const { store, data, planOf, storyService } = context;
  return async (task, signal) => {
    const e = storyService.getExecution(task.id);
    if (e?.selection.mode === "shared_pr") {
      storyService.assertEvidence(task);
      if (!e.aggregate) {
        const checkpoint = await createStoryCheckpoint(
          store,
          data,
          task,
          signal,
          storyService.getCheckpointContext(task),
        );
        signal.throwIfAborted();
        return storyService.completeSharedStory(task, checkpoint);
      }
    }
    await storyService.assertSharedHead(task, true);
    const delivery = await createDelivery(
      store,
      data,
      e?.selection.mode === "shared_pr"
        ? {
            plan: planOf(task),
            reportAppendix: `\n\n## Story checkpoints\n${storyService
              .listStoryRuns(task.id)
              .map(
                (r) => `- ${r.storyId}: ${r.state}; commit ${r.commit ?? "—"}`,
              )
              .join("\n")}`,
          }
        : {},
    )(task, signal);
    store.putRecord("delivery", task.id, delivery);
    return {
      stage: "deliver",
      status: "completed",
      reason: null,
      output: delivery,
    };
  };
}
