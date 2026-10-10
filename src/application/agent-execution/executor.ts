import type { Task, AiStage, Stage } from "../../domain/contracts";
import {
  parentAgentModel as parentModel,
  applyEffortPolicy,
} from "../../domain/model-policy";
import type {
  AgentExecutionPort,
  DelegatedStageInput,
  OutputCodec,
} from "../execution-contracts";
import type { ModelService } from "../models";
import type { RuntimePort } from "../runtime";
import type { RuntimeRecord } from "../ports";
import {
  ContextPreparation,
  type AgentContext,
  type ContextPort,
  type PacketPort,
} from "./preparation";
import { RuntimeRecording } from "./recording";
import { ApprovalBroker } from "./approval";
import { composeInstructions, stageEnvelope } from "./packet";
export class StageAgentExecutor {
  private readonly preparation: ContextPreparation;
  constructor(
    private readonly context: AgentContext,
    private readonly client: Pick<
      AgentExecutionPort,
      "runDelegatedStage" | "respondToApproval"
    >,
    private readonly models: ModelService,
    io: ContextPort,
    private readonly packets: PacketPort,
    private readonly runtime: RuntimePort,
    private readonly supportsApproval: (method: string) => boolean,
  ) {
    this.preparation = new ContextPreparation(context, io);
  }
  freezeTaskBundles(task: Task) {
    return this.preparation.freeze(task);
  }
  async executeAgentStage<T>(
    task: Task,
    stage: AiStage,
    schema: OutputCodec<T>,
    context: unknown,
    signal: AbortSignal,
    options: { runtimeStage?: Stage; instructions?: string } = {},
  ): Promise<T> {
    const { store, artifacts } = this.context;
    const client = this.client;

    await this.freezeTaskBundles(task);
    if (!task.worktree)
      return this.preparation.sourceSnapshot(task, (cwd) =>
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
    const model = await this.models.resolveAttempt(
      stage,
      task.models,
      parentModel,
    );
    const runtimeStage = options.runtimeStage ?? stage;
    const bundle = await this.preparation.bundle(
      task,
      stage,
      runtimeStage,
      options.instructions,
    );
    const attempt = store.attempts
      .list()
      .find(
        (a) =>
          a.taskId === task.id &&
          a.stage === runtimeStage &&
          a.status === "running",
      ) as { id: string } | undefined;
    const attemptId = attempt?.id ?? this.runtime.id();
    const parent = store.parents.get(task.id);
    const input: DelegatedStageInput = {
      cwd: task.worktree!,
      model,
      instructions: composeInstructions(bundle),
      prompt: typeof context === "string" ? context : JSON.stringify(context),
      outputSchema: schema.jsonSchema(),
      executionMode: task.executionMode,
      write: stage === "implement" || stage === "repair",
      threadId: parent?.threadId,
      delegation: {
        stage: runtimeStage,
        attemptId,
        packetPath: this.packets.path(artifacts(task), attemptId),
      },
    };
    await this.packets.write(input.delegation.packetPath, {
      instructions: input.instructions,
      input: context,
      outputSchema: stageEnvelope(input),
    });
    store.artifacts.put(attemptId, {
      id: attemptId,
      taskId: task.id,
      path: input.delegation!.packetPath,
      type: "context",
    });
    const recorder = new RuntimeRecording(
      store,
      task.id,
      attemptId,
      bundle.hash,
      model,
      parentModel,
      !!attempt,
    );
    const runtime = (update: Partial<RuntimeRecord>) => recorder.update(update);
    store.runtimes.put(task.id, {
      stage: runtimeStage,
      model,
      bundleHash: bundle.hash,
      attemptId,
      state: "preparing",
      threadId: parent?.threadId ?? null,
    });
    const approvals = new ApprovalBroker(
      store,
      client,
      task,
      this.runtime,
      this.supportsApproval,
    );
    try {
      approvals.start();
      const run = await client.runDelegatedStage(
        input,
        (event) => {
          if (event.type === "approval") {
            approvals.handleRequest(event.data);
          } else if (event.type === "parent") {
            store.parents.put(task.id, {
              threadId: event.data.threadId,
              model: parentModel,
            });
            runtime({ threadId: event.data.threadId, parentModel });
          } else if (event.type === "child") {
            runtime({ child: event.data });
            store.events.add(task.id, "subagent.started", {
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
            store.events.add(task.id, "agent.started", {
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
