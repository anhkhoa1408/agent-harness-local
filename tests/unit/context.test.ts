import { test, expect } from "vitest";
import { composeInstructions } from "../../src/context/prompts";
test("repair receives the current no-limit policy after frozen skill instructions", () => {
  const oldPolicy = "STOP after three failed fixes and ask before Fix #4.";
  const text = composeInstructions({
    stage: "repair",
    hash: "old-frozen-bundle",
    adaptations: "Follow the approved scope.",
    files: [
      {
        id: "debugging",
        path: "/fixture/SKILL.md",
        sha256: "old",
        content: oldPolicy,
      },
    ],
  });
  expect(text).toContain(oldPolicy);
  expect(text).toContain("Repair has no fixed round or fix-count limit");
  expect(
    text.indexOf("Repair has no fixed round or fix-count limit"),
  ).toBeGreaterThan(text.indexOf(oldPolicy));
  expect(text).toContain(
    "Never stop or request input/replan solely because three fixes or repair rounds failed",
  );
  expect(text).toContain("approval, scope, runtime and environment gates");
});
test("explicit feature scope accompanies conflicting skill provenance", () => {
  const text = composeInstructions({
    stage: "implement",
    hash: "fixture",
    adaptations:
      "Only approved feature checks are mandatory. Keep skipped legacy checks visible.",
    files: [
      {
        id: "tdd",
        path: "/fixture/SKILL.md",
        sha256: "fixture",
        content: "Run the entire project suite.",
      },
    ],
  });
  expect(text).toContain("Only approved feature checks are mandatory");
  expect(text).toContain("Run the entire project suite");
  expect(text).toContain("/fixture/SKILL.md");
});
