export class CheckStatus {
  private constructor() {}
  static readonly PASSED = "passed" as const;
  static readonly FAILED = "failed" as const;
  static readonly BLOCKED = "blocked" as const;
  static readonly SKIPPED = "skipped" as const;
  static readonly NOT_APPLICABLE = "not_applicable" as const;
}
