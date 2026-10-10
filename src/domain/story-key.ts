import type { StoryRun } from "./contracts";
export const storyKey = (
  run: Pick<StoryRun, "featureId" | "planVersion" | "storyId">,
) => `${run.featureId}:${run.planVersion}:${run.storyId}`;
