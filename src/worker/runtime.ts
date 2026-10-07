import { gitText } from "../repositories/inspect";
import { fingerprintWorktree } from "../repositories/fingerprint";
import { PlanService } from "../application/plan-service";
import { StoryService, storyKey } from "../application/story-service";
import { WORKER_POLL_INTERVAL_MS } from "./limits";
import { MAX_REPAIR_ROUNDS, WORKER_LEASE_TTL_MS, WORKER_HEARTBEAT_INTERVAL_MS } from "../core/limits";
import { applyEffortPolicy } from "../core/model-policy";
import { randomUUID } from "node:crypto";
import type { Store } from "../storage/store";
import { claimLease, renewLease, releaseLease, fencedStore, type Lease } from "../storage/lease";
import { type Task } from "../core/contracts";

import { bootIdentity } from "./recovery";
import type { Attempt, Handlers, ActiveStageAttempt } from "./types";
import { workerEvent as event } from "./events";
import { restoreInterruptedTasks } from "./recover-state";
import { processControlCommand } from "./control-commands";
import { executeStageAttempt } from "./attempt-execution";
export class WorkerRuntime {
  private active: ActiveStageAttempt | null = null;
  private lost = false;
  constructor(
    private readonly raw: Store,
    private readonly source:
      Handlers | ((store: Store, lease: Lease) => Handlers),
    private readonly signal: AbortSignal,
  ) {}
  async run() {
    const { raw, source, signal } = this;

    const lease = claimLease(
      raw.db,
      randomUUID(),
      Date.now(),
      WORKER_LEASE_TTL_MS,
    );
    if (!lease) throw new Error("worker_already_running");
    const store = fencedStore(raw, lease),
      handlers = typeof source === "function" ? source(store, lease) : source,
      bootId = bootIdentity();
    const storyService = new StoryService(store, {
      readGit: gitText,
      fingerprintWorktree,
    });
    const planService = new PlanService(store, storyService);
    store.putRecord("health", "worker", { at: Date.now(), owner: lease.owner });
    const heartbeat = setInterval(() => {
      if (!renewLease(raw.db, lease, Date.now(), WORKER_LEASE_TTL_MS)) {
        this.lost = true;
        this.active?.abort.abort();
      } else
        store.putRecord("health", "worker", {
          at: Date.now(),
          owner: lease.owner,
        });
    }, WORKER_HEARTBEAT_INTERVAL_MS);
    const stop = () => this.active?.abort.abort();
    signal.addEventListener("abort", stop);
    restoreInterruptedTasks(store, bootId);
    try {
      while (!signal.aborted && !this.lost) {
        let c;
        while ((c = store.nextCommand()))
          processControlCommand(
            store,
            storyService,
            planService,
            this.active,
            c,
          );
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
        if (!this.active && !store.listRecords("exclusion").length) {
          const next = store
            .listTasks()
            .reverse()
            .find((t) => t.status === "queued");
          if (next) {
            if (
              next.stage === "repair" &&
              next.repairCount >= MAX_REPAIR_ROUNDS
            ) {
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
                storyService.getExecution(next.id)?.baselineCommit ??
                next.sourceCommit,
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
              const run = storyService
                .listStoryRuns(next.featureId ?? next.id)
                .find((r) => r.storyId === attempt.storyId);
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
            this.active = entry;
            entry.promise = this.executeAttempt(
              store,
              handlers,
              bootId,
              next,
              attempt,
              task!,
              entry,
            );
          }
        }
        await new Promise((r) => setTimeout(r, WORKER_POLL_INTERVAL_MS));
      }
      const pending = this.active;
      if (pending) {
        pending.abort.abort();
        await pending.promise;
      }
    } finally {
      clearInterval(heartbeat);
      signal.removeEventListener("abort", stop);
      if (!this.lost)
        store.putRecord("health", "worker", { at: 0, owner: lease.owner });
      releaseLease(raw.db, lease);
    }
  }
  private async executeAttempt(
    store: Store,
    handlers: Handlers,
    bootId: string | null,
    next: Task,
    attempt: Attempt,
    task: Task,
    entry: ActiveStageAttempt,
  ) {
    const storyService = new StoryService(store, {
      readGit: gitText,
      fingerprintWorktree,
    });
    try {
      await executeStageAttempt(
        store,
        handlers,
        storyService,
        bootId,
        next,
        attempt,
        task,
        entry,
        this.signal,
        () => this.lost,
      );
    } finally {
      if (this.active === entry) this.active = null;
    }
  }
}
