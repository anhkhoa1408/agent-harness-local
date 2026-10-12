import { test, expect } from "vitest";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { aiStages } from "../../src/domain/contracts";
import { composeInstructions } from "../../src/application/agent-execution";
import { contentHash } from "../../src/infrastructure/context/rules";
import {
  resolveBundle,
  snapshotBundle,
} from "../../src/infrastructure/context/skills";

const contextSkill = "context-mode/context-mode/SKILL.md";
const utilitySkills = ["ctx-index", "ctx-search", "ctx-stats"];

test("shipped context skills match their provenance hashes and identify the adapted guide", async () => {
  const manifest = JSON.parse(await readFile("skills/sources.json", "utf8"));
  const source = manifest["context-mode"];
  expect(source).toBeDefined();
  expect(source.adaptedFiles).toEqual(["context-mode/SKILL.md"]);
  for (const [path, sha256] of Object.entries(source.files)) {
    expect(
      contentHash(await readFile(join("skills/context-mode", path), "utf8")),
    ).toBe(sha256);
  }
});

test("AI stage packets receive one portable context guide without eagerly loading utility skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-mode-skills-"));
  try {
    await cp("skills", join(root, "skills"), { recursive: true });
    await cp("agents", join(root, "agents"), { recursive: true });
    await cp("AGENTS.md", join(root, "AGENTS.md"));
    const repo = join(root, "repo");
    await mkdir(repo);
    for (const stage of aiStages) {
      const bundle = await resolveBundle(stage, repo, [], false, root);
      const guides = bundle.files.filter((f) =>
        f.id.startsWith("skill:context-mode/"),
      );
      expect(guides.map((f) => f.id)).toEqual([`skill:${contextSkill}`]);
      const guide = guides[0];
      expect(Buffer.byteLength(guide.content)).toBeLessThanOrEqual(4096);
      expect(guide.sha256).toBe(contentHash(guide.content));
      expect(guide.path).toBe(
        await realpath(join(root, "skills", contextSkill)),
      );
      const prompt = composeInstructions(bundle);
      expect(prompt).toContain(guide.content);
      for (const name of utilitySkills) {
        const utility = await readFile(
          join(root, "skills/context-mode", name, "SKILL.md"),
          "utf8",
        );
        expect(prompt).not.toContain(utility);
      }
    }
    for (const stage of ["prepare", "verify", "deliver"] as const) {
      const bundle = await resolveBundle(stage, repo, [], false, root);
      expect(
        bundle.files.some((f) => f.id.startsWith("skill:context-mode/")),
      ).toBe(false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("context guide updates change new bundles while frozen snapshots and utility-only edits remain stable", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-mode-snapshot-"));
  try {
    await cp("skills", join(root, "skills"), { recursive: true });
    await cp("agents", join(root, "agents"), { recursive: true });
    await cp("AGENTS.md", join(root, "AGENTS.md"));
    const bundle = await resolveBundle("discover", root, [], false, root);
    const artifact = await snapshotBundle(bundle, join(root, "artifacts"));
    const frozen = await readFile(artifact, "utf8");
    await writeFile(
      join(root, "skills/context-mode/ctx-search/SKILL.md"),
      "Updated utility.",
    );
    expect((await resolveBundle("discover", root, [], false, root)).hash).toBe(
      bundle.hash,
    );
    await writeFile(
      join(root, "skills", contextSkill),
      "Updated context guide.",
    );
    expect(
      (await resolveBundle("discover", root, [], false, root)).hash,
    ).not.toBe(bundle.hash);
    expect(await readFile(artifact, "utf8")).toBe(frozen);
    await rm(join(root, "skills", contextSkill));
    await expect(
      resolveBundle("discover", root, [], false, root),
    ).rejects.toThrow(`skill_unavailable:${contextSkill}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
