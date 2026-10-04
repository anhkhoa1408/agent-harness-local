import { test, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
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
    const repo = await inspectRepository(f.root, "main", null);
    store.putRecord("repository", repo.id, repo);
    const task = store.createTask({
      ...taskFixture(),
      repositoryId: repo.id,
      sourceCommit: repo.head,
    });
    const fake: AgentClient = {
      models: async () => [
        { id: "strong", efforts: ["high"], isDefault: false },
        { id: "medium", efforts: ["medium"], isDefault: false },
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
    const frozen = store.getRecord("bundle", `${task.id}:implement`) as any;
    const optional = frozen.optionalFiles[0];
    // An approved E2E check enables the already-frozen profile, without reloading upstream.
    const savedPlan = store.getRecord("plan", `${task.id}:1`) as any;
    savedPlan.checks[0].kind = "e2e";
    store.putRecord("plan", `${task.id}:1`, savedPlan);
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
    expect(calls.find((c) => c.write)?.model).toEqual({
      model: "medium",
      effort: "medium",
    });
    for (const call of calls) {
      const isPlan = call.instructions.includes("stage: plan");
      expect(call.model.effort).toBe(isPlan ? "high" : "medium");
    }
    const implementation = calls.find((c) =>
      c.instructions.includes("stage: implement"),
    )!;
    expect(implementation.instructions).toContain("SOURCE agent:ecc/tdd-guide");
    expect(implementation.instructions).toContain(optional.content);
    expect(
      calls.find((c) => c.instructions.includes("stage: repair"))!.instructions,
    ).toContain("SOURCE agent:voltagent/debugger");
    expect(
      calls.find((c) => c.instructions.includes("stage: review"))!.instructions,
    ).toContain("SOURCE agent:ecc/code-reviewer");
    const worktree = store.getTask(task.id).worktree;
    for (const call of calls.filter((c) => c.write))
      expect(call.cwd).toBe(worktree);
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
