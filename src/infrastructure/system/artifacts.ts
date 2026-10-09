import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { contained } from "../context/rules";
import type { ArtifactReaderPort } from "../../application/artifacts";
export function artifactReader(data: string): ArtifactReaderPort {
  return {
    async read(recordPath, screenshot) {
      const path = await contained(join(data, "artifacts"), recordPath);
      if ((await stat(path)).size > 8 * 1024 * 1024)
        throw new Error("artifact_too_large");
      return screenshot
        ? Uint8Array.from(await readFile(path)).buffer
        : await readFile(path, "utf8");
    },
  };
}
