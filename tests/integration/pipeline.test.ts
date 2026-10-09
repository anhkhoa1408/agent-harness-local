import { test, expect, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTempRepo } from "../support/temp-repo";
import { taskFixture, planFixture } from "../support/task-fixture";
import { openStore } from "../../src/infrastructure/persistence/store";
import { inspectRepository } from "../../src/infrastructure/repositories/inspect";
import { createHandlers } from "../../src/bootstrap/stages";
import { runWorker } from "../../src/bootstrap/worker";
import type {
  AgentClient,
  AgentInput,
} from "../../src/infrastructure/codex/client";
test.each(["manual", "auto"] as const)(
  "%s mode: feedback, approved isolated implementation, real failure/repair and independent review",
  async (executionMode) => {
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
    let running: Promise<void> | undefined;
    try {
      const repo = await inspectRepository(f.root, "main", null);
      store.putRecord("repository", repo.id, repo);
      const task = store.createTask({
        ...taskFixture(),
        executionMode,
        repositoryId: repo.id,
        sourceCommit: repo.head,
      });
      const fake: AgentClient = {
        listModels: async () => [
          { id: "strong", efforts: ["high"], isDefault: false },
          { id: "medium", efforts: ["medium"], isDefault: false },
          { id: "gpt-6-luna", efforts: ["medium"], isDefault: false },
        ],
        respondToApproval: vi.fn(async () => {}),
        interruptTurn: async () => {},
        runDirectTurn: async () => {
          throw new Error("fixture_direct_turn_unavailable");
        },
        close: async () => {},
        runDelegatedStage: async (input, onEvent) => {
          calls.push(input);
          const stage = /stage: (\w+)/.exec(input.instructions)![1];
          const parentId = input.threadId ?? "parent-pipeline";
          onEvent({ type: "parent", data: { threadId: parentId } });
          onEvent({
            type: "child",
            data: {
              threadId: `child-${calls.length}`,
              parentThreadId: parentId,
              model: input.model,
            },
          });
          onEvent({
            type: "started",
            data: { threadId: parentId, turnId: `turn-${calls.length}` },
          });
          if (stage === "discover" && executionMode === "auto") {
            onEvent({
              type: "approval",
              data: {
                requestId: "discovery-approval",
                method: "item/commandExecution/requestApproval",
                params: {},
              },
            });
          }
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
          else if (stage === "plan") {
            expect(input.outputSchema.required).toEqual(
              Object.keys(input.outputSchema.properties as object),
            );
            const packet = JSON.parse(
              await readFile(input.delegation!.packetPath, "utf8"),
            );
            expect(packet.outputSchema.properties.result).toEqual(
              input.outputSchema,
            );
            const context = JSON.parse(input.prompt);
            if (context.version === 2) {
              expect(context.previousPlan.version).toBe(1);
              expect(context.feedback).toMatchObject([
                { text: "Reuse existing module", target: "step:one" },
              ]);
            }
            result = planFixture({
              uiVerification: null,
              version: context.version,
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
            result = { ...(result as object), stories: null };
          } else if (stage === "implement" || stage === "repair") {
            if (executionMode === "auto") {
              onEvent({
                type: "approval",
                data: {
                  requestId: 123,
                  method: "item/commandExecution/requestApproval",
                  params: {},
                },
              });
              expect(fake.respondToApproval).toHaveBeenCalledWith(123, {
                decision: "decline",
              });
              expect(store.listRecords("approval")).toHaveLength(0);
            }
            await writeFile(
              join(input.cwd, "app.cjs"),
              `module.exports=${stage === "implement" ? 1 : 2}`,
            );
            result = { summary: stage, needsReplan: false, reason: null };
          } else {
            const context = JSON.parse(input.prompt);
            result = {
              taskId: task.id,
              planVersion: context.plan.version,
              fingerprint: context.fingerprint,
              findings: [],
              criteria: [
                { id: "AC-1", passed: true, evidence: "feature-unit passed" },
              ],
              verdict: "pass",
            };
          }
          return {
            threadId: parentId,
            turnId: "turn",
            child: {
              threadId: `child-${calls.length}`,
              turnId: "child-turn",
              model: input.model,
              usage: null,
            },
            result,
            usage: null,
          };
        },
      };
      running = runWorker(
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
      if (executionMode === "auto") {
        expect(fake.respondToApproval).toHaveBeenCalledWith(
          "discovery-approval",
          {
            decision: "decline",
          },
        );
        expect(
          store
            .events(task.id, 0)
            .some((e) => e.type === "approval.auto_declined"),
        ).toBe(true);
      }
      store.enqueue({
        id: "comment",
        taskId: task.id,
        kind: "comment",
        expectedRevision: store.getTask(task.id).revision,
        payload: {
          version: 1,
          target: "step:one",
          text: "Reuse existing module",
        },
      });
      await wait(() =>
        store.events(task.id, 0).some((e) => e.type === "plan.commented"),
      );
      store.enqueue({
        id: "reject-approval",
        taskId: task.id,
        kind: "approve",
        expectedRevision: store.getTask(task.id).revision,
        payload: { version: 1 },
      });
      await wait(() =>
        store.events(task.id, 0).some((e) => e.type === "command.rejected"),
      );
      expect(store.getTask(task.id).approvedPlanVersion).toBeNull();
      store.enqueue({
        id: "revise",
        taskId: task.id,
        kind: "revise",
        expectedRevision: store.getTask(task.id).revision,
        payload: { version: 1 },
      });
      await wait(() => store.getTask(task.id).planVersion === 2);
      expect(store.getTask(task.id).status).toBe("waiting_approval");
      expect(calls.some((c) => c.write)).toBe(false);

      const frozen = store.getRecord(
        "bundle",
        `${task.id}:implement`,
      ) as import("../../src/infrastructure/context/skills").Bundle;
      const optional = frozen.optionalFiles![0];
      // An approved E2E check enables the already-frozen profile, without reloading upstream.
      const savedPlan = store.getRecord(
        "plan",
        `${task.id}:2`,
      ) as import("../../src/domain/contracts").Plan;
      savedPlan.checks[0].kind = "e2e";
      store.putRecord("plan", `${task.id}:2`, savedPlan);
      const waiting = store.getTask(task.id);
      store.enqueue({
        id: "approve",
        taskId: task.id,
        kind: "approve",
        expectedRevision: waiting.revision,
        payload: { version: 2 },
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
        expect(call.executionMode).toBe(executionMode);
        const isPlan = call.instructions.includes("stage: plan");
        expect(call.model.effort).toBe(isPlan ? "high" : "medium");
      }
      const implementation = calls.find((c) =>
        c.instructions.includes("stage: implement"),
      )!;
      expect(
        calls.every(
          (c) =>
            c.delegation?.stage &&
            c.delegation.attemptId &&
            c.delegation.packetPath,
        ),
      ).toBe(true);
      expect(new Set(calls.map((c) => c.delegation!.attemptId)).size).toBe(
        calls.length,
      );
      expect(store.getRecord("parent", task.id)).toMatchObject({
        threadId: expect.any(String),
      });
      expect(JSON.parse(implementation.prompt).task).not.toHaveProperty(
        "models",
      );
      expect(JSON.parse(implementation.prompt).task).not.toHaveProperty(
        "executionMode",
      );
      expect(JSON.parse(implementation.prompt).task).not.toHaveProperty(
        "branch",
      );
      const packet = JSON.parse(
        await readFile(implementation.delegation!.packetPath, "utf8"),
      );
      expect(packet.input.task).toEqual(JSON.parse(implementation.prompt).task);
      expect(packet.outputSchema.properties.attemptId.const).toBe(
        implementation.delegation!.attemptId,
      );
      const aiAttempts = (
        store.listRecords(
          "attempt",
        ) as (import("../../src/application/pipeline-contracts").Attempt & {
          child: { threadId: string };
        })[]
      ).filter((a) =>
        [
          "discover",
          "analyze",
          "plan",
          "implement",
          "repair",
          "review",
        ].includes(a.stage),
      );
      expect(
        aiAttempts.every(
          (a) =>
            a.threadId === "parent-pipeline" &&
            a.child?.threadId &&
            a.bundleHash,
        ),
      ).toBe(true);
      expect(new Set(aiAttempts.map((a) => a.child.threadId)).size).toBe(
        aiAttempts.length,
      );
      expect(implementation.instructions).toContain(
        "SOURCE agent:ecc/tdd-guide",
      );
      expect(implementation.instructions).toContain(optional.content);
      expect(
        calls.find((c) => c.instructions.includes("stage: repair"))!
          .instructions,
      ).toContain("SOURCE agent:voltagent/debugger");
      expect(
        calls.find((c) => c.instructions.includes("stage: review"))!
          .instructions,
      ).toContain("SOURCE agent:ecc/code-reviewer");
      const worktree = store.getTask(task.id).worktree;
      for (const call of calls.filter((c) => c.write))
        expect(call.cwd).toBe(worktree);
      expect(
        calls.find((c) => c.instructions.includes("stage: review")),
      ).toMatchObject({ write: false });
      expect(
        calls.find((c) => c.instructions.includes("stage: review"))?.threadId,
      ).toBe("parent-pipeline");
      expect(store.getRecord("checks", task.id)).toMatchObject([
        { id: "feature-unit", status: "passed" },
      ]);
    } finally {
      stop.abort();
      store.close();
      await f.dispose();
      await rm(dir, { recursive: true, force: true });
    }
  },
  15000,
);
