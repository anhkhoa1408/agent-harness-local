export class DomainErrorCode {
  private constructor() {}
  static readonly STALE_PLAN = "stale_plan" as const;
  static readonly INVALID_STORY_SELECTION = "invalid_story_selection" as const;
  static readonly STORY_DEPENDENCY_REQUIRED =
    "story_dependency_required" as const;
  static readonly STORY_CYCLE = "story_cycle" as const;
  static readonly STORY_NOT_FOUND = "story_not_found" as const;
  static readonly COMPLETED_STORY_CHANGED = "completed_story_changed" as const;
  static readonly IMMUTABLE_FIELD = "immutable_field" as const;
  static readonly INVALID_STATUS = "invalid_status" as const;
  static readonly PLAN_NOT_APPROVED = "plan_not_approved" as const;
  static readonly STALE_REVIEW = "stale_review" as const;
}
