import {
  aiStages,
  type Task,
  type AiStage,
  type Stage,
  type Repository,
} from "../../domain/contracts";
import type { ApplicationStore } from "../ports";
import type { Bundle, ContextFile } from "../execution-contracts";
export interface ContextPort {
  sourceSnapshot<T>(
    repo: Repository,
    work: (root: string) => Promise<T>,
  ): Promise<T>;
  resolve(stage: AiStage, root: string, liquid: boolean): Promise<Bundle>;
  save(bundle: Bundle, artifacts: string): Promise<string>;
  hash(value: string): string;
  rules(root: string, paths: string[], liquid: boolean): Promise<ContextFile[]>;
}
export interface PacketPort {
  path(artifacts: string, attemptId: string): string;
  write(path: string, value: unknown): Promise<void>;
}
export type AgentContext = {
  store: ApplicationStore;
  artifacts(task: Task): string;
  repository(task: Task): Repository;
};
export class ContextPreparation {
  constructor(
    private readonly context: AgentContext,
    private readonly io: ContextPort,
  ) {}
  async freeze(task: Task) {
    const { store, artifacts, repository } = this.context;
    if (aiStages.every((stage) => store.bundles.get(`${task.id}:${stage}`)))
      return;
    await this.io.sourceSnapshot(repository(task), async (root) => {
      for (const stage of aiStages) {
        const key = `${task.id}:${stage}`;
        if (store.bundles.get(key)) continue;
        const bundle = await this.io.resolve(
          stage,
          root,
          /\b(liquid|shopify)\b/i.test(task.requirement),
        );
        const path = await this.io.save(bundle, artifacts(task));
        store.bundles.put(key, bundle);
        store.artifacts.put(bundle.hash, {
          id: bundle.hash,
          taskId: task.id,
          path,
          type: "context",
        });
      }
    });
  }
  sourceSnapshot<T>(task: Task, work: (root: string) => Promise<T>) {
    return this.io.sourceSnapshot(this.context.repository(task), work);
  }
  async bundle(
    task: Task,
    stage: AiStage,
    runtimeStage: Stage,
    instructions?: string,
  ) {
    const { store, artifacts } = this.context;
    const original = store.bundles.get(`${task.id}:${stage}`)!;
    if (!instructions) return original;
    const bundle = {
      ...original,
      stage: runtimeStage,
      files: [],
      adaptations: instructions,
      hash: this.io.hash(instructions),
    };
    const path = await this.io.save(bundle, artifacts(task));
    const id = `${task.id}-${bundle.hash}`;
    store.artifacts.put(id, { id, taskId: task.id, path, type: "context" });
    return bundle;
  }
}
