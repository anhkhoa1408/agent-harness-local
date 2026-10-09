import type { Task, Plan } from "../../domain/contracts";
import type { CheckResult } from "../../domain/evidence";
import { evidenceExclusions } from "../../domain/evidence";
import { acceptanceErrors } from "../../domain/acceptance";
import type { ApplicationStore } from "../ports";
import type { ValidationPort } from "../validation";
import type { DeliveryDependencies, Delivery, GitHubPort } from "./types";
import { renderReport } from "./report";
export function createDelivery(
  store: ApplicationStore,
  io: DeliveryDependencies,
  validation: ValidationPort,
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
      repo = validation.repository(store.repositories.get(task.repositoryId)),
      plan =
        options.plan ??
        validation.plan(store.plans.get(`${task.id}:${task.planVersion}`)),
      review = validation.outputs.review.parse(store.reviews.get(task.id)),
      checks = store.checks.get(task.id) as CheckResult[];
    const exclusions = evidenceExclusions(plan),
      fingerprint = () =>
        io.git.fingerprint(path, exclusions, task.sourceCommit),
      before = await fingerprint();
    const errors = acceptanceErrors(task, plan, checks, review, before);
    if (errors.length) throw new Error(`acceptance_failed:${errors.join(",")}`);
    await io.artifacts.verifyImages(checks);
    if ((await io.git.branch(path)) !== task.branch)
      throw new Error("branch_collision");
    const changed = [
        ...(await io.git.changedFiles(path, task.sourceCommit)).split("\n"),
        ...(await io.git.untrackedFiles(path)).split("\n"),
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
      commitEffect = store.effects.get(commitKey) as {
        state: string;
        commit?: string;
        parent: string;
      } | null;
    let head = await io.git.head(path);
    if (commitEffect?.state === "confirmed") {
      if (head !== commitEffect.commit) throw new Error("local_head_changed");
    } else {
      const parent = commitEffect?.parent ?? head;
      if (!commitEffect)
        store.effects.put(commitKey, { state: "intent", parent });
      if (head !== parent) {
        if ((await io.git.headMessage(path)) !== commitMessage)
          throw new Error("local_head_changed");
      } else if ((await io.git.status(path)) && changed.length) {
        await io.git.stageFiles(path, changed);
        await io.git.commit(path, commitMessage);
        head = await io.git.head(path);
      }
      if ((await fingerprint()) !== before)
        throw new Error("source_changed_during_commit");
      store.effects.put(commitKey, {
        state: "confirmed",
        parent,
        commit: head,
      });
    }
    const reportPath = await io.artifacts.report(
      task,
      options.reportName ?? `delivery-v${plan.version}.md`,
      `${io.branchMarker(task.branch)}\n\n${renderReport(plan, checks, review)}${options.reportAppendix ?? ""}\n\nTarget: ${task.targetBranch}; branch: ${task.branch}; commit: ${head}.\n`,
    );
    store.artifacts.put(`${options.effectPrefix ?? task.id}-delivery`, {
      id: `${options.effectPrefix ?? task.id}-delivery`,
      taskId: task.id,
      path: reportPath,
      type: "report",
    });
    if (task.deliveryMode === "local" || !repo.remote)
      return { mode: "local", commit: head, reportPath, prUrl: null };
    const remote = repo.remote,
      url = await io.git.remoteUrl(path, remote),
      name = (options.repositoryName ?? io.repositoryName)(url),
      github = options.github ?? io.github;
    const remoteHead = () => io.git.remoteHead(path, remote, task.branch);
    const pushKey = `${task.id}:push:${head}:${task.branch}`,
      pushEffect = store.effects.get(pushKey) as {
        state: string;
      } | null;
    const actual = await remoteHead();
    if (actual && actual !== head) throw new Error("remote_head_changed");
    if (!actual) {
      if (pushEffect?.state === "confirmed")
        throw new Error("remote_head_changed");
      store.effects.put(pushKey, {
        state: "intent",
        commit: head,
        head: task.branch,
      });
      signal.throwIfAborted();
      await io.git.push(path, remote, task.branch);
    }
    if ((await remoteHead()) !== head) throw new Error("remote_head_changed");
    store.effects.put(pushKey, { state: "confirmed", commit: head });
    const prKey = `${task.id}:pr:${head}:${task.branch}:${task.targetBranch}`;
    let existing = await github.findPullRequest(
      name,
      task.branch,
      task.targetBranch,
    );
    if (existing && existing.headCommit !== head)
      throw new Error("pull_request_head_changed");
    if (!existing) {
      store.effects.put(prKey, {
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
    store.effects.put(prKey, {
      state: "confirmed",
      url: existing.url,
      commit: head,
    });
    return { mode: "github", commit: head, reportPath, prUrl: existing.url };
  };
}
