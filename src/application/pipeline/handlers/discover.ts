import { PipelineStage } from "../../../domain/constants/pipeline-stage";
import { ApplicationErrorCode } from "../../constants/index";
import type { StageHandlerContext } from "../context";
import type { StageHandler } from "../../pipeline-contracts";
import { queuedStageResult } from "../stage-result";
export function createDiscoverHandler(
  context: StageHandlerContext,
): StageHandler {
  const { store, repository, executor } = context;
  return async (task, signal) => {
    const repo = repository(task),
      docs = await context.repositoryIO.sourceDocuments(repo);
    const profile = await executor.executeAgentStage(
      task,
      PipelineStage.DISCOVER,
      context.validation.outputs.profile,
      `Inspect the committed source snapshot only. Do not run setup or commands. Return languages, areas, candidate argv commands, prerequisites, evidence paths and unknowns. Missing or truncated files are unknowns. repositoryId=${repo.id}; sourceCommit=${repo.head}`,
      signal,
    );
    if (
      profile.repositoryId !== repo.id ||
      profile.sourceCommit !== repo.head ||
      profile.evidence.some((e) => !docs.some((d) => d.path === e.path))
    )
      throw new Error(ApplicationErrorCode.INVALID_PROFILE_EVIDENCE);
    store.profiles.put(`${task.repositoryId}:${task.sourceCommit}`, profile);
    return queuedStageResult(PipelineStage.ANALYZE, profile);
  };
}
