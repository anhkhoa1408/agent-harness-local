export class CodexLimits {
  private constructor() {}
  static readonly RPC_REQUEST_TIMEOUT_MS = 30_000;
  static readonly AGENT_INTERRUPT_TIMEOUT_MS = 10_000;
  static readonly RUNTIME_PAGE_SIZE = 100;
  static readonly ROLLOUT_INITIAL_RETRY_DELAY_MS = 5;
  static readonly ROLLOUT_MAX_RETRY_DELAY_MS = 200;
  static readonly AGENT_TREE_STOP_SWEEPS = 2;
  static readonly AGENT_SETTINGS_SETTLE_TIMEOUT_MS = 1_000;
}
