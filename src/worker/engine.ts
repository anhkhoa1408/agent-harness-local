import type { Store } from "../storage/store";
import type { Lease } from "../storage/lease";
import type { Handlers } from "./types";
import { WorkerRuntime } from "./runtime";
export type { StageResult, StageHandler, Handlers, Attempt } from "./types";
export async function runWorker(
  raw: Store,
  source: Handlers | ((store: Store, lease: Lease) => Handlers),
  signal: AbortSignal,
) {
  return new WorkerRuntime(raw, source, signal).run();
}
