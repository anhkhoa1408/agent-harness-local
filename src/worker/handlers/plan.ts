import { PlanOutputSchema, parsePlanOutput } from "../../context/plan-output";

import type { StageHandlerContext } from "../handler-context";
import type { StageHandler } from "../types";

export function createPlanHandler(context: StageHandlerContext): StageHandler {
  const { store, planOf, stageTask, planService, executor } = context;
  return async (task, signal) => {
    const output = await executor.executeAgentStage(
      task,
      "plan",
      PlanOutputSchema,
      {
        task: stageTask(task),
        version: (task.planVersion ?? 0) + 1,
        previousPlan: task.planVersion ? planOf(task) : null,
        feedback: planService
          .planComments(task.id)
          .filter((c) => c.version === task.planVersion),
        analysis: store.getRecord("analysis", task.id),
        profile: store.getRecord(
          "profile",
          `${task.repositoryId}:${task.sourceCommit}`,
        ),
        storyInstruction: task.splitIntoStories
          ? "Return nonempty stories partitioning all criteria and steps exactly once. Each story needs id, title, outcome, points (1,2,3,5,8), dependsOn, criterionIds, stepIds. Stories should be small independently testable deliveries. Dependencies must be acyclic and include cross-story step dependencies. Never estimate quota or choose stories for the user."
          : "Return stories: null.",
        instruction:
          "Address all feedback on the previous plan when present. Return an implementation plan with exact argv feature checks, explicit file paths, acceptance/check mappings, prerequisites, dependencies and unresolved decisions. Do not implement. Tests must produce TAP or JUnit (reportPath); exit-code checks need a literal successPattern. E2E command owns isolated server readiness and cleanup. For visible UI changes include uiVerification with 1-6 selected PNG screenshots, each produced by a required E2E check, criterionIds, viewport dimensions and optional local PNG referencePath. Capture viewport-only images with deviceScaleFactor=1 at exact paths relative to the worktree root. Define visual expectations in the mapped criteria. Do not select screenshots for logic-only tasks. References must exist; never invent design evidence. If reference is missing, evaluate against explicit UI criteria or ask for clarification.",
      },
      signal,
    );
    const plan = parsePlanOutput(output);
    const saved = planService.savePlan(task.id, plan);
    return {
      stage: saved.stage,
      status: saved.status,
      reason: saved.reason,
      output: plan,
    };
  };
}
