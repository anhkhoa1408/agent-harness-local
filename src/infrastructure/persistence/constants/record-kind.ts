export class RecordKind {
  private constructor() {}
  static readonly PLAN = "plan" as const;
  static readonly REPOSITORY = "repository" as const;
  static readonly SETTINGS = "settings" as const;
  static readonly PROFILE = "profile" as const;
  static readonly PLAN_COMMENT = "plan-comment" as const;
  static readonly STORY_RUN = "story-run" as const;
  static readonly STORY_EXECUTION = "story-execution" as const;
  static readonly STORY_EVIDENCE = "story-evidence" as const;
  static readonly CHECKS = "checks" as const;
  static readonly REVIEW = "review" as const;
  static readonly ACCEPTANCE = "acceptance" as const;
  static readonly DELIVERY = "delivery" as const;
  static readonly EFFECT = "effect" as const;
  static readonly ARTIFACT = "artifact" as const;
  static readonly ANALYSIS = "analysis" as const;
  static readonly BUNDLE = "bundle" as const;
  static readonly ATTEMPT = "attempt" as const;
  static readonly RUNTIME = "runtime" as const;
  static readonly PARENT = "parent" as const;
  static readonly APPROVAL = "approval" as const;
  static readonly HEALTH = "health" as const;
  static readonly OWNERSHIP = "ownership" as const;
  static readonly EXCLUSION = "exclusion" as const;
  static readonly PREPARATION = "preparation" as const;
  static readonly ANSWER = "answer" as const;
  static readonly SESSION = "session" as const;
}
