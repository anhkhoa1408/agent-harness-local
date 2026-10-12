import type { StoryRun } from "../contracts";

export function planKey(taskId: string, version: number | null): string {
  return `${taskId}:${version}`;
}

export function storyKey(
  run: Pick<StoryRun, "featureId" | "planVersion" | "storyId">,
): string {
  return `${run.featureId}:${run.planVersion}:${run.storyId}`;
}
