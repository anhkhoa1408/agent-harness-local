export class TaskStatus {
  private constructor() {}
  static readonly QUEUED = "queued" as const;
  static readonly RUNNING = "running" as const;
  static readonly WAITING_INPUT = "waiting_input" as const;
  static readonly WAITING_APPROVAL = "waiting_approval" as const;
  static readonly BLOCKED = "blocked" as const;
  static readonly PAUSED = "paused" as const;
  static readonly INTERRUPTED = "interrupted" as const;
  static readonly COMPLETED = "completed" as const;
  static readonly CANCELLED = "cancelled" as const;
  static readonly FAILED = "failed" as const;
  static readonly ALL = [
    TaskStatus.QUEUED,
    TaskStatus.RUNNING,
    TaskStatus.WAITING_INPUT,
    TaskStatus.WAITING_APPROVAL,
    TaskStatus.BLOCKED,
    TaskStatus.PAUSED,
    TaskStatus.INTERRUPTED,
    TaskStatus.COMPLETED,
    TaskStatus.CANCELLED,
    TaskStatus.FAILED,
  ] as const;
}
