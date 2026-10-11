export class CodexRpcMethod {
  private constructor() {}
  static readonly ITEM_AGENT_MESSAGE_DELTA = "item/agentMessage/delta" as const;
  static readonly ITEM_COMPLETED = "item/completed" as const;
  static readonly ITEM_STARTED = "item/started" as const;
  static readonly MODEL_LIST = "model/list" as const;
  static readonly THREAD_LIST = "thread/list" as const;
  static readonly THREAD_READ = "thread/read" as const;
  static readonly THREAD_RESUME = "thread/resume" as const;
  static readonly THREAD_SETTINGS_UPDATE = "thread/settings/update" as const;
  static readonly THREAD_START = "thread/start" as const;
  static readonly THREAD_TOKEN_USAGE_UPDATED =
    "thread/tokenUsage/updated" as const;
  static readonly TURN_COMPLETED = "turn/completed" as const;
  static readonly TURN_INTERRUPT = "turn/interrupt" as const;
  static readonly TURN_START = "turn/start" as const;
  static readonly TURN_STARTED = "turn/started" as const;
}
