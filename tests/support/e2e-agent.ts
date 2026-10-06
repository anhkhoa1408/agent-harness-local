import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentClient } from "../../src/codex/client";
import { type Plan } from "../../src/core/contracts";
import { planFixture } from "./task-fixture";
export function createFixtureAgent(): AgentClient {
  const interruptedStories=new Set<string>();
  return {
    listModels: async () => [
      { id: "fixture-strong", efforts: ["high"], isDefault: false },
      { id: "fixture-medium", efforts: ["medium"], isDefault: false },
      { id: "gpt-6-luna", efforts: ["medium"], isDefault: false },
    ],
    respondToApproval: async () => {},
    interruptTurn: async () => {},
    runDirectTurn: async () => { throw new Error("fixture_direct_turn_unavailable"); },
    close: async () => {},
    async runDelegatedStage(input, onEvent, signal) {
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
          if (task.splitIntoStories) {
            const plan=result as Plan;
            plan.criteria.push({id:"AC-2",description:"Second works",checkIds:["second-unit"]});
            plan.steps.push({...plan.steps[0],id:"two",files:["second.cjs"],dependsOn:["one"]});
            plan.checks.push({...plan.checks[0],id:"second-unit",args:["-e","console.log('TAP version 13\\n1..1\\n'+(require('./second.cjs')===3?'ok':'not ok')+' 1 - second')"]});
            plan.stories=[
              {id:"A",title:"First behavior",outcome:"First works",points:2,dependsOn:[],criterionIds:["AC-1"],stepIds:["one"]},
              {id:"B",title:"Second behavior",outcome:"Second works",points:3,dependsOn:["A"],criterionIds:["AC-2"],stepIds:["two"]},
            ];
          }
        } else if (stage === "implement" || stage === "repair") {
          if(task.requirement.includes("story-interrupt")&&task.storyId==="B"&&!interruptedStories.has(task.id)) {interruptedStories.add(task.id);throw new Error("quota_exceeded");}
          if (task.requirement.includes("quota") && stage === "implement")
            throw new Error("quota_exceeded");
          if (((task.requirement.includes("replan")&&!task.requirement.includes("story-replan")) || (task.requirement.includes("story-replan")&&task.storyId==="B")) && task.planVersion === 1)
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
          if (context.plan.steps.some((s: any)=>s.files.includes("second.cjs"))) await writeFile(join(input.cwd,"second.cjs"),"module.exports=3\n");
          if (context.plan.steps.some((s: any)=>s.files.includes("app.cjs")||s.files.includes("app.py"))) {
          await writeFile(
            join(
              input.cwd,
              task.requirement.includes("python") ? "app.py" : "app.cjs",
            ),
            task.requirement.includes("python")
              ? `value=${value}\n`
              : `module.exports=${value}\n`,
          );
          }
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
            criteria: context.plan.criteria.map((c: any)=>({id:c.id,passed:true,evidence:"feature checks passed with real runner"})),
            verdict: "pass",
          };
      }
      return { threadId, turnId: "one", result, usage: null, child };
    },
  };
}
