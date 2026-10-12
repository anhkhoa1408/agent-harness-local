import { realpath } from "node:fs/promises";
import { resolve, relative, dirname, isAbsolute } from "node:path";
import { FilesystemErrorCode } from "./constants/filesystem-error-code";

export async function contained(root: string, path: string): Promise<string> {
  const base = await realpath(root);
  const candidate = resolve(base, path);
  let existing = candidate;
  const suffix: string[] = [];
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
  const actual = resolve(existing, ...suffix);
  const rel = relative(base, actual);
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel))
    throw new Error(FilesystemErrorCode.PATH_OUTSIDE_ROOT);
  return actual;
}
