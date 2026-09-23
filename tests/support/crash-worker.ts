import { openStore } from "../../src/storage/store";
import { runWorker, type Handlers } from "../../src/worker/engine";
import { stages } from "../../src/core/contracts";
const store = openStore(process.argv[2]);
await runWorker(
  store,
  Object.fromEntries(
    stages.map((stage) => [stage, () => new Promise(() => {})]),
  ) as unknown as Handlers,
  new AbortController().signal,
);
