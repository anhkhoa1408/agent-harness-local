import { stages } from "../core/contracts";
import type { Handlers } from "./engine";
import { z } from "zod";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createDelivery } from "../delivery/github";
import {
  aiStages,
  AnalysisSchema,
  PlanSchema,
  RepositorySchema,
  ReviewSchema,
  RepoProfileSchema,
  type Task,
  type AiStage,
  type Plan,
} from "../core/contracts";
import type { Store } from "../storage/store";
import type { AgentClient, AgentInput } from "../codex/client";
import { parentModel } from "../codex/subagents";
import { resolveModel, applyEffortPolicy } from "../core/model-policy";
import { resolveBundle, snapshotBundle, type Bundle } from "../context/skills";
import { composeInstructions, stageEnvelope } from "../context/prompts";
import {
  sourceDocuments,
  gitText,
  withSourceSnapshot,
} from "../repositories/inspect";
import { repoRules, contentHash } from "../context/rules";
import { prepareWorktree } from "../repositories/worktree";
import { fingerprintWorktree } from "../repositories/fingerprint";
import { runChecks, type CheckResult } from "../execution/checks";
import {
  canImplement,
  nextAfterReview,
  stageAfterPreparation,
} from "../core/transitions";
import { acceptanceErrors } from "../core/acceptance";
import { savePlan, planComments } from "../server/services";
export function unavailableHandlers(): Handlers {
  return Object.fromEntries(
    stages.map((stage) => [
      stage,
      async () => ({
        stage,
        status: "blocked",
        reason: "capability_unavailable",
        output: null,
      }),
    ]),
  ) as unknown as Handlers;
}
export function createHandlers(
  store: Store,
  client: AgentClient,
  data: string,
): Handlers {
  const artifacts = (task: Task) => join(data, "artifacts", task.id);
  const repository = (task: Task) => ({
    ...RepositorySchema.parse(store.getRecord("repository", task.repositoryId)),
    head: task.sourceCommit,
  });
  const planOf = (task: Task) =>
    PlanSchema.parse(store.getRecord("plan", `${task.id}:${task.planVersion}`));
  const stageTask = (task: Task) => ({
    id: task.id,
    title: task.title,
    requirement: task.requirement,
    sourceCommit: task.sourceCommit,
    planVersion: task.planVersion,
  });
  const fingerprint = (task: Task, plan: Plan) =>
    fingerprintWorktree(
      task.worktree!,
      plan.checks.flatMap((c) => (c.reportPath ? [c.reportPath] : [])),
      task.sourceCommit,
    );
  async function freeze(task: Task) {
    if (
      aiStages.every((stage) =>
        store.getRecord("bundle", `${task.id}:${stage}`),
      )
    )
      return;
    await withSourceSnapshot(repository(task), async (sourceRoot) => {
      for (const stage of aiStages) {
        const key = `${task.id}:${stage}`;
        if (store.getRecord("bundle", key)) continue;
        const bundle = await resolveBundle(
          stage,
          sourceRoot,
          [],
          /\b(liquid|shopify)\b/i.test(task.requirement),
        );
        const path = await snapshotBundle(bundle, artifacts(task));
        store.putRecord("bundle", key, bundle);
        store.putRecord("artifact", bundle.hash, {
          id: bundle.hash,
          taskId: task.id,
          path,
          type: "context",
        });
      }
    });
  }
  async function ai<T>(
    task: Task,
    stage: AiStage,
    schema: z.ZodType<T>,
    context: unknown,
    signal: AbortSignal,
  ): Promise<T> {
    await freeze(task);
    if (!task.worktree)
      return withSourceSnapshot(repository(task), (cwd) =>
        ai({ ...task, worktree: cwd }, stage, schema, context, signal),
      );
    task = { ...task, models: applyEffortPolicy(task.models) };
    const catalog = await client.models();
    if (!catalog.some(m => m.id === parentModel.model && m.efforts.includes(parentModel.effort)))
      throw new Error("parent_model_unavailable");
    const bundle = store.getRecord("bundle", `${task.id}:${stage}`) as Bundle,
      model = resolveModel(stage, task.models, {}, catalog);
    const attempt = store.listRecords("attempt").find((a: any) =>
      a.taskId === task.id && a.stage === stage && a.status === "running",
    ) as { id: string } | undefined;
    const attemptId = attempt?.id ?? randomUUID(),
      packetDir = join(artifacts(task), "delegations");
    await mkdir(packetDir, { recursive: true });
    const parent = store.getRecord("parent", task.id) as { threadId: string } | undefined;
    const input: AgentInput = {
      cwd: task.worktree!,
      model,
      instructions: composeInstructions(bundle),
      prompt: typeof context === "string" ? context : JSON.stringify(context),
      outputSchema: z.toJSONSchema(schema),
      executionMode: task.executionMode,
      write: stage === "implement" || stage === "repair",
      threadId: parent?.threadId,
      delegation: { stage, attemptId, packetPath: join(packetDir, `${attemptId}.json`) },
    };
    await writeFile(input.delegation!.packetPath, JSON.stringify({
      instructions: input.instructions, input: context,
      outputSchema: stageEnvelope(input),
    }), { flag: "wx", mode: 0o600 });
    store.putRecord("artifact", attemptId, {
      id: attemptId, taskId: task.id,
      path: input.delegation!.packetPath, type: "context",
    });
    const runtime = (update: Record<string, unknown>) => {
      const current = store.getRecord("runtime", task.id) as Record<string, unknown>;
      const value = { ...current, ...update };
      store.putRecord("runtime", task.id, value);
      if (attempt) store.putRecord("attempt", attemptId, {
        ...store.getRecord("attempt", attemptId) as object,
        threadId: value.threadId, turnId: value.turnId, child: value.child,
        bundleHash: bundle.hash, parentModel, usage: value.usage,
      });
    };
    store.putRecord("runtime", task.id, {
      stage, model, bundleHash: bundle.hash, attemptId,
      state: "preparing", threadId: parent?.threadId ?? null,
    });
    let poll: NodeJS.Timeout | undefined;
    const pending = new Set<string>();
    try {
      poll = setInterval(() => {
        for (const key of pending) {
          const grant = store.getRecord("approval", key) as {
            requestId: string | number;
            decision?: string;
          };
          if (grant.decision) {
            pending.delete(key);
            client
              .answer(grant.requestId, { decision: grant.decision })
              .catch(() => {});
          }
        }
      }, 100);
      const run = await client.run(
        input,
        (event) => {
          if (event.type === "approval") {
            if (task.executionMode === "auto") {
              void client.answer(event.data.requestId, { decision: "decline" });
              store.addEvent(task.id, "approval.auto_declined", {
                method: event.data.method,
              });
              return;
            }
            const key = `${task.id}:${String(event.data.requestId)}`;
            if (
              ![
                "item/commandExecution/requestApproval",
                "item/fileChange/requestApproval",
              ].includes(event.data.method)
            ) {
              void client.answer(event.data.requestId, { decision: "decline" });
              store.addEvent(task.id, "approval.unsupported", {
                method: event.data.method,
              });
              return;
            }
            store.putRecord("approval", key, {
              id: key,
              taskId: task.id,
              ...event.data,
              decision: null,
            });
            pending.add(key);
            store.addEvent(task.id, "approval.requested", {
              id: key,
              method: event.data.method,
            });
          } else if (event.type === "parent") {
            store.putRecord("parent", task.id, { threadId: event.data.threadId, model: parentModel });
            runtime({ threadId: event.data.threadId, parentModel });
          } else if (event.type === "child") {
            runtime({ child: event.data });
            store.addEvent(task.id, "subagent.started", { stage, attemptId, ...event.data });
          } else if (event.type === "started") {
            runtime({ threadId: event.data.threadId, turnId: event.data.turnId, parentModel, state: "running" });
            store.addEvent(task.id, "agent.started", {
              stage,
              model,
              ...event.data,
            });
          }
        },
        signal,
      );
      if (!run.child) throw new Error("subagent_evidence_missing");
      runtime({
        threadId: run.threadId,
        turnId: run.turnId,
        child: run.child,
        state: "stopped",
        usage: run.usage,
      });
      return schema.parse(run.result);
    } catch (error) {
      runtime({
        state: error instanceof Error && error.message.includes("runtime_state_unknown")
          ? "unknown" : "stopped",
      });
      throw error;
    } finally {
      if (poll) clearInterval(poll);
      for (const key of pending) store.deleteRecord("approval", key);
    }
  }
  const next = (stage: Task["stage"], output: unknown = null) => ({
    stage,
    status: "queued" as const,
    reason: null,
    output,
  });
  const mutationSchema = z.object({
    summary: z.string(),
    needsReplan: z.boolean(),
    reason: z.string().nullable(),
  });
  async function mutate(task: Task, signal: AbortSignal) {
    const plan = planOf(task);
    if (!canImplement(task, plan) || !task.worktree)
      throw new Error("plan_not_approved");
    const result = await ai(
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
        ...(task.stage === "repair" ? { checks: store.getRecord("checks", task.id), review: store.getRecord("review", task.id) } : {}),
        instruction:
          "Implement only approved files and scope. Do not commit. Use feature TDD; expected red is allowed. If scope/dependencies change return needsReplan before changing them.",
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
      return next("plan", result);
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
      reports = plan.checks.flatMap((c) =>
        c.reportPath ? [c.reportPath] : [],
      );
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
    return next("verify", result);
  }
  return {
    ...unavailableHandlers(),
    discover: async (task, signal) => {
      const repo = repository(task), docs = await sourceDocuments(repo);
      const profile = await ai(task, "discover", RepoProfileSchema,
        `Inspect the committed source snapshot only. Do not run setup or commands. Return languages, areas, candidate argv commands, prerequisites, evidence paths and unknowns. Missing or truncated files are unknowns. repositoryId=${repo.id}; sourceCommit=${repo.head}`, signal);
      if (profile.repositoryId !== repo.id || profile.sourceCommit !== repo.head || profile.evidence.some(e => !docs.some(d => d.path === e.path))) throw new Error("invalid_profile_evidence");
      store.putRecord(
        "profile",
        `${task.repositoryId}:${task.sourceCommit}`,
        profile,
      );
      return next("analyze", profile);
    },
    analyze: async (task, signal) => {
      const analysis = await ai(
        task,
        "analyze",
        AnalysisSchema,
        {
          task: stageTask(task),
          profile: store.getRecord(
            "profile",
            `${task.repositoryId}:${task.sourceCommit}`,
          ),
        },
        signal,
      );
      store.putRecord("analysis", task.id, analysis);
      return {
        stage: analysis.questions.length ? "analyze" : "plan",
        status: analysis.questions.length ? "waiting_input" : "queued",
        reason: null,
        output: analysis,
      };
    },
    plan: async (task, signal) => {
      const plan = await ai(
        task,
        "plan",
        PlanSchema,
        {
          task: stageTask(task),
          version: (task.planVersion ?? 0) + 1,
          previousPlan: task.planVersion ? planOf(task) : null,
          feedback: planComments(store, task.id).filter(
            (c) => c.version === task.planVersion,
          ),
          analysis: store.getRecord("analysis", task.id),
          profile: store.getRecord(
            "profile",
            `${task.repositoryId}:${task.sourceCommit}`,
          ),
          instruction:
            "Address all feedback on the previous plan when present. Return an implementation plan with exact argv feature checks, explicit file paths, acceptance/check mappings, prerequisites, dependencies and unresolved decisions. Do not implement. Tests must produce TAP or JUnit (reportPath); exit-code checks need a literal successPattern. E2E command owns isolated server readiness and cleanup.",
        },
        signal,
      );
      const saved = savePlan(store, task.id, plan);
      return {
        stage: saved.stage,
        status: saved.status,
        reason: saved.reason,
        output: plan,
      };
    },
    prepare: async (task) => {
      const plan = planOf(task);
      if (!canImplement(task, plan)) throw new Error("plan_not_approved");
      const path = await prepareWorktree(
        repository(task),
        task,
        join(data, "worktrees"),
      );
      const scoped = await repoRules(
        path,
        plan.steps.flatMap((s) => s.files),
        /\b(liquid|shopify)\b/i.test(task.requirement),
      );
      for (const stage of ["implement", "repair", "review"] as const) {
        const key = `${task.id}:${stage}`,
          original = store.getRecord("bundle", key) as Bundle;
        if (!original) throw new Error("context_missing");
        const files = [
          ...original.files.filter(
            (f) =>
              !f.id.startsWith("repo:") &&
              !f.id.startsWith("rule:") &&
              f.id !== "agent:ecc/e2e-runner",
          ),
          ...scoped,
          ...(plan.checks.some((c) => c.kind === "e2e")
            ? (original.optionalFiles ?? [])
            : []),
        ];
        const bundle = {
          ...original,
          files,
          hash: contentHash(
            JSON.stringify({
              stage,
              adaptations: original.adaptations,
              optionalFiles: (original.optionalFiles ?? []).map((f) => [
                f.id,
                f.sha256,
                f.path,
              ]),
              files: files.map((f) => [f.id, f.sha256, f.path]).sort(),
            }),
          ),
        };
        const snapshot = await snapshotBundle(bundle, artifacts(task));
        store.putRecord("bundle", key, bundle);
        store.putRecord("artifact", `${task.id}-${bundle.hash}`, {
          id: `${task.id}-${bundle.hash}`,
          taskId: task.id,
          path: snapshot,
          type: "context",
        });
      }
      const current = store.getTask(task.id);
      store.updateTask(
        task.id,
        current.revision,
        { worktree: path },
        { type: "worktree.prepared", data: { path, branch: task.branch } },
      );
      return next(stageAfterPreparation(task), { path });
    },
    implement: mutate,
    repair: mutate,
    verify: async (task, signal) => {
      const plan = planOf(task);
      if (!canImplement(task, plan)) throw new Error("plan_not_approved");
      const checks = await runChecks(task, plan, signal, artifacts(task));
      store.putRecord("checks", task.id, checks);
      for (const check of checks)
        if (check.evidencePath.startsWith(artifacts(task) + "/"))
          store.putRecord("artifact", `${task.id}-${check.id}-evidence`, {
            id: `${task.id}-${check.id}-evidence`,
            taskId: task.id,
            path: check.evidencePath,
            type: "test",
          });
      const failures = plan.checks.filter(
        (s) =>
          s.required &&
          !checks.some((c) => c.id === s.id && c.status === "passed"),
      );
      if (failures.length) {
        if (checks.some((c) => c.status === "blocked"))
          return {
            stage: "verify",
            status: "blocked",
            reason:
              checks.find((c) => c.status === "blocked")?.reason ??
              "test_blocked",
            output: checks,
          };
        if (task.repairCount >= 3)
          return {
            stage: "verify",
            status: "blocked",
            reason: "repair_limit",
            output: checks,
          };
        return next("repair", checks);
      }
      return next("review", checks);
    },
    deliver: async (task, signal) => {
      const delivery = await createDelivery(store, data)(task, signal);
      store.putRecord("delivery", task.id, delivery);
      return {
        stage: "deliver",
        status: "completed",
        reason: null,
        output: delivery,
      };
    },
    review: async (task, signal) => {
      const plan = planOf(task),
        before = await fingerprint(task, plan),
        checks = (store.getRecord("checks", task.id) ?? []) as CheckResult[];
      const review = await ai(
        task,
        "review",
        ReviewSchema,
        {
          task: stageTask(task),
          plan,
          checks,
          fingerprint: before,
          diff: await gitText(task.worktree!, [
            "diff",
            task.sourceCommit,
            "--",
          ]),
          instruction:
            "Independently review the final worktree and tests. Every acceptance criterion needs evidence. Return the exact fingerprint and plan version.",
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
      store.putRecord("review", task.id, review);
      const errors = acceptanceErrors(task, plan, checks, review, after);
      store.putRecord("acceptance", task.id, {
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
    },
  };
}
