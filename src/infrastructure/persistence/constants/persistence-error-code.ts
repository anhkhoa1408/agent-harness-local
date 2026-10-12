export class PersistenceErrorCode {
  private constructor() {}
  static readonly COMMAND_CONFLICT = "command_conflict" as const;
  static readonly LEASE_LOST = "lease_lost" as const;
  static readonly TASK_NOT_FOUND = "task_not_found" as const;
}
