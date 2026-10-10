import { expect, test } from "vitest";
import { dependencyViolations } from "../support/dependencies";
const root = "/fixture/src";
const audit = (sources: Record<string, string>) =>
  dependencyViolations(
    Object.fromEntries(
      Object.entries(sources).map(([p, body]) => [`${root}/${p}`, body]),
    ),
    root,
  );
test.each([
  'import type { Store } from "../infrastructure/store";',
  'export type { Store } from "../infrastructure/store";',
  'type Store = import("../infrastructure/store").Store;',
  'const load = () => import("@/infrastructure/store");',
  'const load = require("../infrastructure/store");',
  'import type {Store} from "@/infrastructure/store";',
])("application rejects infrastructure dependency through %s", (body) => {
  expect(
    audit({
      "application/service.ts": body,
      "infrastructure/store.ts": "export type Store = {};",
    }),
  ).toHaveLength(1);
});
test("domain rejects external validation and Node dependencies", () => {
  expect(
    audit({
      "domain/policy.ts":
        'import { z } from "zod"; import { readFile } from "node:fs/promises";',
    }),
  ).toHaveLength(2);
});
test("module consumers cannot import another module's implementation", () => {
  expect(
    audit({
      "application/tasks/service.ts":
        'import { plan } from "../planning/internal";',
      "application/planning/internal.ts": "export const plan = 1;",
    }),
  ).toHaveLength(1);
});
test("public module interface and outward adapter dependencies are allowed", () => {
  expect(
    audit({
      "infrastructure/store.ts": 'import type { Task } from "@/domain/task";',
      "domain/task.ts": "export type Task = {};",
      "application/tasks/service.ts": 'import { plan } from "../planning";',
      "application/planning/index.ts": 'export { plan } from "./internal";',
      "application/planning/internal.ts": "export const plan = 1;",
    }),
  ).toEqual([]);
});
test("type-only dependency cycles are rejected", () => {
  expect(
    audit({
      "domain/a.ts": 'import type { B } from "./b"; export type A = B;',
      "domain/b.ts": 'import type { A } from "./a"; export type B = A;',
    }).some((v) => v.startsWith("cycle:")),
  ).toBe(true);
});

test.each([
  "node:fs/promises",
  "fs",
  "node:child_process",
  "node:sqlite",
  "better-sqlite3",
  "simple-git",
])("presentation rejects direct I/O through %s", (specifier) => {
  expect(
    audit({
      "presentation/http/controller.ts": `import adapter from "${specifier}";`,
    }),
  ).toHaveLength(1);
});
test("presentation may use request validation and framework packages", () => {
  expect(
    audit({
      "presentation/http/controller.ts":
        'import {z} from "zod"; import type {NextRequest} from "next/server";',
    }),
  ).toEqual([]);
});
