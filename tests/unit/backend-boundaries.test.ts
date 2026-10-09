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
test("all backend layers obey inward dependency and public-module rules without exceptions", () => {
  const root = resolve("src");
  const sources = Object.fromEntries(
    ["domain", "application", "infrastructure", "presentation", "bootstrap"]
      .flatMap((layer) => files(resolve(root, layer)))
      .map((p) => [p, readFileSync(p, "utf8")]),
  );
  expect(dependencyViolations(sources, root)).toEqual([]);
});
