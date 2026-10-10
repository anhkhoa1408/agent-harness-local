import type { ApplicationStore, RuntimeRecord } from "../ports";
import type { ModelChoice } from "../../domain/contracts";
export class RuntimeRecording {
  constructor(
    private readonly store: Pick<ApplicationStore, "runtimes" | "attempts">,
    private readonly taskId: string,
    private readonly attemptId: string,
    private readonly bundleHash: string,
    private readonly model: ModelChoice,
    private readonly parentModel: ModelChoice,
    private readonly recordAttempt: boolean,
  ) {}
  update(update: Partial<RuntimeRecord>) {
    const value = { ...this.store.runtimes.get(this.taskId)!, ...update };
    this.store.runtimes.put(this.taskId, value);
    if (this.recordAttempt)
      this.store.attempts.put(this.attemptId, {
        ...this.store.attempts.get(this.attemptId)!,
        threadId: value.threadId,
        turnId: value.turnId ?? null,
        child: value.child,
        bundleHash: this.bundleHash,
        model: this.model,
        parentModel: this.parentModel,
        usage: value.usage,
      });
  }
}
