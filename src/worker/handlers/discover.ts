import { RepoProfileSchema } from "../../core/contracts";

import { sourceDocuments } from "../../repositories/inspect";

import type { StageHandlerContext } from "../handler-context";
import type { StageHandler } from "../types";
import { queuedStageResult } from "../stage-result";
export function createDiscoverHandler(
  context: StageHandlerContext,
): StageHandler {
  const { store, repository, executor } = context;
  return async (task, signal) => {
    const repo = repository(task),
      docs = await sourceDocuments(repo);
    const profile = await executor.executeAgentStage(
      task,
      "discover",
      RepoProfileSchema,
      `Inspect the committed source snapshot only. Do not run setup or commands. Return languages, areas, candidate argv commands, prerequisites, evidence paths and unknowns. Missing or truncated files are unknowns. repositoryId=${repo.id}; sourceCommit=${repo.head}`,
      signal,
    );
    if (
      profile.repositoryId !== repo.id ||
      profile.sourceCommit !== repo.head ||
      profile.evidence.some((e) => !docs.some((d) => d.path === e.path))
    )
      throw new Error("invalid_profile_evidence");
    store.putRecord(
      "profile",
      `${task.repositoryId}:${task.sourceCommit}`,
      profile,
    );
    return queuedStageResult("analyze", profile);
  };
}
