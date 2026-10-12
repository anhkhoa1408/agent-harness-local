export class RepositoryLimits {
  private constructor() {}
  static readonly GIT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
  static readonly GIT_COMMAND_TIMEOUT_MS = 120_000;
  static readonly MAX_SOURCE_DOCUMENT_BYTES = 64_000;
  static readonly MAX_SOURCE_CONTEXT_BYTES = 500_000;
}
