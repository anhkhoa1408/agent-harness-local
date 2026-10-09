import { type CheckResult } from "../../../domain/evidence";

import { nextAfterReview } from "../../../domain/transitions";
import { acceptanceErrors } from "../../../domain/acceptance";
import type { StageHandlerContext } from "../context";
import type { StageHandler } from "../../pipeline-contracts";

export function createReviewHandler(
  context: StageHandlerContext,
): StageHandler {
  const { store, planOf, stageTask, fingerprint, storyService, executor } =
    context;
  return async (task, signal) => {
    storyService.assertEvidence(task);
    const plan = planOf(task),
      before = await fingerprint(task, plan),
      checks = (store.checks.get(task.id) ?? []) as CheckResult[];
    await context.verificationIO.verifyImageEvidence(checks);
    const review = await executor.executeAgentStage(
      task,
      "review",
      context.validation.outputs.review,
      {
        task: stageTask(task),
        plan,
        checks,
        fingerprint: before,
        diff: await context.repositoryIO.diff(
          task.worktree!,
          task.sourceCommit,
        ),
        instruction:
          "Independently review the final worktree and tests. Every acceptance criterion needs evidence. Selected UI screenshots already have worker-recorded ui:* verdicts; use those results instead of repeating browser exploration. Return the exact fingerprint and plan version.",
      },
      signal,
    );
    if (
      review.taskId !== task.id ||
      review.planVersion !== plan.version ||
      review.fingerprint !== before
    )
      throw new Error("stale_review");
    const after = await fingerprint(task, plan);
    if (before !== after) throw new Error("review_snapshot_changed");
    store.reviews.put(task.id, review);
    const errors = acceptanceErrors(task, plan, checks, review, after);
    store.acceptance.put(task.id, {
      passed: errors.length === 0,
      errors,
      fingerprint: after,
    });
    if (review.verdict === "pass" && errors.length)
      return {
        stage: "review",
        status: "blocked",
        reason: errors.join(","),
        output: review,
      };
    return { ...nextAfterReview(task, review), output: review };
  };
}
