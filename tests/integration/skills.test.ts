import { test, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  cp,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveBundle, snapshotBundle } from "../../src/context/skills";
test("snapshots remain unchanged after bundled skill edits and include scoped nested rules", async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-skills-"));
  try {
    await cp("agents", join(root, "agents"), { recursive: true });
    const skills = join(root, "skills/superpowers"),
      repo = join(root, "repo");
    await mkdir(join(skills, "test-driven-development"), { recursive: true });
    await mkdir(join(repo, "src"), { recursive: true });
    await writeFile(
      join(root, "AGENTS.md"),
      "## 1. Rules\nKeep scope.\n## 7. Workspace only\nPrivate spec pointer.",
    );
    await writeFile(
      join(skills, "test-driven-development/SKILL.md"),
      "Test before code.",
    );
    await writeFile(
      join(skills, "test-driven-development/writing-good-tests.md"),
      "Test real behavior.",
    );
    await writeFile(join(repo, "AGENTS.md"), "Root conventions.");
    await writeFile(join(repo, "src/AGENTS.md"), "Nested conventions.");
    const bundle = await resolveBundle(
      "implement",
      repo,
      ["src/page.ts"],
      false,
      root,
    );
    expect(bundle.files.map((x) => x.content).join("\n")).not.toContain(
      "Private spec pointer",
    );
    expect(bundle.files.some((x) => x.content === "Nested conventions.")).toBe(
      true,
    );
    expect(bundle.files.some((f) => f.id === "agent:ecc/tdd-guide")).toBe(true);
    expect(bundle.files.some((f) => f.id === "agent:ecc/e2e-runner")).toBe(
      false,
    );
    expect(bundle.optionalFiles?.map((f) => f.id)).toEqual([
      "agent:ecc/e2e-runner",
    ]);
    const artifact = await snapshotBundle(bundle, join(root, "artifacts"));
    const before = JSON.parse(await readFile(artifact, "utf8"));
    bundle.optionalFiles![0].content = "Changed live memory";
    expect(JSON.parse(await readFile(artifact, "utf8")).optionalFiles).toEqual(
      before.optionalFiles,
    );
    await writeFile(
      join(skills, "test-driven-development/SKILL.md"),
      "Different policy.",
    );
    expect(JSON.parse(await readFile(artifact, "utf8")).hash).toBe(bundle.hash);
    expect(
      (await resolveBundle("implement", repo, ["src/page.ts"], false, root))
        .hash,
    ).not.toBe(bundle.hash);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("missing required skill and conditional Lighthouse rule block instead of disappearing", async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-rules-"));
  try {
    await cp("agents", join(root, "agents"), { recursive: true });
    await writeFile(join(root, "AGENTS.md"), "Base.");
    await expect(
      resolveBundle("discover", root, [], false, root),
    ).resolves.toHaveProperty("stage", "discover");
    await expect(
      resolveBundle("discover", root, [], true, root),
    ).rejects.toThrow("rule_unavailable");
    await expect(
      resolveBundle("implement", root, [], false, root),
    ).rejects.toThrow("skill_unavailable");
    await symlink("/etc", join(root, "outside"));
    await expect(
      resolveBundle("discover", root, ["outside/passwd"], false, root),
    ).rejects.toThrow("path_outside_root");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
