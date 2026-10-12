export class PersistenceLimits {
  private constructor() {}
  static readonly DATABASE_BUSY_TIMEOUT_MS = 5_000;
  static readonly EVENT_PAGE_SIZE = 500;
}
