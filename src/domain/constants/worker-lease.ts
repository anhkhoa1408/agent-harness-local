export class WorkerLease {
  private constructor() {}
  static readonly WORKER_LEASE_TTL_MS = 15_000;
  static readonly WORKER_HEARTBEAT_INTERVAL_MS = 5_000;
}
