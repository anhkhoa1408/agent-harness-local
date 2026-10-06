import { mutationSchema } from "./mutation-schema";

import { type Task } from "../core/contracts";

import { gitText } from "../repositories/inspect";

import { type CheckResult } from "../execution/checks";
import { evidenceExclusions } from "../execution/ui-verification";
import { failureEvidence } from "../execution/failure-evidence";
import { canImplement } from "../core/transitions";

import type { StageHandlerContext } from "./handler-context";
import type { StageHandler } from "./types";
import { queuedStageResult } from "./stage-result";
export function createMutationHandler(
  context: StageHandlerContext,
): StageHandler {
  const { store, planOf, stageTask, executor } = context;
  return async (task: Task, signal: AbortSignal) => {
    const plan = planOf(task);
    if (!canImplement(task, plan) || !task.worktree)
      throw new Error("plan_not_approved");
    const result = await executor.executeAgentStage(
      task,
      task.stage as "implement" | "repair",
      mutationSchema,
      {
        task: stageTask(task),
        plan,
        profile: store.getRecord(
          "profile",
          `${task.repositoryId}:${task.sourceCommit}`,
        ),
        ...(task.stage === "repair"
          ? {
              failures: await failureEvidence(
                (store.getRecord("checks", task.id) ?? []) as CheckResult[],
              ),
              review: store.getRecord("review", task.id),
            }
          : {}),
        instruction:
          "Implement only approved files and scope. Do not commit. Use feature TDD; expected red is allowed. For repair use bounded failure excerpts and selected screenshot evidence first; read additional logs only when needed. If scope/dependencies change return needsReplan before changing them.",
      },
      signal,
    );
    if (result.needsReplan) {
      const current = store.getTask(task.id);
      store.updateTask(
        task.id,
        current.revision,
        {
          approvedPlanVersion: null,
          resumeStage: task.stage,
          stage: "plan",
          status: "queued",
          reason: result.reason,
        },
        { type: "plan.invalidated", data: result },
      );
      return queuedStageResult("plan", result);
    }
    const changed = [
        ...(
          await gitText(task.worktree, [
            "diff",
            "--name-only",
            task.sourceCommit,
            "--",
          ])
        ).split("\n"),
        ...(
          await gitText(task.worktree, [
            "ls-files",
            "--others",
            "--exclude-standard",
          ])
        ).split("\n"),
      ].filter(Boolean),
      allowed = plan.steps.flatMap((s) => s.files),
      reports = evidenceExclusions(plan);
    if (
      changed.some(
        (path) =>
          !reports.includes(path) &&
          !allowed.some(
            (p) => path === p || (p.endsWith("/") && path.startsWith(p)),
          ),
      )
    )
      throw new Error("scope_changed_requires_plan");
    return queuedStageResult("verify", result);
  };
}
