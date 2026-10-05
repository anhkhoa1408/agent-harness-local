import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentClient } from "../../src/codex/client";
import { planFixture } from "./task-fixture";
export function createFixtureAgent(): AgentClient {
  return {
    models: async () => [
      { id: "fixture-strong", efforts: ["high"], isDefault: false },
      { id: "fixture-medium", efforts: ["medium"], isDefault: false },
      { id: "gpt-6-luna", efforts: ["medium"], isDefault: false },
    ],
    answer: async () => {},
    interrupt: async () => {},
    close: async () => {},
    async run(input, onEvent, signal) {
      const stage = /stage: (\w+)/.exec(input.instructions)![1],
        threadId = input.threadId ?? randomUUID(),
        child = { threadId: randomUUID(), turnId: "child-turn", model: input.model, usage: null };
      signal.throwIfAborted();
      onEvent({ type: "parent", data: { threadId } });
      onEvent({ type: "child", data: { ...child, parentThreadId: threadId } });
      onEvent({ type: "started", data: { threadId, turnId: "one" } });
      let result: unknown;
      if (stage === "discover") {
        result = {
          repositoryId: /repositoryId=([^;]+)/.exec(input.prompt)![1],
          sourceCommit: /sourceCommit=([a-f0-9]+)/.exec(input.prompt)![1],
          languages: ["JavaScript"],
          areas: [],
          commands: [],
          prerequisites: [],
          evidence: [],
          unknowns: [],
        };
      } else {
        const context = JSON.parse(input.prompt),
          task = context.task;
        if (stage === "analyze")
          result = {
            requirement: task.requirement,
            questions:
              task.requirement.includes("question") &&
              !task.requirement.includes("User clarification:")
                ? [
                    {
                      id: "q1",
                      question: "Giá trị mặc định là gì?",
                      recommendation: "Dùng giá trị 2.",
                    },
                  ]
                : [],
          };
        else if (stage === "plan") {
          const python = task.requirement.includes("python");
          result = planFixture({
            taskId: task.id,
            version: context.version,
            sourceCommit: task.sourceCommit,
            scope: task.title,
            steps: [
              {
                ...planFixture().steps[0],
                files: [python ? "app.py" : "app.cjs"],
              },
            ],
            checks: [
              {
                ...planFixture().checks[0],
                executable: python ? "python3" : process.execPath,
                args: python
                  ? ["feature_test.py"]
                  : [
                      "--test",
                      "--test-reporter=tap",
                      task.requirement.includes("skip")
                        ? "skip.test.cjs"
                        : "feature.test.cjs",
                    ],
                timeoutMs: 3000,
              },
            ],
          });
        } else if (stage === "implement" || stage === "repair") {
          if (task.requirement.includes("quota") && stage === "implement")
            throw new Error("quota_exceeded");
          if (task.requirement.includes("replan") && task.planVersion === 1)
            return {
              threadId,
              child,
              turnId: "one",
              result: {
                summary: "Need revised plan",
                needsReplan: true,
                reason: "fixture_scope_change",
              },
              usage: null,
            };
          if (task.requirement.includes("slow"))
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, 2000);
              signal.addEventListener(
                "abort",
                () => {
                  clearTimeout(timer);
                  reject(new Error("interrupted"));
                },
                { once: true },
              );
            });
          const value =
            task.requirement.includes("repair") && stage === "implement"
              ? 1
              : 2;
          await writeFile(
            join(
              input.cwd,
              task.requirement.includes("python") ? "app.py" : "app.cjs",
            ),
            task.requirement.includes("python")
              ? `value=${value}\n`
              : `module.exports=${value}\n`,
          );
          result = {
            summary: "Fixture feature",
            needsReplan: false,
            reason: null,
          };
        } else
          result = {
            taskId: task.id,
            planVersion: task.planVersion,
            fingerprint: context.fingerprint,
            findings: [],
            criteria: [
              {
                id: "AC-1",
                passed: true,
                evidence: "feature-unit passed with real runner",
              },
            ],
            verdict: "pass",
          };
      }
      return { threadId, turnId: "one", result, usage: null, child };
    },
  };
}
