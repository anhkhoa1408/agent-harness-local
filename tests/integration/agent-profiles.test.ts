import { test, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  agentProfiles,
  selectSpecialist,
} from "../../src/infrastructure/context/agents";
import { contentHash } from "../../src/infrastructure/context/rules";
test("stack selection uses manifest evidence and unknown stacks stay generic", () => {
  expect(
    selectSpecialist([
      { path: "package.json", content: '{"dependencies":{"next":"16"}}' },
    ]),
  ).toBe("voltagent/nextjs-developer");
  expect(selectSpecialist([{ path: "app.py", content: "" }])).toBe(
    "voltagent/python-pro",
  );
  expect(
    selectSpecialist([
      { path: "pom.xml", content: "org.springframework.boot" },
    ]),
  ).toBe("voltagent/spring-boot-engineer");
  expect(selectSpecialist([{ path: "main.rs", content: "" }])).toBeNull();
  expect(
    selectSpecialist([{ path: "package.json", content: "broken" }]),
  ).toBeNull();
  expect(
    selectSpecialist([
      { path: "web/package.json", content: '{"dependencies":{"next":"16"}}' },
      { path: "api/app.py", content: "" },
    ]),
  ).toBeNull();
});
test("stage profiles are pinned, hashed, scoped and contain no Claude frontmatter", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-profiles-"));
  try {
    await writeFile(
      join(root, "package.json"),
      '{"dependencies":{"next":"16"}}',
    );
    const plan = await agentProfiles("plan", root);
    expect(plan.map((f) => f.id)).toContain("agent:ecc/planner");
    const impl = await agentProfiles("implement", root);
    expect(impl.map((f) => f.id)).toContain("agent:voltagent/nextjs-developer");
    expect(impl.map((f) => f.id)).toContain("agent:ecc/tdd-guide");
    expect(impl.map((f) => f.id)).not.toContain("agent:ecc/e2e-runner");
    for (const f of [...plan, ...impl]) {
      expect(f.sha256).toBe(contentHash(f.content));
      expect(f.path).toMatch(/github.com.*blob\/[a-f0-9]{40}/);
      expect(f.content).not.toContain("model: sonnet");
    }
    expect((await agentProfiles("review", root)).map((f) => f.id)).toEqual([
      "agent:ecc/code-reviewer",
    ]);
    expect(await agentProfiles("verify", root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
