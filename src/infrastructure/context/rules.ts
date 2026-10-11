import { contentHash } from "../utils/content-hash";
import { contained } from "../utils/contained-path";
import { realpath, readFile, stat } from "node:fs/promises";
import { relative, dirname, join } from "node:path";
import type { ContextFile } from "../../application/agent-execution";
export type { ContextFile } from "../../application/agent-execution";
export async function contextFile(
  id: string,
  path: string,
): Promise<ContextFile> {
  const content = await readFile(path, "utf8");
  return { id, path, content, sha256: contentHash(content) };
}
export async function repoRules(
  root: string,
  paths: string[],
  liquid: boolean,
): Promise<ContextFile[]> {
  const base = await realpath(root);
  const dirs = new Set([base]);
  for (const path of paths) {
    let current = await contained(base, path);
    try {
      if (!(await stat(current)).isDirectory()) current = dirname(current);
    } catch {
      current = dirname(current);
    }
    while (current !== base) {
      dirs.add(current);
      current = dirname(current);
    }
  }
  const files: ContextFile[] = [];
  for (const dir of [...dirs].sort()) {
    const options = dir === base ? ["AGENTS.md", "CLAUDE.md"] : ["AGENTS.md"];
    for (const name of options) {
      try {
        const path = await contained(base, join(dir, name));
        files.push(await contextFile(`repo:${relative(base, path)}`, path));
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  if (liquid) {
    try {
      files.push(
        await contextFile(
          "rule:lighthouse",
          await contained(base, "rules/lighthouse-performance.md"),
        ),
      );
    } catch {
      throw new Error("rule_unavailable:lighthouse-performance");
    }
  }
  return files;
}
