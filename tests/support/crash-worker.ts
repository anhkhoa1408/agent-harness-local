import { openStore } from "../../src/infrastructure/persistence/store";
import { runWorker, type Handlers } from "../../src/bootstrap/worker";
import { stages } from "../../src/domain/contracts";
const store = openStore(process.argv[2]);
await runWorker(
  store,
  Object.fromEntries(
    stages.map((stage) => [stage, () => new Promise(() => {})]),
  ) as unknown as Handlers,
  new AbortController().signal,
);
