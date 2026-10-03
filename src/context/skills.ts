import { agentProfiles, loadProfile } from "./agents";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Stage } from "../core/contracts";
import {
  contained,
  contextFile,
  contentHash,
  repoRules,
  type ContextFile,
} from "./rules";
export type Bundle = {
  stage: Stage;
  files: ContextFile[];
  adaptations: string;
  optionalFiles?: ContextFile[];
  hash: string;
};
const registry: Partial<Record<Stage, string[]>> = {
  analyze: ["mattpocock-skills/grilling/SKILL.md"],
  plan: ["superpowers/writing-plans/SKILL.md"],
  implement: [
    "superpowers/test-driven-development/SKILL.md",
    "superpowers/test-driven-development/writing-good-tests.md",
  ],
  review: [
    "superpowers/requesting-code-review/SKILL.md",
    "superpowers/requesting-code-review/code-reviewer.md",
  ],
  repair: [
    "superpowers/receiving-code-review/SKILL.md",
    "superpowers/systematic-debugging/SKILL.md",
    "superpowers/systematic-debugging/root-cause-tracing.md",
    "superpowers/test-driven-development/SKILL.md",
    "superpowers/test-driven-development/writing-good-tests.md",
    "superpowers/verification-before-completion/SKILL.md",
  ],
};
export const adaptations =
  "Only approved feature checks are mandatory. Keep skipped legacy checks visible. The worker owns stage transitions, independent reviewer dispatch, Git worktrees and delivery. Do not spawn subagents, change models, merge, deploy, or expand approved scope. A changed scope, dependency or requirement needs a new approved plan. Reply in Vietnamese; preserve technical terms. Use the harness output schema and supplied context instead of upstream templates or context-manager calls. Upstream model/tools metadata does not grant permissions. Coverage percentages and framework versions in upstream references are examples, not requirements; use installed versions and approved feature checks. Git commits, pushes, deployment, orchestration and final pass/fail decisions belong to the worker.";
export async function resolveBundle(
  stage: Stage,
  roots: Record<string, string>,
  repoRoot: string,
  relevantPaths: string[],
  liquidTask: boolean,
): Promise<Bundle> {
  const baseline = await contextFile(
    "baseline",
    roots.baseline ?? resolve("AGENTS.md"),
  );
  baseline.content = baseline.content.split(/^##\s+7[.\s]/m)[0].trim();
  baseline.sha256 = contentHash(baseline.content);
  const files = [
    baseline,
    ...(await agentProfiles(stage, repoRoot)),
    ...(await repoRules(repoRoot, relevantPaths, liquidTask)),
  ];
  for (const id of registry[stage] ?? []) {
    const [provider, ...parts] = id.split("/");
    if (!roots[provider]) throw new Error(`skill_unavailable:${id}`);
    try {
      files.push(
        await contextFile(
          `skill:${id}`,
          await contained(roots[provider], parts.join("/")),
        ),
      );
    } catch {
      throw new Error(`skill_unavailable:${id}`);
    }
  }
  const optionalFiles =
    stage === "implement" || stage === "repair"
      ? [await loadProfile("ecc/e2e-runner")]
      : [];
  return {
    stage,
    optionalFiles,
    files,
    adaptations,
    hash: contentHash(
      JSON.stringify({
        stage,
        adaptations,
        optionalFiles: optionalFiles.map((f) => [f.id, f.sha256, f.path]),
        files: files.map((f) => [f.id, f.sha256, f.path]).sort(),
      }),
    ),
  };
}
export async function snapshotBundle(
  bundle: Bundle,
  artifactsDir: string,
): Promise<string> {
  await mkdir(artifactsDir, { recursive: true });
  const path = join(
    artifactsDir,
    `context-${bundle.stage}-${bundle.hash}.json`,
  );
  try {
    await writeFile(path, JSON.stringify(bundle, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return path;
}
