import { test, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import ts from "typescript";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}

test("backend dependencies respect application and adapter boundaries", () => {
  const root = resolve("src");
  const violations: string[] = [];
  const edges = new Map<string, string[]>();
  for (const file of sourceFiles(root)) {
    const owner = relative(root, file).split("/")[0];
    if (["app", "components", "lib"].includes(owner)) continue;
    const ast = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
    );
    const targets: string[] = [];
    for (const node of ast.statements) {
      if (
        !ts.isImportDeclaration(node) ||
        !ts.isStringLiteral(node.moduleSpecifier)
      )
        continue;
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith(".")) continue;
      const target = resolve(dirname(file), specifier + ".ts");
      const dependency = relative(root, target).split("/")[0];
      if (
        (owner === "core" && dependency !== "core") ||
        ([
          "application",
          "delivery",
          "storage",
          "execution",
          "repositories",
          "codex",
          "context",
        ].includes(owner) &&
          ["server", "worker"].includes(dependency)) ||
        (owner === "worker" && dependency === "server") ||
        (owner === "server" && dependency === "worker")
      )
        violations.push(`${relative(root, file)} -> ${specifier}`);
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const typeOnly =
        clause?.isTypeOnly ||
        (bindings &&
          ts.isNamedImports(bindings) &&
          !clause?.name &&
          bindings.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) targets.push(target);
    }
    edges.set(file, targets);
  }
  function visit(file: string, chain: string[]) {
    if (chain.includes(file)) {
      violations.push(
        `cycle: ${[...chain, file].map((f) => relative(root, f)).join(" -> ")}`,
      );
      return;
    }
    if (visited.has(file)) return;
    visited.add(file);
    for (const target of edges.get(file) ?? []) visit(target, [...chain, file]);
  }
  const visited = new Set<string>();
  for (const file of edges.keys()) visit(file, []);
  expect(violations).toEqual([]);
});
