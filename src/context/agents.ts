import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Stage } from "../core/contracts";
import sources from "../../agents/sources.json";
import { contentHash, contextFile, type ContextFile } from "./rules";

type ProfileId = keyof typeof sources;
export function selectSpecialist(
  docs: { path: string; content: string }[],
): ProfileId | null {
  const candidates = new Set<ProfileId>();
  for (const doc of docs) {
    if (doc.path.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(doc.content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.next) candidates.add("voltagent/nextjs-developer");
        else if (deps.react || deps.vue || deps["@angular/core"])
          candidates.add("voltagent/frontend-developer");
      } catch {
        /* An unreadable manifest is not stack evidence. */
      }
    }
    if (/\.(py)$|(^|\/)(pyproject.toml|requirements.txt)$/.test(doc.path))
      candidates.add("voltagent/python-pro");
    if (
      /(pom.xml|build.gradle(?:.kts)?)$/.test(doc.path) &&
      doc.content.includes("org.springframework.boot")
    )
      candidates.add("voltagent/spring-boot-engineer");
  }
  // Mixed repositories retain a general implementer instead of guessing the feature's stack.
  return candidates.size === 1 ? [...candidates][0] : null;
}
async function stackDocuments(root: string) {
  const docs: { path: string; content: string }[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", ".harness", ".next"].includes(entry.name))
        continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (
        entry.isFile() &&
        /package.json$|\.py$|pyproject.toml$|requirements.txt$|pom.xml$|build.gradle(?:.kts)?$/.test(
          entry.name,
        )
      ) {
        if ((await stat(path)).size <= 64000)
          docs.push({
            path: relative(root, path),
            content: await readFile(path, "utf8"),
          });
      }
    }
  }
  await walk(root);
  return docs;
}
export async function loadProfile(id: ProfileId): Promise<ContextFile> {
  const source = sources[id];
  const file = await contextFile(
    `agent:${id}`,
    resolve("agents/profiles", id.replace("/", "-") + ".md"),
  );
  return {
    ...file,
    path: `${file.path}; adapted from ${source.url}; upstream SHA256 ${source.sha256}`,
  };
}
export async function agentProfiles(
  stage: Stage,
  root: string,
): Promise<ContextFile[]> {
  let ids: ProfileId[] = [];
  if (stage === "analyze") ids = ["voltagent/business-analyst"];
  if (stage === "plan") ids = ["ecc/planner"];
  if (stage === "implement") {
    const specialist = selectSpecialist(await stackDocuments(root));
    ids = [...(specialist ? [specialist] : []), "ecc/tdd-guide"];
  }
  if (stage === "review") ids = ["ecc/code-reviewer"];
  if (stage === "repair")
    ids = ["voltagent/debugger", "ecc/build-error-resolver", "ecc/tdd-guide"];
  const files = await Promise.all(ids.map(loadProfile));
  if (stage === "discover" || (stage === "implement" && ids.length === 1)) {
    const content =
      stage === "discover"
        ? "Read the committed repository snapshot, identify stack, conventions, candidate commands and source evidence. Missing files are unknown. Return Repo Profile without executing setup."
        : "Implement only the approved feature using the repository's languages, installed versions and existing conventions. For mixed stacks follow each changed area's local rules. Return the harness output schema.";
    files.unshift({
      id: `agent:harness/${stage === "discover" ? "repo-explorer" : "implementer"}`,
      path: "src/context/agents.ts",
      content,
      sha256: contentHash(content),
    });
  }
  return files;
}
