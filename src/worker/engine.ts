import { gitText } from "../repositories/inspect";
import { fingerprintWorktree } from "../repositories/fingerprint";
import { PlanService } from "../application/plan-service";
import { StoryService, storyKey } from "../application/story-service";
import { STAGE_TIMEOUT_MS, WORKER_POLL_INTERVAL_MS } from "./limits";
import { MAX_REPAIR_ROUNDS, WORKER_LEASE_TTL_MS, WORKER_HEARTBEAT_INTERVAL_MS } from "../core/limits";
import { applyEffortPolicy } from "../core/model-policy";
import { randomUUID } from "node:crypto";
import type { Store } from "../storage/store";
import {
  claimLease,
  renewLease,
  releaseLease,
  fencedStore,
  type Lease,
} from "../storage/lease";
import {
  ModelMapSchema,
  PlanSchema,
  type Task,
  type Stage,
  type Status,
  type ControlCommand,
  type StorySelection,
} from "../core/contracts";
import { ExecutionModeSchema } from "../core/contracts";
import { approvePlan } from "../core/transitions";
import { bootIdentity } from "./recovery";
export type StageResult = {
  stage: Stage;
  status: Status;
  reason: string | null;
  output: unknown;
};
export type StageHandler = (
  task: Task,
  signal: AbortSignal,
) => Promise<StageResult>;
export type Handlers = Record<Stage, StageHandler>;
export type Attempt = {
  id: string;
  taskId: string;
  storyId?: string | null;
  planVersion?: number | null;
  baselineCommit?: string;
  stage: Stage;
  leaseEpoch: number;
  status: "running" | "completed" | "interrupted" | "failed";
  output: unknown;
  nextStage?: Stage;
  nextStatus?: Status;
  model: Task["models"][keyof Task["models"]] | null;
  bundleHash: string | null;
  threadId: string | null;
  turnId: string | null;
  fingerprint: string | null;
};
const event = (type: string, data: unknown = {}) => ({ type, data });
export async function runWorker(
  raw: Store,
  source: Handlers | ((store: Store, lease: Lease) => Handlers),
  signal: AbortSignal,
) {
  const lease = claimLease(raw.db, randomUUID(), Date.now(), WORKER_LEASE_TTL_MS);
  if (!lease) throw new Error("worker_already_running");
  const store = fencedStore(raw, lease),
    handlers = typeof source === "function" ? source(store, lease) : source,
    bootId = bootIdentity();
  const storyService = new StoryService(store, { readGit: gitText, fingerprintWorktree });
  const planService = new PlanService(store, storyService);
  let active: {
    taskId: string;
    abort: AbortController;
    promise: Promise<void>;
    stop: "paused" | "cancelled" | null;
  } | null = null;
  let lost = false;
  store.putRecord("health", "worker", { at: Date.now(), owner: lease.owner });
  const heartbeat = setInterval(() => {
    if (!renewLease(raw.db, lease, Date.now(), WORKER_LEASE_TTL_MS)) {
      lost = true;
      active?.abort.abort();
    } else
      store.putRecord("health", "worker", {
        at: Date.now(),
        owner: lease.owner,
      });
  }, WORKER_HEARTBEAT_INTERVAL_MS);
  const stop = () => active?.abort.abort();
  signal.addEventListener("abort", stop);
  // Unknown runtimes survive process death. An explicit reconciliation is required before reuse.
  for (const task of store.listTasks().filter((t) => t.status === "running"))
    store.atomic(() => {
      const ownership = store.getRecord("ownership", task.id) as {
        bootId: string | null;
      } | null;
      store.putRecord("exclusion", task.id, {
        taskId: task.id,
        reason: "runtime_state_unknown",
        bootId: ownership?.bootId ?? null,
      });
      store.updateTask(
        task.id,
        task.revision,
        { status: "interrupted", reason: "runtime_state_unknown" },
        event("recovery.required"),
      );
    });
  for (const record of store.listRecords("exclusion") as {
    taskId: string;
    bootId: string | null;
  }[]) {
    if (bootId && record.bootId && bootId !== record.bootId)
      store.atomic(() => {
        const task = store.getTask(record.taskId);
        store.deleteRecord("exclusion", task.id);
        if (!["completed", "cancelled"].includes(task.status))
          store.updateTask(
            task.id,
            task.revision,
            { status: "paused", reason: "host_restart_confirmed" },
            event("recovery.stopped"),
          );
      });
  }
  for (const command of store.runningCommands())
    store.finishCommand(command.id, {
      error: "interrupted_command_check_state",
    });
  function command(c: ControlCommand) {
    try {
      const task = store.getTask(c.taskId);
      if (task.revision !== c.expectedRevision)
        throw new Error("revision_conflict");
      if (["completed", "cancelled"].includes(task.status))
        throw new Error("terminal_task");
      if (c.kind === "pause" || c.kind === "cancel") {
        for (const run of storyService.listStoryRuns(task.id).filter(
          (r) => r.childTaskId && r.state !== "completed",
        )) {
          const child = store.getTask(run.childTaskId!);
          if (!["completed", "cancelled"].includes(child.status))
            store.enqueue({
              id: `${c.id}:child:${child.id}`,
              taskId: child.id,
              kind: c.kind,
              expectedRevision: child.revision,
              payload: {},
            });
        }
        if (active?.taskId === task.id) {
          active.stop = c.kind === "pause" ? "paused" : "cancelled";
          active.abort.abort();
        } else
          store.updateTask(
            task.id,
            task.revision,
            {
              status: c.kind === "pause" ? "paused" : "cancelled",
              resumeStage: task.stage,
              reason: null,
            },
            event(`task.${c.kind}`),
          );
        if (!active || active.taskId !== task.id) {
          const run = storyService.listStoryRuns(task.featureId ?? task.id).find((r) =>
            task.featureId
              ? r.childTaskId === task.id
              : r.storyId === storyService.getExecution(task.id)?.activeStoryId,
          );
          if (run && run.state !== "completed" && run.state !== "pending")
            store.putRecord("story-run", storyKey(run), {
              ...run,
              state: "interrupted",
              updatedAt: Date.now(),
            });
        }
      } else if (c.kind === "approve") {
        const plan = PlanSchema.parse(
            store.getRecord("plan", `${task.id}:${task.planVersion}`),
          ),
          version = (c.payload as { version: number })?.version;
        if (
          planService.planComments(task.id).some((c) => c.version === plan.version)
        )
          throw new Error("plan_feedback_requires_revision");
        const approved = approvePlan(task, plan, version);
        store.atomic(() => {
          if (task.splitIntoStories)
            storyService.approveStorySelection(task,
              (c.payload as { selection: StorySelection }).selection,
            );
          store.updateTask(
            task.id,
            task.revision,
            {
              approvedPlanVersion: approved.approvedPlanVersion,
              stage: "prepare",
              status: "queued",
              reason: null,
            },
            event("plan.approved", {
              version,
              selection: (c.payload as { selection?: unknown }).selection,
            }),
          );
        });
      } else if (c.kind === "comment") {
        planService.addPlanComment(task.id, c.payload);
      } else if (c.kind === "revise") {
        planService.requestPlanRevision(task.id, c.payload);
      } else if (c.kind === "answer") {
        if (task.status !== "waiting_input") throw new Error("invalid_status");
        const answer = (c.payload as { answer: string })?.answer;
        if (typeof answer !== "string" || !answer.trim())
          throw new Error("answer_required");
        store.atomic(() => {
          store.putRecord("answer", `${task.id}:${task.revision}`, {
            answer,
            at: Date.now(),
          });
          store.updateTask(
            task.id,
            task.revision,
            {
              requirement: task.requirement + `\nUser clarification: ${answer}`,
              approvedPlanVersion: null,
              stage: "analyze",
              status: "queued",
              reason: null,
            },
            event("requirement.answered"),
          );
        });
      } else if (c.kind === "grant") {
        const payload = c.payload as { id: string; decision: string };
        const approval = store.getRecord("approval", payload.id) as {
          taskId: string;
          decision: string | null;
        } | null;
        if (
          !approval ||
          approval.taskId !== task.id ||
          approval.decision ||
          !["accept", "decline"].includes(payload.decision)
        )
          throw new Error("approval_request_expired");
        store.putRecord("approval", payload.id, {
          ...approval,
          decision: payload.decision,
        });
      } else if (c.kind === "configure") {
        if (task.status === "running")
          throw new Error("stage_boundary_required");
        const p = c.payload as {
          models?: unknown;
          deliveryMode?: unknown;
          executionMode?: unknown;
        };
        const patch: Partial<Task> = {};
        if (p.executionMode !== undefined)
          patch.executionMode = ExecutionModeSchema.parse(p.executionMode);
        if (p.models)
          patch.models = applyEffortPolicy(ModelMapSchema.parse(p.models));
        if (p.deliveryMode === "local" || p.deliveryMode === "github")
          patch.deliveryMode = p.deliveryMode;
        store.updateTask(
          task.id,
          task.revision,
          patch,
          event("task.configured"),
        );
      } else if (c.kind === "resume" || c.kind === "start") {
        if (
          !["paused", "interrupted", "blocked", "queued"].includes(task.status)
        )
          throw new Error("invalid_status");
        if (task.reason === "runtime_state_unknown")
          throw new Error("runtime_reconciliation_required");
        const e = storyService.getExecution(task.id);
        const pending =
          e?.selection.mode === "separate_pr"
            ? storyService.listStoryRuns(task.id).find(
                (r) => r.childTaskId && r.state !== "completed",
              )
            : undefined;
        if (pending) {
          const child = store.getTask(pending.childTaskId!);
          if (["paused", "interrupted", "blocked"].includes(child.status))
            store.enqueue({
              id: `${c.id}:child:${child.id}`,
              taskId: child.id,
              kind: "resume",
              expectedRevision: child.revision,
              payload: {},
            });
          store.updateTask(
            task.id,
            task.revision,
            { status: "blocked", reason: "story_running" },
            event("task.resumed"),
          );
        } else
          store.updateTask(
            task.id,
            task.revision,
            { status: "queued", reason: null },
            event("task.resumed"),
          );
      } else throw new Error("approval_request_expired");
      store.finishCommand(c.id, { ok: true });
    } catch (error) {
      store.finishCommand(c.id, { error: String(error) });
      store.addEvent(c.taskId, "command.rejected", {
        commandId: c.id,
        error: String(error),
      });
    }
  }
  try {
    while (!signal.aborted && !lost) {
      let c;
      while ((c = store.nextCommand())) command(c);
      if (signal.aborted) break;
      for (const feature of store
        .listTasks()
        .filter(
          (t) =>
            t.splitIntoStories &&
            t.status === "blocked" &&
            t.reason === "story_running",
        ))
        await storyService.reconcileFeatureStories(feature.id, signal);
      if (!active && !store.listRecords("exclusion").length) {
        const next = store
          .listTasks()
          .reverse()
          .find((t) => t.status === "queued");
        if (next) {
          if (next.stage === "repair" && next.repairCount >= MAX_REPAIR_ROUNDS) {
            store.updateTask(
              next.id,
              next.revision,
              { status: "blocked", reason: "repair_limit" },
              event("repair.limit"),
            );
            continue;
          }
          const abort = new AbortController();
          let task: Task;
          const attempt: Attempt = {
            id: randomUUID(),
            taskId: next.id,
            storyId:
              storyService.getExecution(next.id)?.activeStoryId ??
              next.storyId ??
              null,
            planVersion: next.planVersion,
            baselineCommit:
              storyService.getExecution(next.id)?.baselineCommit ?? next.sourceCommit,
            stage: next.stage,
            leaseEpoch: lease.epoch,
            status: "running",
            output: null,
            model:
              applyEffortPolicy(next.models)[
                next.stage as keyof Task["models"]
              ] ?? null,
            bundleHash: null,
            threadId: null,
            turnId: null,
            fingerprint: null,
          };
          store.atomic(() => {
            task = store.updateTask(
              next.id,
              next.revision,
              {
                status: "running",
                repairCount:
                  next.repairCount + (next.stage === "repair" ? 1 : 0),
              },
              event("stage.started", {
                attemptId: attempt.id,
                stage: next.stage,
                model: attempt.model,
              }),
            );
            store.putRecord("attempt", attempt.id, attempt);
            const run = storyService.listStoryRuns(next.featureId ?? next.id).find(
              (r) => r.storyId === attempt.storyId,
            );
            if (
              run &&
              !run.childTaskId &&
              ["implement", "repair", "verify", "review"].includes(next.stage)
            )
              store.putRecord("story-run", storyKey(run), {
                ...run,
                state: "running",
                baselineCommit: attempt.baselineCommit,
                updatedAt: Date.now(),
              });
            store.putRecord("ownership", next.id, {
              bootId,
              workerPid: process.pid,
            });
          });
          const entry = {
            taskId: next.id,
            abort,
            stop: null as "paused" | "cancelled" | null,
            promise: Promise.resolve(),
          };
          active = entry;
          entry.promise = (async () => {
            try {
              const result = await handlers[next.stage](
                task!,
                AbortSignal.any([
                  abort.signal,
                  AbortSignal.timeout(STAGE_TIMEOUT_MS),
                ]),
              );
              if (lost) return;
              const current = store.getTask(next.id);
              store.atomic(() => {
                const run = storyService.listStoryRuns(next.featureId ?? next.id).find(
                  (r) => r.storyId === attempt.storyId,
                );
                if (
                  run &&
                  run.state !== "completed" &&
                  (entry.stop ||
                    ["blocked", "interrupted", "paused"].includes(
                      result.status,
                    ))
                )
                  store.putRecord("story-run", storyKey(run), {
                    ...run,
                    state:
                      entry.stop ||
                      ["paused", "interrupted"].includes(result.status)
                        ? "interrupted"
                        : "blocked",
                    updatedAt: Date.now(),
                  });
                store.putRecord("attempt", attempt.id, {
                  ...attempt,
                  ...(store.getRecord("attempt", attempt.id) as object),
                  status: "completed",
                  output: result.output,
                  nextStage: result.stage,
                  nextStatus: entry.stop ?? result.status,
                });
                // Some handlers save a versioned plan and perform their own atomic transition.
                if (current.status === "running")
                  store.updateTask(
                    current.id,
                    current.revision,
                    {
                      stage: result.stage,
                      status: entry.stop ?? result.status,
                      reason: result.reason,
                    },
                    event("stage.completed", {
                      stage: next.stage,
                      output: result.output,
                    }),
                  );
              });
            } catch (error) {
              if (lost) return;
              const current = store.getTask(next.id),
                message =
                  error instanceof Error ? error.message : String(error);
              const unknown = message.includes("runtime_state_unknown");
              store.atomic(() => {
                if (unknown)
                  store.putRecord("exclusion", current.id, {
                    taskId: current.id,
                    reason: "runtime_state_unknown",
                    bootId,
                  });
                const run = storyService.listStoryRuns(next.featureId ?? next.id).find(
                  (r) => r.storyId === attempt.storyId,
                );
                if (run && run.state !== "completed")
                  store.putRecord("story-run", storyKey(run), {
                    ...run,
                    state: abort.signal.aborted ? "interrupted" : "blocked",
                    updatedAt: Date.now(),
                  });
                store.putRecord("attempt", attempt.id, {
                  ...attempt,
                  ...(store.getRecord("attempt", attempt.id) as object),
                  status: abort.signal.aborted ? "interrupted" : "failed",
                  output: { error: message },
                });
                store.updateTask(
                  current.id,
                  current.revision,
                  {
                    status: unknown
                      ? "interrupted"
                      : (entry.stop ?? (signal.aborted ? "paused" : "blocked")),
                    reason: unknown ? "runtime_state_unknown" : message,
                  },
                  event("stage.stopped", { error: message }),
                );
              });
            } finally {
              if (active === entry) active = null;
            }
          })();
        }
      }
      await new Promise((r) => setTimeout(r, WORKER_POLL_INTERVAL_MS));
    }
    const pending = active;
    if (pending) {
      pending.abort.abort();
      await pending.promise;
    }
  } finally {
    clearInterval(heartbeat);
    signal.removeEventListener("abort", stop);
    if (!lost)
      store.putRecord("health", "worker", { at: 0, owner: lease.owner });
    releaseLease(raw.db, lease);
  }
}
