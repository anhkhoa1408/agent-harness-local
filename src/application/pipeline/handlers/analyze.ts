import type { StageHandlerContext } from "../context";
import type { StageHandler } from "../../pipeline-contracts";

export function createAnalyzeHandler(
  context: StageHandlerContext,
): StageHandler {
  const { store, stageTask, executor } = context;
  return async (task, signal) => {
    const analysis = await executor.executeAgentStage(
      task,
      "analyze",
      context.validation.outputs.analysis,
      {
        task: stageTask(task),
        profile: store.profiles.get(
          `${task.repositoryId}:${task.sourceCommit}`,
        ),
      },
      signal,
    );
    store.analyses.put(task.id, analysis);
    return {
      stage: analysis.questions.length ? "analyze" : "plan",
      status: analysis.questions.length ? "waiting_input" : "queued",
      reason: null,
      output: analysis,
    };
  };
}
