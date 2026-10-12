export class SystemLimits {
  private constructor() {}
  static readonly FOLDER_PICKER_TIMEOUT_MS = 120000;
  static readonly CLI_STATUS_MAX_BUFFER_BYTES = 16384;
  static readonly CODEX_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
  static readonly CODEX_LOGIN_STATUS_TIMEOUT_MS = 10000;
  static readonly MAX_LOGIN_OUTPUT_CHARACTERS = 65536;
}
