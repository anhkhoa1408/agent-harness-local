export class WorkerTiming {
  private constructor() {}
  static readonly APPROVAL_POLL_INTERVAL_MS = 100;
  static readonly WORKER_POLL_INTERVAL_MS = 25;
  static readonly STAGE_TIMEOUT_MS = 30 * 60 * 1000;
}
