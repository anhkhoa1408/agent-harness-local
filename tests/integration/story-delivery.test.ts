import { StoryService } from "../support/services";

import { gitText as readStoryGit } from "../../src/repositories/inspect";
import { fingerprintWorktree as fingerprintStoryWorktree } from "../../src/repositories/fingerprint";
import { test, expect } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../../src/storage/store";
import { createTempRepo } from "../support/temp-repo";
import { taskFixture } from "../support/task-fixture";
import { storiesPlan } from "../support/story-fixture";
import { createStoryCheckpoint } from "../../src/delivery/checkpoint";
import { createDelivery } from "../../src/delivery/github";
import { fingerprintWorktree } from "../../src/repositories/fingerprint";
import { gitText, inspectRepository } from "../../src/repositories/inspect";
import { createHandlers } from "../../src/worker/stages";
import { aiStages, StorySelectionSchema } from "../../src/core/contracts";
import type { AgentClient } from "../../src/codex/client";
async function fixture() {
  const f = await createTempRepo({
      "app.js": "original",
      "second.js": "original",
    }),
    dir = await mkdtemp(join(tmpdir(), "story-delivery-")),
    store = openStore(join(dir, "db"));
  const repo = await inspectRepository(f.root, "main", null);
  store.putRecord("repository", repo.id, repo);
  const created = store.createTask({
    ...taskFixture(),
    sourceCommit: repo.head,
    repositoryId: repo.id,
    splitIntoStories: true,
  });
  await gitText(f.root, ["checkout", "-b", created.branch]);
  const task = store.updateTask(
    created.id,
    0,
    {
      stage: "deliver",
      status: "running",
      worktree: f.root,
      planVersion: 1,
      approvedPlanVersion: 1,
    },
    { type: "fixture", data: {} },
  );
  const plan = { ...storiesPlan(), taskId: task.id, sourceCommit: repo.head };
  plan.checks = plan.checks.map((c) => ({
    ...c,
    executable: process.execPath,
    args: [
      "-e",
      `const fs=require('fs');console.log('TAP version 13\\n1..1\\n'+(fs.readFileSync('${c.id === "second" ? "second.js" : "app.js"}','utf8')==='feature'?'ok':'not ok')+' 1 - works');`,
    ],
  }));
  store.putRecord("plan", `${task.id}:1`, plan);
  new StoryService(store, {
    readGit: readStoryGit,
    fingerprintWorktree: fingerprintStoryWorktree,
  }).approveStorySelection(
    task,
    StorySelectionSchema.parse({
      planVersion: 1,
      storyIds: ["A", "B"],
      mode: "shared_pr",
    }),
  );
  const fake: AgentClient = {
    listModels: async () => [
      { id: "gpt-6-luna", efforts: ["medium"], isDefault: false },
      { id: "medium", efforts: ["medium"], isDefault: false },
    ],
    respondToApproval: async () => {},
    interruptTurn: async () => {},
    runDirectTurn: async () => {
      throw new Error("fixture_direct_turn_unavailable");
    },
    close: async () => {},
    runDelegatedStage: async (input) => {
      const context = JSON.parse(input.prompt);
      return {
        threadId: "parent",
        turnId: "turn",
        usage: null,
        child: {
          threadId: "child",
          turnId: "turn",
          model: input.model,
          usage: null,
        },
        result: {
          taskId: context.task.id,
          planVersion: context.task.planVersion,
          fingerprint: context.fingerprint,
          findings: [],
          criteria: context.plan.criteria.map(
            (
              c: import("../../src/core/contracts").Plan["criteria"][number],
            ) => ({
              id: c.id,
              passed: true,
              evidence: "runner",
            }),
          ),
          verdict: "pass",
        },
      };
    },
  };
  for (const stage of aiStages)
    store.putRecord("bundle", `${task.id}:${stage}`, {
      stage,
      files: [],
      hash: "frozen",
      adaptations: "",
    });
  async function evidence(t = store.getTask(task.id)) {
    const effective = new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getEffectiveTask(t),
      p = new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecutionPlan(effective),
      fingerprint = await fingerprintWorktree(
        f.root,
        [],
        effective.sourceCommit,
      );
    store.putRecord(
      "checks",
      task.id,
      p.checks.map((c) => ({
        id: c.id,
        taskId: task.id,
        planVersion: 1,
        fingerprint,
        status: "passed",
        executed: 1,
        exitCode: 0,
        evidencePath: "/log",
        reason: null,
      })),
    );
    store.putRecord("review", task.id, {
      taskId: task.id,
      planVersion: 1,
      fingerprint,
      findings: [],
      criteria: p.criteria.map((c) => ({
        id: c.id,
        passed: true,
        evidence: "passed",
      })),
      verdict: "pass",
    });
    new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).recordEvidence(effective);
    return effective;
  }
  return {
    f,
    dir,
    store,
    task,
    plan,
    fake,
    evidence,
    dispose: async () => {
      store.close();
      await f.dispose();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
test("two checkpoint commits on same branch; aggregate verify/review before single delivery", async () => {
  const x = await fixture();
  try {
    await writeFile(join(x.f.root, "app.js"), "feature");
    const a = await createStoryCheckpoint(
      x.store,
      x.dir,
      await x.evidence(),
      new AbortController().signal,
      new StoryService(x.store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getCheckpointContext(await x.evidence()),
    );
    const retry = await createStoryCheckpoint(
      x.store,
      x.dir,
      await x.evidence(),
      new AbortController().signal,
      new StoryService(x.store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getCheckpointContext(await x.evidence()),
    );
    expect(retry.commit).toBe(a.commit);
    expect(await readFile(a.checkpointPath, "utf8")).toContain(
      '"storyId": "A"',
    );
    expect(x.store.getRecord("delivery", x.task.id)).toBeNull();
    const next = new StoryService(x.store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).completeSharedStory(x.task, a);
    expect(next.status).toBe("paused");
    expect(
      new StoryService(x.store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecution(x.task.id)?.activeStoryId,
    ).toBe("B");
    await writeFile(join(x.f.root, "second.js"), "feature");
    const b = await createStoryCheckpoint(
      x.store,
      x.dir,
      await x.evidence(),
      new AbortController().signal,
      new StoryService(x.store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getCheckpointContext(await x.evidence()),
    );
    expect(b.commit).not.toBe(a.commit);
    new StoryService(x.store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).completeSharedStory(x.store.getTask(x.task.id), b);
    expect(
      new StoryService(x.store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecution(x.task.id)?.aggregate,
    ).toBe(true);
    expect(
      new StoryService(x.store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      })
        .listStoryRuns(x.task.id)
        .every((r) => r.state === "completed"),
    ).toBe(true);
    const handlers = createHandlers(x.store, x.fake, x.dir),
      t = x.store.getTask(x.task.id);
    expect((await handlers.verify(t, new AbortController().signal)).stage).toBe(
      "review",
    );
    expect((await handlers.review(t, new AbortController().signal)).stage).toBe(
      "deliver",
    );
    const delivery = await handlers.deliver(t, new AbortController().signal);
    expect(delivery.status).toBe("completed");
    expect(
      await gitText(x.f.root, [
        "rev-list",
        "--count",
        `${x.task.sourceCommit}..HEAD`,
      ]),
    ).toBe("2");
  } finally {
    await x.dispose();
  }
});
test("later story regression fails aggregate checks and blocks final delivery", async () => {
  const x = await fixture();
  try {
    await writeFile(join(x.f.root, "app.js"), "feature");
    new StoryService(x.store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).completeSharedStory(
      x.task,
      await createStoryCheckpoint(
        x.store,
        x.dir,
        await x.evidence(),
        new AbortController().signal,
        new StoryService(x.store, {
          readGit: readStoryGit,
          fingerprintWorktree: fingerprintStoryWorktree,
        }).getCheckpointContext(await x.evidence()),
      ),
    );
    await writeFile(join(x.f.root, "second.js"), "feature");
    new StoryService(x.store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).completeSharedStory(
      x.store.getTask(x.task.id),
      await createStoryCheckpoint(
        x.store,
        x.dir,
        await x.evidence(),
        new AbortController().signal,
        new StoryService(x.store, {
          readGit: readStoryGit,
          fingerprintWorktree: fingerprintStoryWorktree,
        }).getCheckpointContext(await x.evidence()),
      ),
    );
    await writeFile(join(x.f.root, "app.js"), "broken");
    const handlers = createHandlers(x.store, x.fake, x.dir),
      t = x.store.getTask(x.task.id);
    expect((await handlers.verify(t, new AbortController().signal)).stage).toBe(
      "repair",
    );
    await expect(
      handlers.deliver(t, new AbortController().signal),
    ).rejects.toThrow();
    expect(x.store.getRecord("delivery", x.task.id)).toBeNull();
  } finally {
    await x.dispose();
  }
});
test("stale story evidence and unowned changes cannot checkpoint", async () => {
  const x = await fixture();
  try {
    await writeFile(join(x.f.root, "app.js"), "feature");
    const t = await x.evidence();
    x.store.putRecord("story-evidence", t.id, {
      storyId: "B",
      planVersion: 1,
      baselineCommit: t.sourceCommit,
    });
    await expect(
      (async () =>
        createStoryCheckpoint(
          x.store,
          x.dir,
          t,
          new AbortController().signal,
          new StoryService(x.store, {
            readGit: readStoryGit,
            fingerprintWorktree: fingerprintStoryWorktree,
          }).getCheckpointContext(t),
        ))(),
    ).rejects.toThrow("stale_story_evidence");
    new StoryService(x.store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).recordEvidence(t);
    await writeFile(join(x.f.root, "second.js"), "unowned");
    await x.evidence();
    await expect(
      (async () =>
        createStoryCheckpoint(
          x.store,
          x.dir,
          t,
          new AbortController().signal,
          new StoryService(x.store, {
            readGit: readStoryGit,
            fingerprintWorktree: fingerprintStoryWorktree,
          }).getCheckpointContext(t),
        ))(),
    ).rejects.toThrow("scope_changed");
  } finally {
    await x.dispose();
  }
});
test("crash after commit is reconciled without duplicate and each report is retained", async () => {
  const x = await fixture();
  try {
    await writeFile(join(x.f.root, "app.js"), "feature");
    const t = await x.evidence();
    let lost = false;
    const failing = new Proxy(x.store, {
      get(target, key) {
        if (key === "putRecord")
          return (kind: string, id: string, value: unknown) => {
            if (
              kind === "effect" &&
              id.includes(":story:") &&
              (value as { state?: string }).state === "confirmed" &&
              !lost
            ) {
              lost = true;
              throw new Error("crash_after_commit");
            }
            return target.putRecord(kind, id, value);
          };
        return Reflect.get(target, key);
      },
    });
    await expect(
      createStoryCheckpoint(
        failing,
        x.dir,
        t,
        new AbortController().signal,
        new StoryService(failing, {
          readGit: readStoryGit,
          fingerprintWorktree: fingerprintStoryWorktree,
        }).getCheckpointContext(t),
      ),
    ).rejects.toThrow("crash_after_commit");
    const head = await gitText(x.f.root, ["rev-parse", "HEAD"]);
    const a = await createStoryCheckpoint(
      x.store,
      x.dir,
      t,
      new AbortController().signal,
      new StoryService(x.store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getCheckpointContext(t),
    );
    expect(a.commit).toBe(head);
    new StoryService(x.store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).completeSharedStory(x.task, a);
    await writeFile(join(x.f.root, "second.js"), "feature");
    const b = await createStoryCheckpoint(
      x.store,
      x.dir,
      await x.evidence(),
      new AbortController().signal,
      new StoryService(x.store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getCheckpointContext(await x.evidence()),
    );
    expect(
      await gitText(x.f.root, [
        "rev-list",
        "--count",
        `${x.task.sourceCommit}..HEAD`,
      ]),
    ).toBe("2");
    const first = JSON.parse(await readFile(a.checkpointPath, "utf8")),
      second = JSON.parse(await readFile(b.checkpointPath, "utf8"));
    expect(first.reportPath).not.toBe(second.reportPath);
    expect(await readFile(first.reportPath, "utf8")).toContain("First works");
  } finally {
    await x.dispose();
  }
});
test("external HEAD outside checkpoint is rejected even if content fingerprint is unchanged", async () => {
  const x = await fixture();
  try {
    await gitText(x.f.root, ["commit", "--allow-empty", "-m", "external"]);
    await writeFile(join(x.f.root, "app.js"), "feature");
    await expect(
      createStoryCheckpoint(
        x.store,
        x.dir,
        await x.evidence(),
        new AbortController().signal,
        new StoryService(x.store, {
          readGit: readStoryGit,
          fingerprintWorktree: fingerprintStoryWorktree,
        }).getCheckpointContext(await x.evidence()),
      ),
    ).rejects.toThrow("story_head_changed");
  } finally {
    await x.dispose();
  }
});
test("single shared PR after all checkpoints reconciles lost response", async () => {
  const x = await fixture();
  try {
    await writeFile(join(x.f.root, "app.js"), "feature");
    new StoryService(x.store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).completeSharedStory(
      x.task,
      await createStoryCheckpoint(
        x.store,
        x.dir,
        await x.evidence(),
        new AbortController().signal,
        new StoryService(x.store, {
          readGit: readStoryGit,
          fingerprintWorktree: fingerprintStoryWorktree,
        }).getCheckpointContext(await x.evidence()),
      ),
    );
    await writeFile(join(x.f.root, "second.js"), "feature");
    new StoryService(x.store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).completeSharedStory(
      x.store.getTask(x.task.id),
      await createStoryCheckpoint(
        x.store,
        x.dir,
        await x.evidence(),
        new AbortController().signal,
        new StoryService(x.store, {
          readGit: readStoryGit,
          fingerprintWorktree: fingerprintStoryWorktree,
        }).getCheckpointContext(await x.evidence()),
      ),
    );
    const remote = join(x.dir, "remote.git");
    await gitText(x.dir, ["init", "--bare", remote]);
    await gitText(x.f.root, ["remote", "add", "origin", remote]);
    const repo = await inspectRepository(x.f.root, "main", "origin");
    x.store.putRecord("repository", x.task.repositoryId, repo);
    const t = await x.evidence();
    let created = 0,
      pr: null | { url: string; headCommit: string } = null;
    const send = createDelivery(x.store, x.dir, {
      plan: new StoryService(x.store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecutionPlan(t),
      repositoryName: () => "test/repo",
      github: {
        findPullRequest: async () => pr,
        createPullRequest: async () => {
          created++;
          pr = {
            url: "https://github.com/test/repo/pull/1",
            headCommit: await gitText(x.f.root, ["rev-parse", "HEAD"]),
          };
          throw new Error("lost_response");
        },
      },
    });
    await expect(
      send({ ...t, deliveryMode: "github" }, new AbortController().signal),
    ).rejects.toThrow("lost_response");
    const result = await send(
      { ...t, deliveryMode: "github" },
      new AbortController().signal,
    );
    expect(created).toBe(1);
    expect(result.prUrl).toBe("https://github.com/test/repo/pull/1");
    expect(
      await gitText(x.f.root, [
        "rev-list",
        "--count",
        `${x.task.sourceCommit}..HEAD`,
      ]),
    ).toBe("2");
  } finally {
    await x.dispose();
  }
});
test("replanned checkpoint preserves a usable artifact link to its original version", async () => {
  const x = await fixture();
  try {
    await writeFile(join(x.f.root, "app.js"), "feature");
    const checkpoint = await createStoryCheckpoint(
      x.store,
      x.dir,
      await x.evidence(),
      new AbortController().signal,
      new StoryService(x.store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getCheckpointContext(await x.evidence()),
    );
    new StoryService(x.store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).completeSharedStory(x.task, checkpoint);
    const current = x.store.getTask(x.task.id);
    const replanned = x.store.updateTask(
      current.id,
      current.revision,
      {
        planVersion: 2,
        approvedPlanVersion: null,
        stage: "plan",
        status: "waiting_approval",
      },
      { type: "replan", data: {} },
    );
    x.store.putRecord("plan", `${x.task.id}:2`, { ...x.plan, version: 2 });
    new StoryService(x.store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).approveStorySelection(replanned, {
      ...new StoryService(x.store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecution(x.task.id)!.selection,
      planVersion: 2,
    });
    const run = new StoryService(x.store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    })
      .listStoryRuns(x.task.id)
      .find((r) => r.storyId === "A")!;
    expect(
      x.store.getRecord("artifact", run.checkpointArtifactId!),
    ).not.toBeNull();
  } finally {
    await x.dispose();
  }
});
test("next story prepares its own repository instructions without resetting repair count", async () => {
  const f = await createTempRepo({
    "first/app.js": "original",
    "first/AGENTS.md": "First scope instructions",
    "second/app.js": "original",
    "second/AGENTS.md": "Second scope instructions",
  });
  const dir = await mkdtemp(join(tmpdir(), "story-rules-")),
    store = openStore(join(dir, "db"));
  try {
    const repo = await inspectRepository(f.root, "main", null);
    store.putRecord("repository", repo.id, repo);
    const created = store.createTask({
      ...taskFixture(),
      repositoryId: repo.id,
      sourceCommit: repo.head,
      splitIntoStories: true,
    });
    let t = store.updateTask(
      created.id,
      0,
      {
        stage: "prepare",
        status: "running",
        planVersion: 1,
        approvedPlanVersion: 1,
      },
      { type: "fixture", data: {} },
    );
    const plan = { ...storiesPlan(), taskId: t.id, sourceCommit: repo.head };
    plan.steps[0].files = ["first/app.js"];
    plan.steps[1].files = ["second/app.js"];
    store.putRecord("plan", `${t.id}:1`, plan);
    new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).approveStorySelection(
      t,
      StorySelectionSchema.parse({
        planVersion: 1,
        storyIds: ["A", "B"],
        mode: "shared_pr",
      }),
    );
    for (const stage of aiStages)
      store.putRecord("bundle", `${t.id}:${stage}`, {
        stage,
        files: [],
        hash: "frozen",
        adaptations: "",
      });
    const fake = {} as AgentClient,
      handlers = createHandlers(store, fake, dir);
    await handlers.prepare(t, new AbortController().signal);
    t = store.getTask(t.id);
    await writeFile(join(t.worktree!, "first/app.js"), "feature");
    const effective = new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getEffectiveTask(t),
      fingerprint = await fingerprintWorktree(
        t.worktree!,
        [],
        effective.sourceCommit,
      ),
      projected = new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getExecutionPlan(effective);
    store.putRecord(
      "checks",
      t.id,
      projected.checks.map((c) => ({
        id: c.id,
        taskId: t.id,
        planVersion: 1,
        fingerprint,
        status: "passed",
        executed: 1,
        exitCode: 0,
        evidencePath: "/log",
        reason: null,
      })),
    );
    store.putRecord("review", t.id, {
      taskId: t.id,
      planVersion: 1,
      fingerprint,
      findings: [],
      criteria: projected.criteria.map((c) => ({
        id: c.id,
        passed: true,
        evidence: "runner",
      })),
      verdict: "pass",
    });
    new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).recordEvidence(effective);
    store.updateTask(
      t.id,
      t.revision,
      { repairCount: 1 },
      { type: "repair", data: {} },
    );
    const checkpoint = await createStoryCheckpoint(
      store,
      dir,
      effective,
      new AbortController().signal,
      new StoryService(store, {
        readGit: readStoryGit,
        fingerprintWorktree: fingerprintStoryWorktree,
      }).getCheckpointContext(effective),
    );
    const next = new StoryService(store, {
      readGit: readStoryGit,
      fingerprintWorktree: fingerprintStoryWorktree,
    }).completeSharedStory(t, checkpoint);
    expect(next.stage).toBe("prepare");
    expect(
      (
        await handlers.prepare(
          store.getTask(t.id),
          new AbortController().signal,
        )
      ).stage,
    ).toBe("implement");
    expect(
      JSON.stringify(store.getRecord("bundle", `${t.id}:implement`)),
    ).toContain("Second scope instructions");
    expect(store.getTask(t.id).repairCount).toBe(1);
  } finally {
    store.close();
    await f.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
