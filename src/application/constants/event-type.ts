export class EventType {
  private constructor() {}
  static readonly AGENT_STARTED = "agent.started" as const;
  static readonly APPROVAL_AUTO_DECLINED = "approval.auto_declined" as const;
  static readonly APPROVAL_REQUESTED = "approval.requested" as const;
  static readonly APPROVAL_UNSUPPORTED = "approval.unsupported" as const;
  static readonly BASE_SYNCHRONIZED = "base.synchronized" as const;
  static readonly COMMAND_REJECTED = "command.rejected" as const;
  static readonly FEATURE_COMPLETED = "feature.completed" as const;
  static readonly FEATURE_PROGRESS = "feature.progress" as const;
  static readonly PLAN_APPROVED = "plan.approved" as const;
  static readonly PLAN_COMMENTED = "plan.commented" as const;
  static readonly PLAN_CREATED = "plan.created" as const;
  static readonly PLAN_INVALIDATED = "plan.invalidated" as const;
  static readonly PLAN_REVISION_REQUESTED = "plan.revision_requested" as const;
  static readonly RECOVERY_REQUIRED = "recovery.required" as const;
  static readonly RECOVERY_STOPPED = "recovery.stopped" as const;
  static readonly STAGE_COMPLETED = "stage.completed" as const;
  static readonly STAGE_STARTED = "stage.started" as const;
  static readonly STAGE_STOPPED = "stage.stopped" as const;
  static readonly STORY_ADVANCED = "story.advanced" as const;
  static readonly STORY_ATTENTION = "story.attention" as const;
  static readonly STORY_CHECKPOINT = "story.checkpoint" as const;
  static readonly STORY_CHILD_CREATED = "story.child_created" as const;
  static readonly STORY_COMPLETED = "story.completed" as const;
  static readonly STORY_PLAN_INHERITED = "story.plan_inherited" as const;
  static readonly SUBAGENT_STARTED = "subagent.started" as const;
  static readonly TASK_CONFIGURED = "task.configured" as const;
  static readonly TASK_CREATED = "task.created" as const;
  static readonly TASK_RESUMED = "task.resumed" as const;
  static readonly WORKTREE_PREPARED = "worktree.prepared" as const;
}
