export class AttemptStatus {
  private constructor() {}
  static readonly RUNNING = "running" as const;
  static readonly COMPLETED = "completed" as const;
  static readonly INTERRUPTED = "interrupted" as const;
  static readonly FAILED = "failed" as const;
}
