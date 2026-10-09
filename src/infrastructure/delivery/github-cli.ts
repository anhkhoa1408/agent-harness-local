import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GITHUB_CLI_MAX_BUFFER_BYTES } from "./limits";
import type { GitHubPort } from "../../application/delivery";
const exec = promisify(execFile);
export const deliveryBranchMarker = (head: string) =>
  `<!-- agent-harness:branch:${head} -->`;
async function executeGitHubCommand(args: string[]) {
  return (
    await exec("gh", args, { maxBuffer: GITHUB_CLI_MAX_BUFFER_BYTES })
  ).stdout.trim();
}
export const githubCli: GitHubPort = {
  async findPullRequest(repo, head, base) {
    const list = JSON.parse(
      await executeGitHubCommand([
        "pr",
        "list",
        "--repo",
        repo,
        "--head",
        head,
        "--base",
        base,
        "--state",
        "all",
        "--json",
        "url,headRefOid,state,body",
      ]),
    ) as { url: string; headRefOid: string; state: string; body: string }[];
    if (!list.length) return null;
    const own = list.find((p) => p.body.includes(deliveryBranchMarker(head)));
    if (!own || own.state !== "OPEN") throw new Error("pull_request_collision");
    return { url: own.url, headCommit: own.headRefOid };
  },
  async createPullRequest(i) {
    return executeGitHubCommand([
      "pr",
      "create",
      "--repo",
      i.repo,
      "--head",
      i.head,
      "--base",
      i.base,
      "--title",
      i.title,
      "--body-file",
      i.bodyFile,
    ]);
  },
};
export function githubRepository(url: string) {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(
      url,
    );
  if (!match) throw new Error("delivery_error:remote_not_github");
  return match[1];
}
