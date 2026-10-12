import { PipelineStage } from "../../../domain/constants/pipeline-stage";
import { TaskStatus } from "../../../domain/constants/task-status";
import type { StageHandlerContext } from "../context";
import type { StageHandler } from "../../pipeline-contracts";

export function createAnalyzeHandler(
  context: StageHandlerContext,
): StageHandler {
  const { store, stageTask, executor } = context;
  return async (task, signal) => {
    const analysis = await executor.executeAgentStage(
      task,
      PipelineStage.ANALYZE,
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
      stage: analysis.questions.length
        ? PipelineStage.ANALYZE
        : PipelineStage.PLAN,
      status: analysis.questions.length
        ? TaskStatus.WAITING_INPUT
        : TaskStatus.QUEUED,
      reason: null,
      output: analysis,
    };
  };
}
