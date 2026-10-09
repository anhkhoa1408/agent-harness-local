import type { WorkerRuntime } from "../../application/pipeline";
export function runWorkerEntry(runtime: WorkerRuntime) {
  return runtime.run();
}
