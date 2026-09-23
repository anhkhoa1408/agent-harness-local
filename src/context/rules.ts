import { realpath, readFile, stat } from "node:fs/promises";
import { resolve, relative, dirname, join, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
export type ContextFile = {
  id: string;
  path: string;
  sha256: string;
  content: string;
};
export const contentHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function contained(root: string, path: string): Promise<string> {
  const base = await realpath(root);
  const candidate = resolve(base, path);
  let existing = candidate;
  let suffix: string[] = [];
  for (;;) {
    try {
      existing = await realpath(existing);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      suffix.unshift(existing.slice(parent.length + 1));
      existing = parent;
    }
  }
  const actual = resolve(existing, ...suffix),
    rel = relative(base, actual);
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel))
    throw new Error("path_outside_root");
  return actual;
}
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
  const base = await realpath(root),
    dirs = new Set([base]);
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
