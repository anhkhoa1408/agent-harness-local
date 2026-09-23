import { test, expect } from "vitest";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createTempRepo } from "../support/temp-repo";
import {
  inspectRepository,
  sourceDocuments,
  withSourceSnapshot,
} from "../../src/repositories/inspect";
test("planning snapshot preserves committed bytes instead of dirty local rules", async () => {
  const f = await createTempRepo({
    "AGENTS.md": "  committed rule\n",
    "app.py": "print(1)\n",
  });
  try {
    const repo = await inspectRepository(f.root, "main", null);
    await writeFile(join(f.root, "AGENTS.md"), "dirty rule");
    await withSourceSnapshot(repo, async (path) => {
      expect(await readFile(join(path, "AGENTS.md"), "utf8")).toBe(
        "  committed rule\n",
      );
    });
  } finally {
    await f.dispose();
  }
});
test("discovers committed Python source, preserving dirty original and never executing scripts", async () => {
  const f = await createTempRepo({
    "app.py": 'print("hello")',
    "package.json": '{"scripts":{"postinstall":"touch PWNED"}}',
  });
  try {
    await writeFile(join(f.root, "app.py"), "dirty");
    const repo = await inspectRepository(f.root, "main", null);
    expect(repo.root).toBe(f.root);
    expect(repo.dirty).toBe(true);
    expect(repo.head).toMatch(/^[a-f0-9]{40,64}$/);
    const docs = await sourceDocuments(repo);
    expect(docs.find((x) => x.path === "app.py")?.content).toContain("hello");
    expect(await readFile(join(f.root, "app.py"), "utf8")).toBe("dirty");
    await expect(readFile(join(f.root, "PWNED"))).rejects.toThrow();
    await expect(inspectRepository(f.root, "missing", null)).rejects.toThrow();
  } finally {
    await f.dispose();
  }
});
test("unborn repository is rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "unborn"));
  try {
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    await expect(inspectRepository(root, "main", null)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
