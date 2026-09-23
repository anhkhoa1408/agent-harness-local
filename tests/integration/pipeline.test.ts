import { test, expect } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createTempRepo } from "../support/temp-repo";
import { taskFixture, planFixture } from "../support/task-fixture";
import { openStore } from "../../src/storage/store";
import { inspectRepository } from "../../src/repositories/inspect";
import { createHandlers } from "../../src/worker/stages";
import { runWorker } from "../../src/worker/engine";
import type { AgentClient, AgentInput } from "../../src/codex/client";
test("strong planning, approved isolated implementation, real failure/repair and independent review", async () => {
  const f = await createTempRepo({
      "app.cjs": "module.exports=0",
      "feature.test.cjs":
        "const {test}=require('node:test');const assert=require('node:assert/strict');test('feature',()=>assert.equal(require('./app.cjs'),2));",
      "legacy.test.cjs": "throw Error('legacy')",
    }),
    dir = await mkdtemp(join(tmpdir(), "pipeline")),
    store = openStore(join(dir, "db"));
  const stop = new AbortController(),
    calls: AgentInput[] = [];
  try {
    const files = [
      "superpowers/writing-plans/SKILL.md",
      "superpowers/test-driven-development/SKILL.md",
      "superpowers/test-driven-development/writing-good-tests.md",
      "superpowers/requesting-code-review/SKILL.md",
      "superpowers/requesting-code-review/code-reviewer.md",
      "superpowers/receiving-code-review/SKILL.md",
      "superpowers/systematic-debugging/SKILL.md",
      "superpowers/systematic-debugging/root-cause-tracing.md",
      "superpowers/verification-before-completion/SKILL.md",
      "mattpocock-skills/grilling/SKILL.md",
    ];
    for (const file of files) {
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), "Fixture skill");
    }
    await writeFile(join(dir, "baseline"), "Baseline");
    const repo = await inspectRepository(f.root, "main", null);
    store.putRecord("repository", repo.id, repo);
    store.putRecord("settings", "current", {
      skillRoots: {
        superpowers: join(dir, "superpowers"),
        "mattpocock-skills": join(dir, "mattpocock-skills"),
        baseline: join(dir, "baseline"),
      },
    });
    const task = store.createTask({
      ...taskFixture(),
      repositoryId: repo.id,
      sourceCommit: repo.head,
    });
    const fake: AgentClient = {
      models: async () => [
        { id: "strong", efforts: ["high"], isDefault: false },
        { id: "medium", efforts: ["high"], isDefault: false },
      ],
      answer: async () => {},
      interrupt: async () => {},
      close: async () => {},
      run: async (input, onEvent) => {
        calls.push(input);
        const stage = /stage: (\w+)/.exec(input.instructions)![1];
        onEvent({
          type: "started",
          data: { threadId: `thread-${calls.length}`, turnId: "turn" },
        });
        let result: unknown;
        if (stage === "discover")
          result = {
            repositoryId: repo.id,
            sourceCommit: repo.head,
            languages: ["JavaScript"],
            areas: [],
            commands: [],
            prerequisites: [],
            evidence: [{ path: "app.cjs", reason: "source" }],
            unknowns: [],
          };
        else if (stage === "analyze")
          result = { requirement: task.requirement, questions: [] };
        else if (stage === "plan")
          result = planFixture({
            taskId: task.id,
            sourceCommit: repo.head,
            steps: [{ ...planFixture().steps[0], files: ["app.cjs"] }],
            checks: [
              {
                ...planFixture().checks[0],
                executable: process.execPath,
                args: ["--test", "--test-reporter=tap", "feature.test.cjs"],
              },
            ],
          });
        else if (stage === "implement" || stage === "repair") {
          await writeFile(
            join(input.cwd, "app.cjs"),
            `module.exports=${stage === "implement" ? 1 : 2}`,
          );
          result = { summary: stage, needsReplan: false, reason: null };
        } else {
          const context = JSON.parse(input.prompt);
          result = {
            taskId: task.id,
            planVersion: 1,
            fingerprint: context.fingerprint,
            findings: [],
            criteria: [
              { id: "AC-1", passed: true, evidence: "feature-unit passed" },
            ],
            verdict: "pass",
          };
        }
        return {
          threadId: `thread-${calls.length}`,
          turnId: "turn",
          result,
          usage: null,
        };
      },
    };
    const running = runWorker(
      store,
      (s) => createHandlers(s, fake, dir),
      stop.signal,
    );
    const wait = async (predicate: () => boolean) => {
      for (let i = 0; i < 200 && !predicate(); i++)
        await new Promise((r) => setTimeout(r, 20));
      expect(predicate()).toBe(true);
    };
    await wait(() => store.getTask(task.id).status === "waiting_approval");
    expect(calls.some((c) => c.write)).toBe(false);
    const waiting = store.getTask(task.id);
    store.enqueue({
      id: "approve",
      taskId: task.id,
      kind: "approve",
      expectedRevision: waiting.revision,
      payload: { version: 1 },
    });
    await wait(() => store.getTask(task.id).stage === "deliver");
    stop.abort();
    await running;
    expect(store.getTask(task.id).repairCount).toBe(1);
    expect(
      calls.find((c) => c.instructions.includes("stage: plan"))?.model.model,
    ).toBe("strong");
    expect(calls.find((c) => c.write)?.model.model).toBe("medium");
    expect(
      calls.find((c) => c.instructions.includes("stage: review")),
    ).toMatchObject({ write: false });
    expect(
      calls.find((c) => c.instructions.includes("stage: review"))?.threadId,
    ).toBeUndefined();
    expect(store.getRecord("checks", task.id)).toMatchObject([
      { id: "feature-unit", status: "passed" },
    ]);
  } finally {
    stop.abort();
    store.close();
    await f.dispose();
    await rm(dir, { recursive: true, force: true });
  }
}, 15000);
