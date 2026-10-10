import { test, expect, vi } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTempRepo } from "../support/temp-repo";
import { taskFixture, planFixture } from "../support/task-fixture";
import { aiStages, type Plan } from "../../src/domain/contracts";
import { openStore } from "../../src/infrastructure/persistence/store";
import { createHandlers } from "../../src/bootstrap/stages";
import { failureEvidence } from "../../src/infrastructure/execution/failure-evidence";
import type { CheckResult } from "../../src/domain/evidence";
import {
  gitText,
  inspectRepository,
} from "../../src/infrastructure/repositories/inspect";
import type {
  AgentClient,
  AgentInput,
} from "../../src/infrastructure/codex/client";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=";
async function fixture(ui = false, pass = true) {
  const f = await createTempRepo({ "app.js": "source" });
  const dir = await mkdtemp(join(tmpdir(), "stage-gates-"));
  const store = openStore(join(dir, "db"));
  const repo = await inspectRepository(f.root, "main", null);
  store.putRecord("repository", repo.id, repo);
  const initial = store.createTask({
    ...taskFixture(),
    repositoryId: repo.id,
    sourceCommit: repo.head,
  });
  const task = store.updateTask(
    initial.id,
    initial.revision,
    {
      worktree: f.root,
      planVersion: 1,
      approvedPlanVersion: 1,
      stage: "verify",
      status: "running",
    },
    { type: "fixture", data: {} },
  );
  await mkdir(join(f.root, "evidence"));
  const plan = planFixture({
    taskId: task.id,
    sourceCommit: repo.head,
    checks: [
      {
        ...planFixture().checks[0],
        kind: "e2e",
        executable: process.execPath,
        args: [
          "-e",
          `${ui ? `require('fs').writeFileSync('evidence/ui.png',Buffer.from('${png}','base64'));` : ""}console.log('TAP version 13\\n1..1\\n${pass ? "ok" : "not ok"} 1 - UI')`,
        ],
      },
    ],
    ...(ui
      ? {
          uiVerification: {
            screenshots: [
              {
                id: "desktop",
                checkId: "feature-unit",
                path: "evidence/ui.png",
                criterionIds: ["AC-1"],
                viewport: { width: 1, height: 1 },
                referencePath: null,
              },
            ],
          },
        }
      : {}),
  });
  store.putRecord("plan", `${task.id}:1`, plan);
  for (const stage of aiStages)
    store.putRecord("bundle", `${task.id}:${stage}`, {
      stage,
      files: [],
      hash: "frozen",
      adaptations: "",
    });
  const calls: AgentInput[] = [];
  let visualPass = true;
  const fake: AgentClient = {
    listModels: async () => [
      { id: "medium", efforts: ["medium"], isDefault: false },
      { id: "gpt-6-luna", efforts: ["medium"], isDefault: false },
    ],
    respondToApproval: vi.fn(async () => {}),
    interruptTurn: async () => {},
    runDirectTurn: async () => {
      throw new Error("fixture_direct_turn_unavailable");
    },
    close: async () => {},
    runDelegatedStage: async (input) => {
      calls.push(input);
      let result: unknown;
      if (input.delegation?.stage === "prepare") {
        const context = JSON.parse(input.prompt);
        for (const file of context.conflicts)
          await writeFile(join(input.cwd, file), "remote and feature\n");
        result = { summary: "resolved", needsReplan: false, reason: null };
      } else
        result = {
          screenshots: [
            {
              id: "desktop",
              passed: visualPass,
              evidence: visualPass ? "Expected layout" : "Wrong layout",
            },
          ],
        };
      return {
        threadId: "parent",
        turnId: "turn",
        usage: null,
        result,
        child: {
          threadId: "child",
          turnId: "child-turn",
          model: input.model,
          usage: null,
        },
      };
    },
  };
  return {
    f,
    dir,
    store,
    repo,
    task,
    plan,
    calls,
    handlers: createHandlers(store, fake, dir),
    failVisual: () => {
      visualPass = false;
    },
    dispose: async () => {
      store.close();
      await f.dispose();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("verify without selected UI screenshots stays runner-only", async () => {
  const f = await fixture();
  try {
    expect(
      await f.handlers.verify(f.task, new AbortController().signal),
    ).toMatchObject({ stage: "review", status: "queued" });
    expect(f.calls).toHaveLength(0);
  } finally {
    await f.dispose();
  }
});

test.each(["missing", "malformed"])(
  "a failed test command with %s JUnit goes to repair and preserves stderr",
  async (report) => {
    const f = await fixture();
    try {
      f.store.putRecord("plan", `${f.task.id}:1`, {
        ...f.plan,
        checks: [
          {
            ...f.plan.checks[0],
            reportPath: "evidence/junit.xml",
            reportFormat: "junit",
            args: [
              "-e",
              `${report === "malformed" ? "require('fs').writeFileSync('evidence/junit.xml','<broken>');" : ""}console.error('Cannot find module: approved test runner');process.exit(1)`,
            ],
          },
        ],
      });
      expect(
        await f.handlers.verify(f.task, new AbortController().signal),
      ).toMatchObject({ stage: "repair", status: "queued" });
      const checks = f.store.getRecord("checks", f.task.id) as CheckResult[];
      expect(checks[0]).toMatchObject({ status: "failed", exitCode: 1 });
      const evidence = await failureEvidence(checks);
      expect(evidence.checks[0].stderrExcerpt).toContain(
        "Cannot find module: approved test runner",
      );
    } finally {
      await f.dispose();
    }
  },
);

test("a successful command without required JUnit stays blocked", async () => {
  const f = await fixture();
  try {
    f.store.putRecord("plan", `${f.task.id}:1`, {
      ...f.plan,
      checks: [
        {
          ...f.plan.checks[0],
          reportPath: "evidence/junit.xml",
          reportFormat: "junit",
        },
      ],
    });
    expect(
      await f.handlers.verify(f.task, new AbortController().signal),
    ).toMatchObject({ stage: "verify", status: "blocked" });
  } finally {
    await f.dispose();
  }
});

test("an optional blocked check does not prevent a required failed check from being repaired", async () => {
  const f = await fixture(false, false);
  try {
    f.store.putRecord("plan", `${f.task.id}:1`, {
      ...f.plan,
      checks: [
        ...f.plan.checks,
        {
          ...f.plan.checks[0],
          id: "legacy",
          required: false,
          reportPath: "evidence/legacy.xml",
          reportFormat: "junit",
          args: ["-e", "process.exit(0)"],
        },
      ],
    });
    expect(
      await f.handlers.verify(f.task, new AbortController().signal),
    ).toMatchObject({ stage: "repair", status: "queued" });
  } finally {
    await f.dispose();
  }
});

test("UI verify makes one read-only compact image assignment and routes visual failure to repair", async () => {
  const f = await fixture(true);
  try {
    const result = await f.handlers.verify(
      f.task,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ stage: "review" });
    expect(f.store.getRecord("checks", f.task.id)).toMatchObject([
      { id: "feature-unit", status: "passed" },
      { id: "ui:desktop", status: "passed" },
    ]);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].write).toBe(false);
    const packet = JSON.parse(f.calls[0].prompt);
    expect(packet.screenshots[0].actual.path).toContain("/ui/");
    expect(packet).not.toHaveProperty("plan");
    expect(packet).not.toHaveProperty("diff");
    expect(f.calls[0].delegation?.stage).toBe("verify");
    f.failVisual();
    expect(
      await f.handlers.verify(f.task, new AbortController().signal),
    ).toMatchObject({ stage: "repair" });
    expect(
      await f.handlers.verify(
        { ...f.task, repairCount: 8 },
        new AbortController().signal,
      ),
    ).toMatchObject({
      stage: "repair",
      status: "queued",
      reason: null,
    });
  } finally {
    await f.dispose();
  }
});

test("E2E failure avoids image AI and missing screenshot blocks handoff", async () => {
  const f = await fixture(true, false);
  try {
    expect(
      await f.handlers.verify(
        { ...f.task, repairCount: 3 },
        new AbortController().signal,
      ),
    ).toMatchObject({ stage: "repair" });
    expect(f.calls).toHaveLength(0);
    const missing: Plan = {
      ...f.plan,
      checks: [
        {
          ...f.plan.checks[0],
          args: ["-e", "console.log('TAP version 13\\n1..1\\nok 1 - UI')"],
        },
      ],
    };
    f.store.putRecord("plan", `${f.task.id}:1`, missing);
    expect(
      await f.handlers.verify(f.task, new AbortController().signal),
    ).toMatchObject({ stage: "verify", status: "blocked" });
    expect(f.calls).toHaveLength(0);
  } finally {
    await f.dispose();
  }
});

test("prepare synchronizes origin, invalidates old plan and retries with the same worktree after new approval", async () => {
  const f = await fixture();
  const origin = await createTempRepo({ "app.js": "source" });
  try {
    // Use the source repository as the local origin so histories match exactly.
    await gitText(f.f.root, ["remote", "add", "origin", origin.root]);
    await gitText(origin.root, ["fetch", f.f.root, "main"]);
    await gitText(origin.root, ["reset", "--hard", "FETCH_HEAD"]);
    await writeFile(join(origin.root, "app.js"), "new base");
    await gitText(origin.root, ["commit", "-am", "remote update"]);
    f.store.putRecord("repository", f.repo.id, { ...f.repo, remote: "origin" });
    const task = { ...f.task, worktree: null, stage: "prepare" as const };
    const result = await f.handlers.prepare(task, new AbortController().signal);
    expect(result).toMatchObject({ stage: "discover", status: "queued" });
    const updated = f.store.getTask(task.id);
    expect(updated.approvedPlanVersion).toBeNull();
    expect(updated.sourceCommit).toBe(
      await gitText(origin.root, ["rev-parse", "HEAD"]),
    );
    expect(updated.worktree).toContain("/worktrees/");
    expect(f.calls).toHaveLength(0);
    const approved = {
      ...updated,
      approvedPlanVersion: 2,
      planVersion: 2,
      status: "running" as const,
      stage: "prepare" as const,
    };
    f.store.putRecord("plan", `${task.id}:2`, {
      ...f.plan,
      version: 2,
      sourceCommit: updated.sourceCommit,
    });
    expect(
      await f.handlers.prepare(approved, new AbortController().signal),
    ).toMatchObject({ stage: "implement", output: { path: updated.worktree } });
  } finally {
    await origin.dispose();
    await f.dispose();
  }
});

test("delivery excludes generated screenshots from source diff but rechecks frozen image hashes", async () => {
  const f = await fixture(true);
  try {
    await f.handlers.verify(f.task, new AbortController().signal);
    const checks = f.store.getRecord(
      "checks",
      f.task.id,
    ) as import("../../src/domain/evidence").CheckResult[];
    f.store.putRecord("review", f.task.id, {
      taskId: f.task.id,
      fingerprint: checks[0].fingerprint,
      planVersion: 1,
      findings: [],
      criteria: [{ id: "AC-1", passed: true, evidence: "UI and E2E passed" }],
      verdict: "pass",
    });
    const task = { ...f.task, branch: "main" };
    expect(
      await f.handlers.deliver(task, new AbortController().signal),
    ).toMatchObject({ status: "completed" });
    await writeFile(checks[1].evidencePath, "tampered");
    await expect(
      f.handlers.deliver(task, new AbortController().signal),
    ).rejects.toThrow("ui_evidence_changed");
  } finally {
    await f.dispose();
  }
});

test("prepare dispatches conflict resolution with repair model under prepare attempt, without spending repair rounds", async () => {
  const f = await fixture();
  const origin = await createTempRepo({ "app.js": "source" });
  try {
    await gitText(f.f.root, ["remote", "add", "origin", origin.root]);
    await gitText(origin.root, ["fetch", f.f.root, "main"]);
    await gitText(origin.root, ["reset", "--hard", "FETCH_HEAD"]);
    await writeFile(join(f.f.root, "app.js"), "source feature\n");
    await gitText(f.f.root, ["commit", "-am", "source feature"]);
    const sourceCommit = await gitText(f.f.root, ["rev-parse", "HEAD"]);
    await writeFile(join(origin.root, "app.js"), "remote\n");
    await gitText(origin.root, ["commit", "-am", "remote"]);
    f.store.putRecord("repository", f.repo.id, { ...f.repo, remote: "origin" });
    f.store.putRecord("plan", `${f.task.id}:1`, { ...f.plan, sourceCommit });
    const task = f.store.updateTask(
      f.task.id,
      f.task.revision,
      { sourceCommit, worktree: null, stage: "prepare" },
      { type: "fixture", data: {} },
    );
    expect(
      await f.handlers.prepare(task, new AbortController().signal),
    ).toMatchObject({ stage: "discover" });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({
      write: true,
      delegation: { stage: "prepare" },
      model: { model: "medium", effort: "medium" },
    });
    expect(JSON.parse(f.calls[0].prompt).conflicts).toEqual(["app.js"]);
    expect(JSON.parse(f.calls[0].prompt)).not.toHaveProperty("plan");
    expect(f.store.getTask(f.task.id).repairCount).toBe(0);
  } finally {
    await origin.dispose();
    await f.dispose();
  }
});
