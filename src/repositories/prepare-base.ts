import { readFile, writeFile, mkdir, lstat, readlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Repository, Task } from "../core/contracts";
import { gitText } from "./inspect";
import { contained } from "../context/rules";
import { fingerprintWorktree } from "./fingerprint";

type Sync = {
  source: string;
  baseCommit: string;
  before: string;
  conflicts?: string[];
  untouchedHash?: string;
  index?: string;
  sourceCommit?: string;
  resolvedFingerprint?: string;
};
async function untouched(path: string, conflicts: string[]) {
  const files = new Set(
    (
      await gitText(path, [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
      ])
    )
      .split("\0")
      .filter(Boolean),
  );
  const hash = createHash("sha256");
  for (const file of [...files].sort().filter((f) => !conflicts.includes(f))) {
    hash.update(JSON.stringify(file));
    try {
      const full = await contained(path, file),
        info = await lstat(full);
      hash.update(String(info.mode));
      hash.update(
        info.isSymbolicLink() ? await readlink(full) : await readFile(full),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      hash.update("deleted");
    }
  }
  return hash.digest("hex");
}
export async function synchronizeBase(
  repo: Repository,
  task: Task,
  path: string,
  root: string,
  signal: AbortSignal,
  resolve?: (files: string[]) => Promise<void>,
): Promise<{ sourceCommit: string; baseCommit: string }> {
  signal.throwIfAborted();
  if ((await gitText(path, ["branch", "--show-current"])) !== task.branch)
    throw new Error("worktree_collision");
  if (!repo.remote)
    return { sourceCommit: task.sourceCommit, baseCommit: task.sourceCommit };
  await mkdir(root, { recursive: true });
  const statePath = join(root, `${task.id}.prepare.json`);
  let state: Sync | undefined;
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const save = () =>
    writeFile(statePath, JSON.stringify(state), { mode: 0o600 });
  if (state?.sourceCommit && state.source === task.sourceCommit) {
    if ((await gitText(path, ["rev-parse", "HEAD"])) !== state.sourceCommit)
      throw new Error("prepare_head_changed");
    return { sourceCommit: state.sourceCommit, baseCommit: state.baseCommit };
  }
  if (!state || state.source !== task.sourceCommit) {
    if (state && !state.sourceCommit) throw new Error("prepare_source_changed");
    await gitText(
      repo.root,
      [
        "fetch",
        "--no-tags",
        "--",
        repo.remote,
        `+refs/heads/${repo.baseBranch}:refs/remotes/${repo.remote}/${repo.baseBranch}`,
      ],
      signal,
    );
    const baseCommit = await gitText(repo.root, [
      "rev-parse",
      "--verify",
      `refs/remotes/${repo.remote}/${repo.baseBranch}^{commit}`,
    ]);
    const before = await gitText(path, ["rev-parse", "HEAD"]);
    const included =
      (await gitText(path, ["merge-base", before, baseCommit])) === baseCommit;
    if (included) return { sourceCommit: task.sourceCommit, baseCommit };
    if (await gitText(path, ["status", "--porcelain"]))
      throw new Error("prepare_dirty_worktree");
    state = { source: task.sourceCommit, baseCommit, before };
    await save();
  }
  const head = await gitText(path, ["rev-parse", "HEAD"]);
  if (
    (await gitText(path, ["merge-base", head, state.baseCommit])) ===
    state.baseCommit
  ) {
    // Reconcile a merge completed before the durable result was saved.
    state.sourceCommit = head;
    await save();
    return { sourceCommit: head, baseCommit: state.baseCommit };
  }
  if (head !== state.before) throw new Error("prepare_head_changed");
  let mergeHead: string | null = null;
  try {
    mergeHead = await gitText(path, ["rev-parse", "--verify", "MERGE_HEAD"]);
  } catch {
    /* No pending merge. */
  }
  if (!mergeHead) {
    if (await gitText(path, ["status", "--porcelain"]))
      throw new Error("prepare_dirty_worktree");
    try {
      await gitText(path, ["merge", "--no-edit", state.baseCommit], signal);
    } catch (error) {
      if (!(await gitText(path, ["diff", "--name-only", "--diff-filter=U"])))
        throw error;
    }
    try {
      mergeHead = await gitText(path, ["rev-parse", "--verify", "MERGE_HEAD"]);
    } catch {
      /* Fast-forward or clean merge. */
    }
  }
  if (mergeHead) {
    if (mergeHead !== state.baseCommit)
      throw new Error("prepare_merge_collision");
    state.conflicts ??= (
      await gitText(path, ["diff", "--name-only", "--diff-filter=U", "-z"])
    )
      .split("\0")
      .filter(Boolean);
    state.untouchedHash ??= await untouched(path, state.conflicts);
    state.index ??= await gitText(path, ["ls-files", "--stage", "-z"]);
    await save();
    if ((await untouched(path, state.conflicts)) !== state.untouchedHash)
      throw new Error("conflict_scope_changed");
    if (state.resolvedFingerprint) {
      if (
        (await fingerprintWorktree(path, [], state.source)) !==
        state.resolvedFingerprint
      )
        throw new Error("conflict_resolution_changed");
    } else {
      if (state.conflicts.length) {
        if (!resolve) throw new Error("prepare_conflicts_need_resolution");
        await resolve(state.conflicts);
      }
      signal.throwIfAborted();
      if (
        (await untouched(path, state.conflicts)) !== state.untouchedHash ||
        (await gitText(path, ["ls-files", "--stage", "-z"])) !== state.index ||
        (await gitText(path, ["rev-parse", "HEAD"])) !== state.before
      )
        throw new Error("conflict_scope_changed");
      for (const file of state.conflicts) {
        try {
          const text = await readFile(await contained(path, file), "utf8");
          if (/^(?:<{7}|={7}|>{7})(?: |$)/m.test(text))
            throw new Error("conflict_markers_remaining");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      state.resolvedFingerprint = await fingerprintWorktree(
        path,
        [],
        state.source,
      );
      await save();
    }
    if (
      (await gitText(path, ["diff", "--name-only", "-z"]))
        .split("\0")
        .filter(Boolean)
        .some((f) => !state!.conflicts!.includes(f))
    )
      throw new Error("conflict_scope_changed");
    signal.throwIfAborted();
    if (state.conflicts.length)
      await gitText(path, ["add", "--", ...state.conflicts]);
    if (await gitText(path, ["diff", "--name-only", "--diff-filter=U"]))
      throw new Error("prepare_conflicts_unresolved");
    await gitText(path, ["commit", "--no-edit"], signal);
  }
  state.sourceCommit = await gitText(path, ["rev-parse", "HEAD"]);
  await gitText(path, [
    "merge-base",
    "--is-ancestor",
    state.baseCommit,
    state.sourceCommit,
  ]);
  await save();
  return { sourceCommit: state.sourceCommit, baseCommit: state.baseCommit };
}
