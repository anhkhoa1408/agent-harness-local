import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { connectCodex } from "../src/infrastructure/codex/client";
import type {
  DelegatedStageInput,
  AgentEvent,
} from "../src/infrastructure/codex/types";
import { stageEnvelope } from "../src/application/agent-execution";
import { PARENT_AGENT_MODEL } from "../src/infrastructure/codex/limits";
const root = await mkdtemp(join(tmpdir(), "harness-refactor-native-"));
const value = randomUUID();
await writeFile(join(root, "input.txt"), value);
const git = promisify(execFile);
await git("git", ["-C", root, "init", "-b", "main"]);
await git("git", ["-C", root, "add", "input.txt"]);
await git("git", [
  "-C",
  root,
  "-c",
  "user.name=Harness Smoke",
  "-c",
  "user.email=smoke@example.test",
  "commit",
  "-m",
  "smoke baseline",
]);
const client = await connectCodex();
const children: string[] = [];
let parentId: string | undefined;
const summaries: object[] = [];
async function runStage(
  stage: DelegatedStageInput["delegation"]["stage"],
  write: boolean,
  instructions: string,
  abortOnChild = false,
) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 90_000);
  const input: DelegatedStageInput = {
    cwd: root,
    model: PARENT_AGENT_MODEL,
    write,
    executionMode: "auto",
    threadId: parentId,
    instructions: `Working directory: ${root}. ${instructions}`,
    prompt: instructions,
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["value"],
      properties: { value: { type: "string" } },
    },
    delegation: {
      stage,
      attemptId: randomUUID(),
      packetPath: join(root, `${stage}-${randomUUID()}.json`),
    },
  };
  await writeFile(
    input.delegation.packetPath,
    JSON.stringify({
      instructions: input.instructions,
      input: { instructions: input.instructions },
      outputSchema: stageEnvelope(input),
    }),
    { mode: 0o600 },
  );
  const onEvent = (event: AgentEvent) => {
    if (event.type === "parent") parentId = event.data.threadId;
    if (event.type === "child") {
      children.push(event.data.threadId);
      if (abortOnChild) controller.abort();
    }
  };
  try {
    const run = await client.runDelegatedStage(
      input,
      onEvent,
      controller.signal,
    );
    assert.equal(run.threadId, parentId);
    assert.ok(run.child);
    assert.equal((run.result as { value: string }).value, value);
    console.log(JSON.stringify({ event: "stage.passed", stage }));
    summaries.push({
      stage,
      parent: run.threadId,
      child: run.child.threadId,
      permissions: write ? "workspace-write" : "read-only",
      status: "passed",
    });
    return run;
  } finally {
    clearTimeout(deadline);
  }
}
try {
  assert.ok(
    (await client.listModels()).some(
      (m) =>
        m.id === PARENT_AGENT_MODEL.model &&
        m.efforts.includes(PARENT_AGENT_MODEL.effort),
    ),
  );
  await runStage(
    "analyze",
    false,
    "Read input.txt using file tools. Use filesystem or shell tools to read the file. Do not write files or delegate. Return its exact content as result.value in the supplied envelope.",
  );
  const originalParent = parentId;
  await runStage(
    "implement",
    true,
    "Read input.txt and create copied.txt with exactly its content. Use filesystem or shell tools as needed. Do not change input.txt or delegate. Return that content as result.value in the supplied envelope.",
  );
  assert.equal(await readFile(join(root, "copied.txt"), "utf8"), value);
  await runStage(
    "review",
    false,
    "Read copied.txt. Use filesystem or shell tools to read the file. Do not write files or delegate. Return its exact content as result.value in the supplied envelope.",
  );
  assert.equal(parentId, originalParent);
  assert.equal(new Set(children).size, 3);
  await assert.rejects(
    runStage(
      "analyze",
      false,
      "Read input.txt carefully. Use filesystem or shell tools to read the file. Do not write files or delegate. Return its content in the supplied envelope.",
      true,
    ),
    /interrupted/,
  );
  summaries.push({
    stage: "cancel",
    parent: parentId,
    status: "passed",
    detail: "adapter confirmed parent and discovered children terminal",
  });
  console.log(JSON.stringify({ status: "passed", summaries }, null, 2));
} catch (error) {
  console.log(
    JSON.stringify(
      {
        status: "blocked",
        summaries,
        reason: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await client.close();
  await rm(root, { recursive: true, force: true });
}
