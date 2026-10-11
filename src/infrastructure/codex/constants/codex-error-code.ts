export class CodexErrorCode {
  private constructor() {}
  static readonly RUNTIME_CATALOG_CYCLE = "runtime_catalog_cycle" as const;
  static readonly AGENT_INVALID_OUTPUT = "agent_invalid_output" as const;
  static readonly SUBAGENT_IDENTITY_OR_SETTINGS_MISMATCH =
    "subagent_identity_or_settings_mismatch" as const;
  static readonly SUBAGENT_FAILED = "subagent_failed" as const;
  static readonly SUBAGENT_OUTPUT_MISMATCH =
    "subagent_output_mismatch" as const;
  static readonly SUBAGENT_LIMIT_EXCEEDED = "subagent_limit_exceeded" as const;
  static readonly SUBAGENT_SPAWN_CONTRACT_VIOLATION =
    "subagent_spawn_contract_violation" as const;
  static readonly SUBAGENT_CAPABILITY_UNAVAILABLE =
    "subagent_capability_unavailable" as const;
  static readonly RUNTIME_INVALID_MESSAGE = "runtime_invalid_message" as const;
  static readonly RUNTIME_DISCONNECTED = "runtime_disconnected" as const;
}
