import { test, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dependencyViolations } from "../support/dependencies";
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(resolve(dir, e.name))
      : /\.tsx?$/.test(e.name)
        ? [resolve(dir, e.name)]
        : [],
  );
}
test("domain is independent of validation, persistence, runtime and transport", () => {
  const root = resolve("src");
  const sources = Object.fromEntries(
    files(resolve(root, "domain")).map((p) => [p, readFileSync(p, "utf8")]),
  );
  expect(dependencyViolations(sources, root)).toEqual([]);
});
