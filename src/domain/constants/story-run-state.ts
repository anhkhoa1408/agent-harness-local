export class StoryRunState {
  private constructor() {}
  static readonly PENDING = "pending" as const;
  static readonly RUNNING = "running" as const;
  static readonly COMPLETED = "completed" as const;
  static readonly INTERRUPTED = "interrupted" as const;
  static readonly BLOCKED = "blocked" as const;
}
