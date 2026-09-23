import { test, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTempRepo } from "../support/temp-repo";
import { taskFixture, planFixture } from "../support/task-fixture";
import { inspectRepository, gitText } from "../../src/repositories/inspect";
import { prepareWorktree } from "../../src/repositories/worktree";
import { fingerprintWorktree } from "../../src/repositories/fingerprint";
import { openStore } from "../../src/storage/store";
import { createDelivery, type GitHubPort } from "../../src/delivery/github";
test("local delivery commits only owned feature and retry does not duplicate commit", async () => {
  await fixture(false, async ({ deliver, task, path }) => {
    const first = await deliver(task, new AbortController().signal);
    const second = await deliver(task, new AbortController().signal);
    expect(first.mode).toBe("local");
    expect(first.commit).toBe(second.commit);
    expect(await gitText(path, ["status", "--porcelain"])).toBe("");
  });
});
test("lost PR response reconciles existing PR; external remote changes block", async () => {
  let created = 0,
    existing: { url: string; headCommit: string } | null = null;
  const fake: GitHubPort = {
    findPullRequest: async () => existing,
    createPullRequest: async () => {
      created++;
      existing = {
        url: "https://github.com/test/repo/pull/1",
        headCommit: currentCommit,
      };
      throw Error("connection_lost");
    },
  };
  let currentCommit = "";
  await fixture(true, async ({ deliver, task, path, remote }) => {
    const head = await gitText(path, ["rev-parse", "HEAD"]);
    const get = async () => {
      currentCommit = await gitText(path, ["rev-parse", "HEAD"]);
    };
    const wrapped: GitHubPort = {
      ...fake,
      createPullRequest: async (i) => {
        await get();
        return fake.createPullRequest(i);
      },
    };
    const send = deliver(wrapped);
    await expect(send(task, new AbortController().signal)).rejects.toThrow(
      "connection_lost",
    );
    const result = await send(task, new AbortController().signal);
    expect(result.prUrl).toBe(existing?.url);
    expect(created).toBe(1);
    await gitText(remote, ["update-ref", `refs/heads/${task.branch}`, head]);
    await expect(send(task, new AbortController().signal)).rejects.toThrow(
      "remote_head_changed",
    );
  });
});
async function fixture(
  remoteMode: boolean,
  work: (context: any) => Promise<void>,
) {
  const f = await createTempRepo({ "app.js": "original" }),
    dir = await mkdtemp(join(tmpdir(), "delivery")),
    store = openStore(join(dir, "db"));
  try {
    const remote = join(dir, "remote.git");
    if (remoteMode) {
      await gitText(dir, ["init", "--bare", remote]);
      await gitText(f.root, ["remote", "add", "origin", remote]);
    }
    const repo = await inspectRepository(
        f.root,
        "main",
        remoteMode ? "origin" : null,
      ),
      task = taskFixture({
        sourceCommit: repo.head,
        repositoryId: repo.id,
        approvedPlanVersion: 1,
        deliveryMode: remoteMode ? "github" : "local",
      }),
      path = await prepareWorktree(repo, task, join(dir, "worktrees"));
    task.worktree = path;
    await writeFile(join(path, "app.js"), "feature");
    const fingerprint = await fingerprintWorktree(path, [], task.sourceCommit),
      plan = planFixture({ sourceCommit: task.sourceCommit });
    store.putRecord("repository", repo.id, repo);
    store.putRecord("plan", "task:1", plan);
    store.putRecord("checks", "task", [
      {
        id: "feature-unit",
        taskId: "task",
        planVersion: 1,
        fingerprint,
        status: "passed",
        executed: 1,
        exitCode: 0,
        evidencePath: "/log",
        reason: null,
      },
    ]);
    store.putRecord("review", "task", {
      taskId: "task",
      planVersion: 1,
      fingerprint,
      findings: [],
      criteria: [{ id: "AC-1", passed: true, evidence: "passed" }],
      verdict: "pass",
    });
    const deliver = remoteMode
      ? (github: GitHubPort) =>
          createDelivery(store, dir, {
            github,
            repositoryName: () => "test/repo",
          })
      : createDelivery(store, dir);
    await work({ deliver, task, path, remote });
  } finally {
    store.close();
    await f.dispose();
    await rm(dir, { recursive: true, force: true });
  }
}
