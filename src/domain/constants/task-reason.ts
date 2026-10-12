export class TaskReason {
  private constructor() {}
  static readonly BASE_UPDATED_REQUIRES_PLAN =
    "base_updated_requires_plan" as const;
  static readonly CAPABILITY_UNAVAILABLE = "capability_unavailable" as const;
  static readonly HOST_RESTART_CONFIRMED = "host_restart_confirmed" as const;
  static readonly REVIEW_DISPUTE = "review_dispute" as const;
  static readonly SOURCE_CHANGED_DURING_TESTS =
    "source_changed_during_tests" as const;
  static readonly STORY_RUNNING = "story_running" as const;
}
