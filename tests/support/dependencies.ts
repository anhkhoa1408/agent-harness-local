import ts from "typescript";
import { relative } from "node:path";

export function dependencyViolations(
  sources: Record<string, string>,
  root: string,
): string[] {
  const violations: string[] = [];
  const edges = new Map<string, string[]>();
  const host: ts.ModuleResolutionHost = {
    fileExists: (path) => path in sources || ts.sys.fileExists(path),
    readFile: (path) => sources[path] ?? ts.sys.readFile(path),
    directoryExists: (path) =>
      Object.keys(sources).some((file) => file.startsWith(path + "/")) ||
      (ts.sys.directoryExists?.(path) ?? false),
  };
  const options: ts.CompilerOptions = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    baseUrl: root,
    resolveJsonModule: true,
    paths: { "@/*": ["./*"] },
  };
  for (const [file, text] of Object.entries(sources)) {
    const owner = relative(root, file).split("/")[0];
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const dependencies = new Set<string>();
    function visit(node: ts.Node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        dependencies.add(node.moduleSpecifier.text);
      if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      )
        dependencies.add(node.argument.literal.text);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require")) &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      )
        dependencies.add(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    const targets: string[] = [];
    for (const specifier of dependencies) {
      const target = ts.resolveModuleName(specifier, file, options, host)
        .resolvedModule?.resolvedFileName;
      const dependency =
        target && !relative(root, target).startsWith("../")
          ? relative(root, target).split("/")[0]
          : "external";
      const allowed =
        owner === "domain"
          ? ["domain"]
          : owner === "application"
            ? ["domain", "application"]
            : owner === "presentation"
              ? ["domain", "application", "presentation", "external"]
              : owner === "infrastructure"
                ? ["domain", "application", "infrastructure", "external"]
                : null;
      if (allowed && !allowed.includes(dependency))
        violations.push(`${relative(root, file)} -> ${specifier}`);
      else if (
        target &&
        owner === "application" &&
        dependency === "application" &&
        relative(root, file).split("/")[1] !==
          relative(root, target).split("/")[1] &&
        relative(root, target).split("/").length > 2 &&
        !target.endsWith("/index.ts")
      )
        violations.push(`${relative(root, file)} -> private ${specifier}`);
      if (target && target in sources) targets.push(target);
      if (!target && (specifier.startsWith(".") || specifier.startsWith("@/")))
        violations.push(`${relative(root, file)} -> unresolved ${specifier}`);
    }
    edges.set(file, targets);
  }
  const visiting: string[] = [],
    visited = new Set<string>();
  function walk(file: string) {
    if (visiting.includes(file)) {
      violations.push(
        `cycle: ${[...visiting.slice(visiting.indexOf(file)), file].map((path) => relative(root, path)).join(" -> ")}`,
      );
      return;
    }
    if (visited.has(file)) return;
    visiting.push(file);
    for (const target of edges.get(file) ?? []) walk(target);
    visiting.pop();
    visited.add(file);
  }
  for (const file of edges.keys()) walk(file);
  return violations;
}
