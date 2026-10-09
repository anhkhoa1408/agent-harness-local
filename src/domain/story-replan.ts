import type { Plan, StoryRun } from "./contracts";
import { projectStoryPlan } from "./stories";
function comparable(plan: Plan) {
  const {
    taskId: _id,
    version: _version,
    sourceCommit: _source,
    ...scope
  } = plan;
  return JSON.stringify(scope);
}
export function assertCompletedStoryScopeUnchanged(
  previous: Plan,
  plan: Plan,
  runs: StoryRun[],
) {
  for (const run of runs.filter((r) => r.state === "completed")) {
    if (
      !plan.stories?.some((s) => s.id === run.storyId) ||
      comparable(
        projectStoryPlan(previous, run.storyId, previous.sourceCommit),
      ) !== comparable(projectStoryPlan(plan, run.storyId, plan.sourceCommit))
    )
      throw new Error("completed_story_changed");
    const old = previous.stories!.find((s) => s.id === run.storyId)!;
    const next = plan.stories!.find((s) => s.id === run.storyId)!;
    if (JSON.stringify(old) !== JSON.stringify(next))
      throw new Error("completed_story_changed");
  }
}
