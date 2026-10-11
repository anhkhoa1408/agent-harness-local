export class ApplicationErrorCode {
  private constructor() {}
  static readonly SUBAGENT_EVIDENCE_MISSING =
    "subagent_evidence_missing" as const;
  static readonly ARTIFACT_NOT_FOUND = "artifact_not_found" as const;
  static readonly STORY_HEAD_CHANGED = "story_head_changed" as const;
  static readonly WORKTREE_MISSING = "worktree_missing" as const;
  static readonly BRANCH_COLLISION = "branch_collision" as const;
  static readonly SCOPE_CHANGED_REQUIRES_PLAN =
    "scope_changed_requires_plan" as const;
  static readonly LOCAL_HEAD_CHANGED = "local_head_changed" as const;
  static readonly SOURCE_CHANGED_DURING_COMMIT =
    "source_changed_during_commit" as const;
  static readonly REMOTE_HEAD_CHANGED = "remote_head_changed" as const;
  static readonly PULL_REQUEST_HEAD_CHANGED =
    "pull_request_head_changed" as const;
  static readonly PULL_REQUEST_UNCONFIRMED =
    "pull_request_unconfirmed" as const;
  static readonly PARENT_MODEL_UNAVAILABLE =
    "parent_model_unavailable" as const;
  static readonly REVISION_CONFLICT = "revision_conflict" as const;
  static readonly TERMINAL_TASK = "terminal_task" as const;
  static readonly PLAN_FEEDBACK_REQUIRES_REVISION =
    "plan_feedback_requires_revision" as const;
  static readonly ANSWER_REQUIRED = "answer_required" as const;
  static readonly APPROVAL_REQUEST_EXPIRED =
    "approval_request_expired" as const;
  static readonly STAGE_BOUNDARY_REQUIRED = "stage_boundary_required" as const;
  static readonly RUNTIME_RECONCILIATION_REQUIRED =
    "runtime_reconciliation_required" as const;
  static readonly INVALID_PROFILE_EVIDENCE =
    "invalid_profile_evidence" as const;
  static readonly CONTEXT_MISSING = "context_missing" as const;
  static readonly REVIEW_SNAPSHOT_CHANGED = "review_snapshot_changed" as const;
  static readonly SOURCE_CHANGED_BEFORE_UI_VERIFY =
    "source_changed_before_ui_verify" as const;
  static readonly SOURCE_CHANGED_DURING_UI_VERIFY =
    "source_changed_during_ui_verify" as const;
  static readonly WORKER_ALREADY_RUNNING = "worker_already_running" as const;
  static readonly STORIES_REQUIRED = "stories_required" as const;
  static readonly IMMUTABLE_PLAN = "immutable_plan" as const;
  static readonly INVALID_COMMENT_TARGET = "invalid_comment_target" as const;
  static readonly PLAN_FEEDBACK_REQUIRED = "plan_feedback_required" as const;
  static readonly STORIES_COMPLETE = "stories_complete" as const;
  static readonly STORY_SELECTION_LOCKED = "story_selection_locked" as const;
  static readonly STALE_STORY_EVIDENCE = "stale_story_evidence" as const;
  static readonly STORY_CHECKPOINT_UNAVAILABLE =
    "story_checkpoint_unavailable" as const;
  static readonly REPOSITORY_NOT_FOUND = "repository_not_found" as const;
  static readonly REPORT_OVERWRITES_SOURCE =
    "report_overwrites_source" as const;
  static readonly UI_VERDICT_INCOMPLETE = "ui_verdict_incomplete" as const;
  static readonly RUNTIME_STATE_UNKNOWN = "runtime_state_unknown" as const;
  static readonly CODEX_UNAVAILABLE = "codex_unavailable" as const;
  static readonly REPOSITORY_BUSY = "repository_busy" as const;
  static readonly ARTIFACT_TOO_LARGE = "artifact_too_large" as const;
  static readonly FOLDER_PICKER_UNSUPPORTED =
    "folder_picker_unsupported" as const;
  static readonly FOLDER_PICKER_BUSY = "folder_picker_busy" as const;
  static readonly FOLDER_PICKER_FAILED = "folder_picker_failed" as const;
}
