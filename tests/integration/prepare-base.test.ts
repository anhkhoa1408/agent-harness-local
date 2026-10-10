import { test, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTempRepo } from "../support/temp-repo";
import { taskFixture } from "../support/task-fixture";
import {
  gitText,
  inspectRepository,
} from "../../src/infrastructure/repositories/inspect";
import { prepareWorktree } from "../../src/infrastructure/repositories/worktree";
import { synchronizeBase } from "../../src/infrastructure/repositories/prepare-base";

async function fixture(diverge = false) {
  const origin = await createTempRepo({
    "app.txt": "original\n",
    "keep.txt": "keep\n",
  });
  const dir = await mkdtemp(join(tmpdir(), "prepare-base-"));
  const root = join(dir, "repo");
  await gitText(dir, ["clone", origin.root, root]);
  await gitText(root, ["config", "user.name", "Fixture"]);
  await gitText(root, ["config", "user.email", "fixture@example.test"]);
  if (diverge) {
    await writeFile(join(root, "app.txt"), "feature\n");
    await gitText(root, ["commit", "-am", "source feature"]);
  }
  const repo = await inspectRepository(root, "main", "origin");
  const task = taskFixture({ sourceCommit: repo.head });
  const path = await prepareWorktree(repo, task, join(dir, "worktrees"));
  return {
    origin,
    dir,
    root,
    repo,
    task,
    path,
    dispose: async () => {
      await origin.dispose();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("prepare fetches current origin base into isolated worktree and retry keeps the same baseline", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.origin.root, "app.txt"), "remote update\n");
    await gitText(f.origin.root, ["commit", "-am", "remote"]);
    await writeFile(join(f.root, "keep.txt"), "user dirty\n");
    const result = await synchronizeBase(
      f.repo,
      f.task,
      f.path,
      f.dir,
      new AbortController().signal,
    );
    expect(result.sourceCommit).toBe(
      await gitText(f.origin.root, ["rev-parse", "HEAD"]),
    );
    expect(await readFile(join(f.path, "app.txt"), "utf8")).toBe(
      "remote update\n",
    );
    expect(await readFile(join(f.root, "app.txt"), "utf8")).toBe("original\n");
    expect(await readFile(join(f.root, "keep.txt"), "utf8")).toBe(
      "user dirty\n",
    );
    expect(
      await synchronizeBase(
        f.repo,
        f.task,
        f.path,
        f.dir,
        new AbortController().signal,
      ),
    ).toEqual(result);
    expect(
      await prepareWorktree(
        f.repo,
        { ...f.task, sourceCommit: result.sourceCommit },
        join(f.dir, "worktrees"),
      ),
    ).toBe(f.path);
  } finally {
    await f.dispose();
  }
});

test("prepare resolves only conflict files, commits through worker and retains both branch histories", async () => {
  const f = await fixture(true);
  try {
    await writeFile(join(f.origin.root, "app.txt"), "base update\n");
    await gitText(f.origin.root, ["commit", "-am", "remote"]);
    const remote = await gitText(f.origin.root, ["rev-parse", "HEAD"]);
    const result = await synchronizeBase(
      f.repo,
      f.task,
      f.path,
      f.dir,
      new AbortController().signal,
      async (files) => {
        expect(files).toEqual(["app.txt"]);
        await writeFile(join(f.path, "app.txt"), "base update with feature\n");
      },
    );
    expect(await readFile(join(f.path, "app.txt"), "utf8")).toBe(
      "base update with feature\n",
    );
    expect(
      await gitText(f.path, ["diff", "--name-only", "--diff-filter=U"]),
    ).toBe("");
    expect(
      (
        await gitText(f.path, [
          "show",
          "-s",
          "--format=%P",
          result.sourceCommit,
        ])
      ).split(" "),
    ).toEqual([f.task.sourceCommit, remote]);
  } finally {
    await f.dispose();
  }
});

test("prepare blocks dirty worktree instead of discarding feature edits", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.path, "app.txt"), "unfinished feature\n");
    await writeFile(join(f.origin.root, "app.txt"), "remote update\n");
    await gitText(f.origin.root, ["commit", "-am", "remote"]);
    await expect(
      synchronizeBase(
        f.repo,
        f.task,
        f.path,
        f.dir,
        new AbortController().signal,
      ),
    ).rejects.toThrow("prepare_dirty_worktree");
    expect(await readFile(join(f.path, "app.txt"), "utf8")).toBe(
      "unfinished feature\n",
    );
  } finally {
    await f.dispose();
  }
});

test("conflict resolver cannot modify unrelated files or leave markers and retry can resolve the pending merge", async () => {
  const f = await fixture(true);
  try {
    await writeFile(join(f.origin.root, "app.txt"), "remote update\n");
    await gitText(f.origin.root, ["commit", "-am", "remote"]);
    await expect(
      synchronizeBase(
        f.repo,
        f.task,
        f.path,
        f.dir,
        new AbortController().signal,
        async () => {
          await writeFile(join(f.path, "keep.txt"), "out of scope\n");
        },
      ),
    ).rejects.toThrow("conflict_scope_changed");
    await writeFile(join(f.path, "keep.txt"), "keep\n");
    await expect(
      synchronizeBase(
        f.repo,
        f.task,
        f.path,
        f.dir,
        new AbortController().signal,
        async () => {},
      ),
    ).rejects.toThrow("conflict_markers_remaining");
    const result = await synchronizeBase(
      f.repo,
      f.task,
      f.path,
      f.dir,
      new AbortController().signal,
      async () => {
        await writeFile(join(f.path, "app.txt"), "resolved\n");
      },
    );
    expect(result.sourceCommit).not.toBe(f.task.sourceCommit);
  } finally {
    await f.dispose();
  }
});

test("prepare reports unavailable origin base and respects cancellation before touching Git state", async () => {
  const f = await fixture();
  try {
    const abort = new AbortController();
    abort.abort();
    await expect(
      synchronizeBase(f.repo, f.task, f.path, f.dir, abort.signal),
    ).rejects.toThrow();
    await expect(
      synchronizeBase(
        { ...f.repo, baseBranch: "missing" },
        f.task,
        f.path,
        f.dir,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(await gitText(f.path, ["rev-parse", "HEAD"])).toBe(
      f.task.sourceCommit,
    );
  } finally {
    await f.dispose();
  }
});

test("retry after merge commit failure reuses worker-staged resolution without another AI call", async () => {
  const f = await fixture(true);
  try {
    await writeFile(join(f.origin.root, "app.txt"), "remote update\n");
    await gitText(f.origin.root, ["commit", "-am", "remote"]);
    const hook = join(f.root, ".git/hooks/pre-commit");
    await writeFile(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    await expect(
      synchronizeBase(
        f.repo,
        f.task,
        f.path,
        f.dir,
        new AbortController().signal,
        async () => {
          await writeFile(join(f.path, "app.txt"), "resolved\n");
        },
      ),
    ).rejects.toThrow();
    await rm(hook);
    const result = await synchronizeBase(
      f.repo,
      f.task,
      f.path,
      f.dir,
      new AbortController().signal,
      async () => {
        throw new Error("must not call AI again");
      },
    );
    expect(result.sourceCommit).not.toBe(f.task.sourceCommit);
    expect(await readFile(join(f.path, "app.txt"), "utf8")).toBe("resolved\n");
  } finally {
    await f.dispose();
  }
});

test("clean merge commit retry never calls conflict AI when there are no conflicted files", async () => {
  const f = await fixture(true);
  try {
    await writeFile(join(f.origin.root, "keep.txt"), "remote keep\n");
    await gitText(f.origin.root, ["commit", "-am", "remote"]);
    const hook = join(f.root, ".git/hooks/pre-merge-commit");
    await writeFile(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    await expect(
      synchronizeBase(
        f.repo,
        f.task,
        f.path,
        f.dir,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    await rm(hook);
    const result = await synchronizeBase(
      f.repo,
      f.task,
      f.path,
      f.dir,
      new AbortController().signal,
      async () => {
        throw new Error("clean merge must not call AI");
      },
    );
    expect(result.sourceCommit).not.toBe(f.task.sourceCommit);
    expect(await readFile(join(f.path, "keep.txt"), "utf8")).toBe(
      "remote keep\n",
    );
  } finally {
    await f.dispose();
  }
});
