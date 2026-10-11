export class RepositoriesErrorCode {
  private constructor() {}
  static readonly WORKTREE_COLLISION = "worktree_collision" as const;
  static readonly PREPARE_HEAD_CHANGED = "prepare_head_changed" as const;
  static readonly PREPARE_SOURCE_CHANGED = "prepare_source_changed" as const;
  static readonly PREPARE_DIRTY_WORKTREE = "prepare_dirty_worktree" as const;
  static readonly PREPARE_MERGE_COLLISION = "prepare_merge_collision" as const;
  static readonly CONFLICT_SCOPE_CHANGED = "conflict_scope_changed" as const;
  static readonly CONFLICT_RESOLUTION_CHANGED =
    "conflict_resolution_changed" as const;
  static readonly PREPARE_CONFLICTS_NEED_RESOLUTION =
    "prepare_conflicts_need_resolution" as const;
  static readonly CONFLICT_MARKERS_REMAINING =
    "conflict_markers_remaining" as const;
  static readonly PREPARE_CONFLICTS_UNRESOLVED =
    "prepare_conflicts_unresolved" as const;
  static readonly INVALID_ARTIFACT_PATH = "invalid_artifact_path" as const;
}
