import { z } from "zod";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { aiStages, type Task, type AiStage, type Stage } from "../core/contracts";

import type { AgentClient, DelegatedStageInput } from "../codex/types";
import { PARENT_AGENT_MODEL as parentModel } from "../codex/limits";
import { resolveModel, applyEffortPolicy } from "../core/model-policy";
import { resolveBundle, snapshotBundle, type Bundle } from "../context/skills";
import { composeInstructions, stageEnvelope } from "../context/prompts";

import { withSourceSnapshot } from "../repositories/inspect";
import { contentHash } from "../context/rules";

import type { StageContext } from "./stage-context";
import { ApprovalBroker } from "./approval-broker";
export class StageAgentExecutor {
  constructor(
    private readonly context: StageContext,
    private readonly client: Pick<
      AgentClient,
      "listModels" | "runDelegatedStage" | "respondToApproval"
    >,
  ) {}
  async freezeTaskBundles(task: Task) {
    const { store, artifacts, repository } = this.context;

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
  async executeAgentStage<T>(
    task: Task,
    stage: AiStage,
    schema: z.ZodType<T>,
    context: unknown,
    signal: AbortSignal,
    options: { runtimeStage?: Stage; instructions?: string } = {},
  ): Promise<T> {
    const { store, artifacts, repository } = this.context;
    const client = this.client;

    await this.freezeTaskBundles(task);
    if (!task.worktree)
      return withSourceSnapshot(repository(task), (cwd) =>
        this.executeAgentStage(
          { ...task, worktree: cwd },
          stage,
          schema,
          context,
          signal,
          options,
        ),
      );
    task = { ...task, models: applyEffortPolicy(task.models) };
    const catalog = await client.listModels();
    if (
      !catalog.some(
        (m) =>
          m.id === parentModel.model && m.efforts.includes(parentModel.effort),
      )
    )
      throw new Error("parent_model_unavailable");
    const runtimeStage = options.runtimeStage ?? stage;
    const original = store.getRecord("bundle", `${task.id}:${stage}`) as Bundle;
    const bundle = options.instructions
      ? {
          ...original,
          stage: runtimeStage,
          files: [],
          adaptations: options.instructions,
          hash: contentHash(options.instructions),
        }
      : original;
    if (options.instructions) {
      const path = await snapshotBundle(bundle, artifacts(task));
      store.putRecord("artifact", `${task.id}-${bundle.hash}`, {
        id: `${task.id}-${bundle.hash}`,
        taskId: task.id,
        path,
        type: "context",
      });
    }
    const model = resolveModel(stage, task.models, {}, catalog);
    const attempt = store
      .listRecords("attempt")
      .find(
        (a: any) =>
          a.taskId === task.id &&
          a.stage === runtimeStage &&
          a.status === "running",
      ) as { id: string } | undefined;
    const attemptId = attempt?.id ?? randomUUID(),
      packetDir = join(artifacts(task), "delegations");
    await mkdir(packetDir, { recursive: true });
    const parent = store.getRecord("parent", task.id) as
      { threadId: string } | undefined;
    const input: DelegatedStageInput = {
      cwd: task.worktree!,
      model,
      instructions: composeInstructions(bundle),
      prompt: typeof context === "string" ? context : JSON.stringify(context),
      outputSchema: z.toJSONSchema(schema),
      executionMode: task.executionMode,
      write: stage === "implement" || stage === "repair",
      threadId: parent?.threadId,
      delegation: {
        stage: runtimeStage,
        attemptId,
        packetPath: join(packetDir, `${attemptId}.json`),
      },
    };
    await writeFile(
      input.delegation!.packetPath,
      JSON.stringify({
        instructions: input.instructions,
        input: context,
        outputSchema: stageEnvelope(input),
      }),
      { flag: "wx", mode: 0o600 },
    );
    store.putRecord("artifact", attemptId, {
      id: attemptId,
      taskId: task.id,
      path: input.delegation!.packetPath,
      type: "context",
    });
    const runtime = (update: Record<string, unknown>) => {
      const current = store.getRecord("runtime", task.id) as Record<
        string,
        unknown
      >;
      const value = { ...current, ...update };
      store.putRecord("runtime", task.id, value);
      if (attempt)
        store.putRecord("attempt", attemptId, {
          ...(store.getRecord("attempt", attemptId) as object),
          threadId: value.threadId,
          turnId: value.turnId,
          child: value.child,
          bundleHash: bundle.hash,
          model,
          parentModel,
          usage: value.usage,
        });
    };
    store.putRecord("runtime", task.id, {
      stage: runtimeStage,
      model,
      bundleHash: bundle.hash,
      attemptId,
      state: "preparing",
      threadId: parent?.threadId ?? null,
    });
    const approvals = new ApprovalBroker(store, client, task);
    try {
      approvals.start();
      const run = await client.runDelegatedStage(
        input,
        (event) => {
          if (event.type === "approval") {
            approvals.handleRequest(event.data);
          } else if (event.type === "parent") {
            store.putRecord("parent", task.id, {
              threadId: event.data.threadId,
              model: parentModel,
            });
            runtime({ threadId: event.data.threadId, parentModel });
          } else if (event.type === "child") {
            runtime({ child: event.data });
            store.addEvent(task.id, "subagent.started", {
              stage: runtimeStage,
              attemptId,
              ...event.data,
            });
          } else if (event.type === "started") {
            runtime({
              threadId: event.data.threadId,
              turnId: event.data.turnId,
              parentModel,
              state: "running",
            });
            store.addEvent(task.id, "agent.started", {
              stage: runtimeStage,
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
        state:
          error instanceof Error &&
          error.message.includes("runtime_state_unknown")
            ? "unknown"
            : "stopped",
      });
      throw error;
    } finally {
      approvals.dispose();
    }
  }
}
