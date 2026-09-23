import { mkdir, writeFile, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { Repository, Task } from "../core/contracts";
import { gitText } from "./inspect";
export async function prepareWorktree(
  repo: Repository,
  task: Task,
  root: string,
): Promise<string> {
  await mkdir(root, { recursive: true });
  root = await realpath(root);
  const path = join(root, task.id),
    intentPath = join(root, `${task.id}.intent.json`);
  const intent = {
    taskId: task.id,
    repository: repo.root,
    sourceCommit: task.sourceCommit,
    branch: task.branch,
    path,
  };
  try {
    const old = JSON.parse(await readFile(intentPath, "utf8"));
    if (JSON.stringify(old) !== JSON.stringify(intent))
      throw new Error("worktree_collision");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const existing = await gitText(repo.root, [
      "worktree",
      "list",
      "--porcelain",
    ]);
    if (
      existing.includes(`worktree ${path}\n`) ||
      existing.includes(`branch refs/heads/${task.branch}\n`)
    )
      throw new Error("worktree_collision");
    await writeFile(intentPath, JSON.stringify(intent), {
      flag: "wx",
      mode: 0o600,
    });
  }
  const listing = await gitText(repo.root, ["worktree", "list", "--porcelain"]);
  const record = listing
    .split("\n\n")
    .find((x) => x.split("\n")[0] === `worktree ${path}`);
  if (record) {
    if (!record.includes(`branch refs/heads/${task.branch}`))
      throw new Error("worktree_collision");
    await gitText(path, [
      "merge-base",
      "--is-ancestor",
      task.sourceCommit,
      "HEAD",
    ]);
    return path;
  }
  await gitText(repo.root, [
    "rev-parse",
    "--verify",
    `${task.sourceCommit}^{commit}`,
  ]);
  await gitText(repo.root, [
    "worktree",
    "add",
    "-b",
    task.branch,
    path,
    task.sourceCommit,
  ]);
  return path;
}
