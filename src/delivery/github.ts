import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PlanSchema,
  ReviewSchema,
  RepositorySchema,
  type Task,
  type Plan,
} from "../core/contracts";
import type { Store } from "../storage/store";
import { acceptanceErrors } from "../core/acceptance";
import type { CheckResult } from "../core/evidence";
import { gitText } from "../repositories/inspect";
import { fingerprintWorktree } from "../repositories/fingerprint";
import { renderReport } from "./report";
import {
  evidenceExclusions,
  verifyImageEvidence,
} from "../execution/ui-verification";
import {
  githubCli,
  githubRepository,
  deliveryBranchMarker as marker,
} from "./github-cli";
import type { GitHubPort, Delivery } from "./types";
export type { GitHubPort, Delivery } from "./types";
export { githubCli, githubRepository } from "./github-cli";
export function createDelivery(
  store: Store,
  data: string,
  options: {
    github?: GitHubPort;
    repositoryName?: (url: string) => string;
    plan?: Plan;
    effectPrefix?: string;
    reportName?: string;
    commitMessage?: string;
    reportAppendix?: string;
  } = {},
) {
  return async function deliver(
    task: Task,
    signal: AbortSignal,
  ): Promise<Delivery> {
    signal.throwIfAborted();
    if (!task.worktree) throw new Error("worktree_missing");
    const path = task.worktree,
      repo = RepositorySchema.parse(
        store.getRecord("repository", task.repositoryId),
      ),
      plan =
        options.plan ??
        PlanSchema.parse(
          store.getRecord("plan", `${task.id}:${task.planVersion}`),
        ),
      review = ReviewSchema.parse(store.getRecord("review", task.id)),
      checks = store.getRecord("checks", task.id) as CheckResult[];
    const exclusions = evidenceExclusions(plan),
      fingerprint = () =>
        fingerprintWorktree(path, exclusions, task.sourceCommit),
      before = await fingerprint();
    const errors = acceptanceErrors(task, plan, checks, review, before);
    if (errors.length) throw new Error(`acceptance_failed:${errors.join(",")}`);
    await verifyImageEvidence(checks);
    if ((await gitText(path, ["branch", "--show-current"])) !== task.branch)
      throw new Error("branch_collision");
    const changed = [
        ...(
          await gitText(path, ["diff", "--name-only", task.sourceCommit, "--"])
        ).split("\n"),
        ...(
          await gitText(path, ["ls-files", "--others", "--exclude-standard"])
        ).split("\n"),
      ]
        .filter(Boolean)
        .filter((p) => !exclusions.includes(p)),
      allowed = plan.steps.flatMap((s) => s.files);
    if (
      changed.some(
        (p) =>
          !allowed.some((a) => p === a || (a.endsWith("/") && p.startsWith(a))),
      )
    )
      throw new Error("scope_changed_requires_plan");
    const commitMessage =
      options.commitMessage ??
      `feat: ${task.title}\n\nHarness-Task: ${task.id}`;
    const commitKey = `${options.effectPrefix ?? task.id}:commit:${before}`,
      commitEffect = store.getRecord("effect", commitKey) as {
        state: string;
        commit?: string;
        parent: string;
      } | null;
    let head = await gitText(path, ["rev-parse", "HEAD"]);
    if (commitEffect?.state === "confirmed") {
      if (head !== commitEffect.commit) throw new Error("local_head_changed");
    } else {
      const parent = commitEffect?.parent ?? head;
      if (!commitEffect)
        store.putRecord("effect", commitKey, { state: "intent", parent });
      if (head !== parent) {
        if (
          (await gitText(path, ["show", "-s", "--format=%B", "HEAD"])) !==
          commitMessage
        )
          throw new Error("local_head_changed");
      } else if (
        (await gitText(path, ["status", "--porcelain"])) &&
        changed.length
      ) {
        await gitText(path, ["add", "--", ...changed]);
        await gitText(path, ["commit", "-m", commitMessage]);
        head = await gitText(path, ["rev-parse", "HEAD"]);
      }
      if ((await fingerprint()) !== before)
        throw new Error("source_changed_during_commit");
      store.putRecord("effect", commitKey, {
        state: "confirmed",
        parent,
        commit: head,
      });
    }
    const folder = join(data, "artifacts", task.id);
    await mkdir(folder, { recursive: true });
    const reportPath = join(
      folder,
      options.reportName ?? `delivery-v${plan.version}.md`,
    );
    await writeFile(
      reportPath,
      `${marker(task.branch)}\n\n${renderReport(plan, checks, review)}${options.reportAppendix ?? ""}\n\nTarget: ${task.targetBranch}; branch: ${task.branch}; commit: ${head}.\n`,
      { mode: 0o600 },
    );
    store.putRecord("artifact", `${options.effectPrefix ?? task.id}-delivery`, {
      id: `${options.effectPrefix ?? task.id}-delivery`,
      taskId: task.id,
      path: reportPath,
      type: "report",
    });
    if (task.deliveryMode === "local" || !repo.remote)
      return { mode: "local", commit: head, reportPath, prUrl: null };
    const remote = repo.remote,
      url = await gitText(path, ["remote", "get-url", remote]),
      name = (options.repositoryName ?? githubRepository)(url),
      github = options.github ?? githubCli;
    const remoteHead = async () => {
      const text = await gitText(path, [
        "ls-remote",
        "--heads",
        remote,
        `refs/heads/${task.branch}`,
      ]);
      return text.split(/\s/)[0] || null;
    };
    const pushKey = `${task.id}:push:${head}:${task.branch}`,
      pushEffect = store.getRecord("effect", pushKey) as {
        state: string;
      } | null;
    const actual = await remoteHead();
    if (actual && actual !== head) throw new Error("remote_head_changed");
    if (!actual) {
      if (pushEffect?.state === "confirmed")
        throw new Error("remote_head_changed");
      store.putRecord("effect", pushKey, {
        state: "intent",
        commit: head,
        head: task.branch,
      });
      signal.throwIfAborted();
      await gitText(path, ["push", remote, `HEAD:refs/heads/${task.branch}`]);
    }
    if ((await remoteHead()) !== head) throw new Error("remote_head_changed");
    store.putRecord("effect", pushKey, { state: "confirmed", commit: head });
    const prKey = `${task.id}:pr:${head}:${task.branch}:${task.targetBranch}`;
    let existing = await github.findPullRequest(
      name,
      task.branch,
      task.targetBranch,
    );
    if (existing && existing.headCommit !== head)
      throw new Error("pull_request_head_changed");
    if (!existing) {
      store.putRecord("effect", prKey, {
        state: "intent",
        commit: head,
        head: task.branch,
        base: task.targetBranch,
      });
      signal.throwIfAborted();
      await github.createPullRequest({
        repo: name,
        head: task.branch,
        base: task.targetBranch,
        title: task.title,
        bodyFile: reportPath,
      });
      existing = await github.findPullRequest(
        name,
        task.branch,
        task.targetBranch,
      );
      if (!existing || existing.headCommit !== head)
        throw new Error("pull_request_unconfirmed");
    }
    store.putRecord("effect", prKey, {
      state: "confirmed",
      url: existing.url,
      commit: head,
    });
    return { mode: "github", commit: head, reportPath, prUrl: existing.url };
  };
}
