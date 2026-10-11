import { WorkerLease } from "../../domain/constants/worker-lease";
import {
  ApplicationErrorCode,
  EventType,
  WorkerTiming,
} from "../constants/index";
import { TaskStatus } from "../../domain/constants/task-status";
import { PipelineStage } from "../../domain/constants/pipeline-stage";
import type { ApplicationStore } from "../ports";
import type { RuntimePort, Lease } from "../runtime";
import type { ValidationPort } from "../validation";
import type { PlanService } from "../planning";
import { StoryService, storyKey } from "../stories";

import { applyEffortPolicy } from "../../domain/model-policy";
import type { Task } from "../../domain/contracts";
import type {
  Attempt,
  Handlers,
  ActiveStageAttempt,
} from "../pipeline-contracts";
import { workerEvent as event } from "./events";
import { restoreInterruptedTasks } from "./recover-state";
import { processControlCommand } from "./control-commands";
import { executeStageAttempt } from "./attempt-execution";
export interface WorkerLeasePort {
  claim(owner: string, now: number, ttl: number): Lease | null;
  renew(lease: Lease, now: number, ttl: number): boolean;
  release(lease: Lease): void;
  scope(lease: Lease): {
    store: ApplicationStore;
    handlers: Handlers;
    storyService: StoryService;
    planService: PlanService;
  };
}
export class WorkerRuntime {
  private active: ActiveStageAttempt | null = null;
  private lost = false;
  constructor(
    private readonly leases: WorkerLeasePort,
    private readonly runtime: RuntimePort,
    private readonly validation: ValidationPort,
    private readonly signal: AbortSignal,
  ) {}
  async run() {
    const { runtime, signal } = this;
    const lease = this.leases.claim(
      runtime.id(),
      runtime.now(),
      WorkerLease.WORKER_LEASE_TTL_MS,
    );
    if (!lease) throw new Error(ApplicationErrorCode.WORKER_ALREADY_RUNNING);
    const { store, handlers, storyService, planService } =
      this.leases.scope(lease);
    const bootId = runtime.bootIdentity();
    store.health.put("worker", { at: runtime.now(), owner: lease.owner });
    const heartbeat = runtime.every(
      WorkerLease.WORKER_HEARTBEAT_INTERVAL_MS,
      () => {
        if (
          !this.leases.renew(
            lease,
            runtime.now(),
            WorkerLease.WORKER_LEASE_TTL_MS,
          )
        ) {
          this.lost = true;
          this.active?.abort.abort();
        } else
          store.health.put("worker", {
            at: runtime.now(),
            owner: lease.owner,
          });
      },
    );
    const stop = () => this.active?.abort.abort();
    signal.addEventListener("abort", stop);
    restoreInterruptedTasks(store, bootId);
    try {
      while (!signal.aborted && !this.lost) {
        let c;
        while ((c = store.commands.next()))
          processControlCommand(
            store,
            storyService,
            planService,
            this.active,
            c,
            this.validation,
            runtime,
          );
        if (signal.aborted) break;
        for (const feature of store.tasks
          .list()
          .filter(
            (t) =>
              t.splitIntoStories &&
              t.status === TaskStatus.BLOCKED &&
              t.reason === "story_running",
          ))
          await storyService.reconcileFeatureStories(feature.id, signal);
        if (!this.active && !store.exclusions.list().length) {
          const claimed = store.atomic(() => {
            const next = store.tasks
              .list()
              .reverse()
              .find((t) => t.status === TaskStatus.QUEUED);
            if (!next) return null;
            const abort = new AbortController();
            const attempt: Attempt = {
              id: runtime.id(),
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
              status: TaskStatus.RUNNING,
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
            const task = store.tasks.update(
              next.id,
              next.revision,
              {
                status: TaskStatus.RUNNING,
                repairCount:
                  next.repairCount +
                  (next.stage === PipelineStage.REPAIR ? 1 : 0),
              },
              event(EventType.STAGE_STARTED, {
                attemptId: attempt.id,
                stage: next.stage,
                model: attempt.model,
              }),
            );
            store.attempts.put(attempt.id, attempt);
            const run = storyService
              .listStoryRuns(next.featureId ?? next.id)
              .find((r) => r.storyId === attempt.storyId);
            if (
              run &&
              !run.childTaskId &&
              [
                PipelineStage.IMPLEMENT,
                PipelineStage.REPAIR,
                PipelineStage.VERIFY,
                PipelineStage.REVIEW,
              ].some((value) => value === next.stage)
            )
              store.storyRuns.put(storyKey(run), {
                ...run,
                state: TaskStatus.RUNNING,
                baselineCommit: attempt.baselineCommit!,
                updatedAt: runtime.now(),
              });
            store.ownership.put(next.id, {
              bootId,
              workerPid: runtime.pid,
            });
            return { next, task, attempt, abort };
          });
          if (claimed) {
            const { next, task, attempt, abort } = claimed;
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
              storyService,
              bootId,
              next,
              attempt,
              task,
              entry,
            );
          }
        }
        await runtime.sleep(WorkerTiming.WORKER_POLL_INTERVAL_MS);
      }
      const pending = this.active;
      if (pending) {
        pending.abort.abort();
        await pending.promise;
      }
    } finally {
      heartbeat();
      signal.removeEventListener("abort", stop);
      if (!this.lost) store.health.put("worker", { at: 0, owner: lease.owner });
      this.leases.release(lease);
    }
  }
  private async executeAttempt(
    store: ApplicationStore,
    handlers: Handlers,
    storyService: StoryService,
    bootId: string | null,
    next: Task,
    attempt: Attempt,
    task: Task,
    entry: ActiveStageAttempt,
  ) {
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
        this.runtime,
      );
    } finally {
      if (this.active === entry) this.active = null;
    }
  }
}
