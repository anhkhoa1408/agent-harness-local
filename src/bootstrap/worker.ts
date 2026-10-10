import type { Store } from "../infrastructure/persistence/store";
import {
  claimLease,
  renewLease,
  releaseLease,
  fencedStore,
  type Lease,
} from "../infrastructure/persistence/lease";
import type { Handlers } from "../application/pipeline-contracts";
import { WorkerRuntime } from "../application/pipeline";
import { runWorkerEntry } from "../presentation/worker/main";
import { systemRuntime } from "../infrastructure/runtime/system";
import { validation } from "../infrastructure/validation/gateway";
import { createServices } from "./services";
export type {
  StageResult,
  StageHandler,
  Handlers,
  Attempt,
} from "../application/pipeline-contracts";
export async function runWorker(
  raw: Store,
  source: Handlers | ((store: Store, lease: Lease) => Handlers),
  signal: AbortSignal,
) {
  return runWorkerEntry(
    new WorkerRuntime(
      {
        claim: (...args) => claimLease(raw.db, ...args),
        renew: (...args) => renewLease(raw.db, ...args),
        release: (lease) => releaseLease(raw.db, lease),
        scope(lease) {
          const fenced = fencedStore(raw, lease);
          const services = createServices(fenced);
          return {
            store: services.store,
            handlers:
              typeof source === "function" ? source(fenced, lease) : source,
            storyService: services.stories,
            planService: services.plans,
          };
        },
      },
      systemRuntime,
      validation,
      signal,
    ),
  );
}
