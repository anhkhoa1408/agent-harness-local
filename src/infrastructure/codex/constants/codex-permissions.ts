export class CodexPermissions {
  private constructor() {}
  static readonly APPROVAL_NEVER = "never" as const;
  static readonly APPROVAL_ON_REQUEST = "on-request" as const;
  static readonly SANDBOX_READ_ONLY = "read-only" as const;
  static readonly SANDBOX_WORKSPACE_WRITE = "workspace-write" as const;
  static readonly SANDBOX_TYPE_READ_ONLY = "readOnly" as const;
  static readonly SANDBOX_TYPE_WORKSPACE_WRITE = "workspaceWrite" as const;
}
