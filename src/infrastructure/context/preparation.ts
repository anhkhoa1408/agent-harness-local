import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ContextPort,
  PacketPort,
} from "../../application/agent-execution";
import { withSourceSnapshot } from "../repositories/inspect";
import { resolveBundle, snapshotBundle } from "./skills";
import { contentHash, repoRules } from "./rules";
export const contextIO: ContextPort = {
  sourceSnapshot: withSourceSnapshot,
  resolve: (stage, root, liquid) => resolveBundle(stage, root, [], liquid),
  save: snapshotBundle,
  hash: contentHash,
  rules: repoRules,
};
export const packetIO: PacketPort = {
  path: (artifacts, id) => join(artifacts, "delegations", `${id}.json`),
  async write(path, value) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value), { flag: "wx", mode: 0o600 });
  },
};
export const supportsApproval = (method: string) =>
  [
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
  ].includes(method);
