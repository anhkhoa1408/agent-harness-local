import { test, expect } from "vitest";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveBundle } from "../../src/context/skills";
import { aiStages } from "../../src/core/contracts";
test("copied runtime skills need no installed plugin roots on another machine", async () => {
  const root = await mkdtemp(join(tmpdir(), "portable-skills-"));
  try {
    await cp("skills", join(root, "skills"), { recursive: true });
    await cp("AGENTS.md", join(root, "AGENTS.md"));
    await cp("agents", join(root, "agents"), { recursive: true });
    const repo = join(root, "repo");
    await mkdir(repo);
    await writeFile(join(repo, "AGENTS.md"), "Target repo convention");
    for (const stage of aiStages) {
      const b = await resolveBundle(stage, repo, [], false, root);
      expect(
        b.files.some((f) => f.content.includes("Target repo convention")),
      ).toBe(true);
      const skillFiles = b.files.filter((f) => f.id.startsWith("skill:"));
      if (stage !== "discover") expect(skillFiles.length).toBeGreaterThan(0);
      for (const f of skillFiles) {
        expect(f.path).toContain(join(root, "skills"));
        expect(f.path).not.toContain(".codex/plugins");
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
