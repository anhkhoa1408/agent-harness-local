import { createRepositories } from "../../src/infrastructure/persistence/repositories";
import { verificationIO } from "../../src/infrastructure/execution/verification";
import { validation } from "../../src/infrastructure/validation/gateway";
import { test, expect } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTempRepo } from "../support/temp-repo";
import { taskFixture, planFixture } from "../support/task-fixture";
import { gitText } from "../../src/infrastructure/repositories/inspect";
import { runChecks } from "../../src/bootstrap/verification";
import {
  collectScreenshots,
  visualChecks,
  verifyImageEvidence,
} from "../../src/infrastructure/execution/ui-verification";
import { acceptanceErrors, validatePlan } from "../../src/domain/acceptance";
import { createVerifyHandler } from "../../src/application/pipeline/handlers/verify";
import type { StageHandlerContext } from "../../src/application/pipeline/context";
import { openStore } from "../../src/infrastructure/persistence/store";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=";
const selection = {
  id: "desktop",
  checkId: "feature-unit",
  path: "evidence/desktop.png",
  criterionIds: ["AC-1"],
  viewport: { width: 1, height: 1 },
  referencePath: null,
};
const plan = () =>
  planFixture({
    checks: [{ ...planFixture().checks[0], kind: "e2e" }],
    uiVerification: { screenshots: [selection] },
  });

test("visual reviewer receives an explicit boundary for behavior that static images cannot prove", async () => {
  const f = await createTempRepo({ "app.js": "source" });
  const dir = await mkdtemp(join(tmpdir(), "ui-review-scope-"));
  const store = openStore(":memory:");
  try {
    const sourceCommit = await gitText(f.root, ["rev-parse", "HEAD"]);
    const task = taskFixture({
      worktree: f.root,
      sourceCommit,
      approvedPlanVersion: 1,
    });
    const p = {
      ...plan(),
      sourceCommit,
      criteria: [
        {
          id: "AC-1",
          description: "Canvas is visible and animates",
          checkIds: ["feature-unit"],
        },
      ],
      checks: [
        {
          ...plan().checks[0],
          executable: process.execPath,
          args: [
            "-e",
            `require('fs').mkdirSync('evidence'); require('fs').writeFileSync('${selection.path}', Buffer.from('${png}', 'base64')); console.log('TAP version 13\\n1..1\\nok 1 - animation')`,
          ],
        },
      ],
    };
    let instruction = "";
    const handler = createVerifyHandler({
      validation,
      store: createRepositories(store),
      verificationIO,
      artifacts: () => dir,
      planOf: () => p,
      fingerprint: async () =>
        (store.getRecord("checks", task.id) as { fingerprint: string }[])[0]
          .fingerprint,
      storyService: { recordEvidence() {} },
      executor: {
        async executeAgentStage(
          _task: unknown,
          _stage: unknown,
          _schema: unknown,
          context: { instruction: string },
        ) {
          instruction = context.instruction;
          return {
            screenshots: [
              {
                id: "desktop",
                passed: true,
                evidence:
                  "Visible canvas matches layout; animation is covered separately by tests",
              },
            ],
          };
        },
      },
    } as unknown as StageHandlerContext);
    const result = await handler(task, new AbortController().signal);
    expect(result).toMatchObject({ stage: "review", status: "queued" });
    expect(instruction).toContain("Do not fail a screenshot solely because");
    expect(instruction).toContain(
      "remain the responsibility of automated checks and the independent code review",
    );
  } finally {
    store.close();
    await f.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});

test("UI plan requires a mandatory E2E producer, valid criteria and distinct bounded screenshot paths", () => {
  expect(validatePlan(plan())).toEqual([]);
  expect(
    validatePlan({
      ...plan(),
      checks: [{ ...plan().checks[0], required: false }],
    }),
  ).toContain("ui_e2e_required:desktop");
  expect(
    validatePlan({
      ...plan(),
      uiVerification: {
        screenshots: [{ ...selection, criterionIds: ["unknown"] }],
      },
    }),
  ).toContain("ui_criterion:desktop");
  expect(
    validatePlan({
      ...plan(),
      uiVerification: {
        screenshots: [{ ...selection, path: "../escape.png" }],
      },
    }),
  ).toContain("ui_path:desktop");
  expect(
    validatePlan({
      ...plan(),
      uiVerification: { screenshots: [selection, selection] },
    }),
  ).toContain("ui_duplicate_selection");
});

test("runner deletes stale screenshot; producer must create fresh PNG and visual evidence survives cleanup", async () => {
  const f = await createTempRepo({ "app.js": "source" });
  const dir = await mkdtemp(join(tmpdir(), "ui-evidence-"));
  try {
    const sourceCommit = await gitText(f.root, ["rev-parse", "HEAD"]);
    const task = taskFixture({ worktree: f.root, sourceCommit });
    const p = {
      ...plan(),
      sourceCommit,
      checks: [
        {
          ...plan().checks[0],
          executable: process.execPath,
          args: ["-e", "console.log('TAP version 13\\n1..1\\nok 1 - UI')"],
        },
      ],
    };
    await mkdir(join(f.root, "evidence"));
    await writeFile(join(f.root, selection.path), Buffer.from(png, "base64"));
    const checks = await runChecks(task, p, new AbortController().signal, dir);
    expect(checks[0].status).toBe("passed");
    await expect(collectScreenshots(task, p, checks, dir)).rejects.toThrow(
      "ENOENT",
    );
    const producer = `require('fs').writeFileSync('${selection.path}', Buffer.from('${png}', 'base64')); console.log('TAP version 13\\n1..1\\nok 1 - UI')`;
    p.checks[0].args = ["-e", producer];
    const fresh = await runChecks(task, p, new AbortController().signal, dir);
    const shots = await collectScreenshots(task, p, fresh, dir);
    const visual = visualChecks(task, p, fresh[0].fingerprint, shots, {
      screenshots: [
        { id: "desktop", passed: true, evidence: "Expected UI is visible" },
      ],
    });
    expect(visual[0]).toMatchObject({
      id: "ui:desktop",
      status: "passed",
      fingerprint: fresh[0].fingerprint,
    });
    await rm(join(f.root, "evidence"), { recursive: true });
    await expect(verifyImageEvidence(visual)).resolves.toBeUndefined();
    await writeFile(visual[0].evidencePath, "tampered");
    await expect(verifyImageEvidence(visual)).rejects.toThrow(
      "ui_evidence_changed",
    );
  } finally {
    await f.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});

test("visual gate refuses omitted verdicts and delivery cannot accept missing or stale UI evidence", async () => {
  const f = await createTempRepo({ "app.js": "source" });
  const dir = await mkdtemp(join(tmpdir(), "ui-gate-"));
  try {
    const sourceCommit = await gitText(f.root, ["rev-parse", "HEAD"]);
    const task = taskFixture({
      worktree: f.root,
      sourceCommit,
      approvedPlanVersion: 1,
    });
    const p = { ...plan(), sourceCommit };
    const check = {
      id: "feature-unit",
      taskId: task.id,
      planVersion: 1,
      fingerprint: "snap",
      status: "passed" as const,
      executed: 1,
      exitCode: 0,
      evidencePath: "/log",
      reason: null,
    };
    await mkdir(join(f.root, "evidence"));
    await writeFile(join(f.root, selection.path), Buffer.from(png, "base64"));
    const shots = await collectScreenshots(task, p, [check], dir);
    expect(() =>
      visualChecks(task, p, "snap", shots, { screenshots: [] }),
    ).toThrow("ui_verdict_incomplete");
    const review = {
      taskId: task.id,
      planVersion: 1,
      fingerprint: "snap",
      findings: [],
      criteria: [{ id: "AC-1", passed: true, evidence: "test" }],
      verdict: "pass" as const,
    };
    expect(acceptanceErrors(task, p, [check], review, "snap")).toContain(
      "required_ui:desktop",
    );
    const visual = visualChecks(task, p, "snap", shots, {
      screenshots: [
        { id: "desktop", passed: false, evidence: "Layout is wrong" },
      ],
    });
    expect(
      acceptanceErrors(task, p, [check, ...visual], review, "snap"),
    ).toContain("required_ui:desktop");
    visual[0].status = "passed";
    expect(
      acceptanceErrors(task, p, [check, ...visual], review, "snap"),
    ).toEqual([]);
    visual[0].fingerprint = "old";
    expect(
      acceptanceErrors(task, p, [check, ...visual], review, "snap"),
    ).toContain("required_ui:desktop");
  } finally {
    await f.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
