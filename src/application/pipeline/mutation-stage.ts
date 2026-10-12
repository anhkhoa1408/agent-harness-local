import { DomainErrorCode } from "../../domain/constants/domain-error-code";
import { PipelineStage } from "../../domain/constants/pipeline-stage";
import { TaskStatus } from "../../domain/constants/task-status";
import { ApplicationErrorCode, EventType } from "../constants/index";
import { type Task } from "../../domain/contracts";

import { type CheckResult } from "../../domain/evidence";
import { evidenceExclusions } from "../../domain/evidence";
import { canImplement } from "../../domain/transitions";

import type { StageHandlerContext } from "./context";
import type { StageHandler } from "../pipeline-contracts";
import { queuedStageResult } from "./stage-result";
export function createMutationHandler(
  context: StageHandlerContext,
): StageHandler {
  const { store, planOf, stageTask, executor } = context;
  return async (task: Task, signal: AbortSignal) => {
    const plan = planOf(task);
    if (!canImplement(task, plan) || !task.worktree)
      throw new Error(DomainErrorCode.PLAN_NOT_APPROVED);
    const result = await executor.executeAgentStage(
      task,
      task.stage as "implement" | "repair",
      context.validation.outputs.mutation,
      {
        task: stageTask(task),
        plan,
        profile: store.profiles.get(
          `${task.repositoryId}:${task.sourceCommit}`,
        ),
        ...(task.stage === PipelineStage.REPAIR
          ? {
              failures: await context.verificationIO.failureEvidence(
                (store.checks.get(task.id) ?? []) as CheckResult[],
              ),
              review: store.reviews.get(task.id),
            }
          : {}),
        instruction:
          "Complete every approved implementation step in dependency order, including test files, test runner configuration and approved dependency setup. Do not stop after only the application code or skip missing test/setup steps. Dependencies already listed in the approved plan are in scope. Do not commit. Use feature TDD; expected red is allowed. If an environment or permission prevents completing a step, report the concrete blocker in the summary. The worker runs final checks and owns verdicts. For repair use bounded failure excerpts and selected screenshot evidence first; read additional logs only when needed. If scope/dependencies change return needsReplan before changing them.",
      },
      signal,
    );
    if (result.needsReplan) {
      const current = store.tasks.get(task.id);
      store.tasks.update(
        task.id,
        current.revision,
        {
          approvedPlanVersion: null,
          resumeStage: task.stage,
          stage: PipelineStage.PLAN,
          status: TaskStatus.QUEUED,
          reason: result.reason,
        },
        { type: EventType.PLAN_INVALIDATED, data: result },
      );
      return queuedStageResult(PipelineStage.PLAN, result);
    }
    const changed = [
      ...(
        await context.deliveryIO.git.changedFiles(
          task.worktree,
          task.sourceCommit,
        )
      ).split("\n"),
      ...(await context.deliveryIO.git.untrackedFiles(task.worktree)).split(
        "\n",
      ),
    ].filter(Boolean);
    const allowed = plan.steps.flatMap((s) => s.files);
    const reports = evidenceExclusions(plan);
    if (
      changed.some(
        (path) =>
          !reports.includes(path) &&
          !allowed.some(
            (p) => path === p || (p.endsWith("/") && path.startsWith(p)),
          ),
      )
    )
      throw new Error(ApplicationErrorCode.SCOPE_CHANGED_REQUIRES_PLAN);
    return queuedStageResult(PipelineStage.VERIFY, result);
  };
}
