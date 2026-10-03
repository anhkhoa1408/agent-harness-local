import { resolve, join } from "node:path";
import { openStore, type Store } from "../storage/store";
import { connectCodex } from "../codex/client";
export const dataDir = resolve(process.env.HARNESS_DATA_DIR ?? ".harness");
const globalState = globalThis as typeof globalThis & { harnessStore?: Store };
export const getStore = () =>
  (globalState.harnessStore ??= openStore(join(dataDir, "harness.db")));
export async function modelCatalog() {
  if (process.env.HARNESS_TEST_MODE === "1")
    return [
      { id: "fixture-strong", efforts: ["high"], isDefault: false },
      { id: "fixture-medium", efforts: ["medium"], isDefault: false },
    ];
  const client = await connectCodex();
  try {
    return await client.models();
  } finally {
    await client.close();
  }
}
