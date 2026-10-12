export class ExecutionLimits {
  private constructor() {}
  static readonly MAX_EVIDENCE_FILE_BYTES = 8 * 1024 * 1024;
  static readonly PROCESS_KILL_GRACE_MS = 5_000;
  static readonly MAX_FAILURE_EXCERPT_CHARACTERS = 2000;
  static readonly MAX_FAILURE_EXCERPTS = 6;
}
