import { resolve, join } from "node:path";
import { openStore } from "../storage/store";
import { runWorker } from "./engine";
import { createHandlers } from "./stages";
import { connectCodex, type AgentClient } from "../codex/client";
const data = resolve(process.env.HARNESS_DATA_DIR ?? ".harness"),
  store = openStore(join(data, "harness.db")),
  abort = new AbortController();
process.on("SIGINT", () => abort.abort());
process.on("SIGTERM", () => abort.abort());
let connected: AgentClient | undefined;
const get = async (): Promise<AgentClient> => {
  if (connected) return connected;
  connected =
    process.env.HARNESS_TEST_MODE === "1"
      ? await import("../../tests/support/e2e-agent").then((m) =>
          m.createFixtureAgent(),
        )
      : await connectCodex();
  return connected!;
};
const client: AgentClient = {
  listModels: async () => (await get()).listModels(),
  runDelegatedStage: async (...args) => (await get()).runDelegatedStage(...args),
  respondToApproval: async (...args) => (await get()).respondToApproval(...args),
  interruptTurn: async (...args) => (await get()).interruptTurn(...args),
  runDirectTurn: async (...args) => (await get()).runDirectTurn(...args),
  close: async () => {
    await connected?.close();
  },
};
try {
  await runWorker(store, (s) => createHandlers(s, client, data), abort.signal);
} finally {
  await client.close();
  store.close();
}
