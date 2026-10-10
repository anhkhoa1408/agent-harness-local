import { mkdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DeliveryDependencies } from "../../application/delivery";
import { gitText } from "../repositories/inspect";
import { fingerprintWorktree } from "../repositories/fingerprint";
import { contentHash } from "../context/rules";
import { verifyImageEvidence } from "../execution/ui-verification";
import {
  githubCli,
  githubRepository,
  deliveryBranchMarker,
} from "./github-cli";
export function deliveryIO(data: string): DeliveryDependencies {
  return {
    git: {
      head: (root) => gitText(root, ["rev-parse", "HEAD"]),
      headParent: (root) => gitText(root, ["rev-parse", "HEAD^"]),
      headMessage: (root) =>
        gitText(root, ["show", "-s", "--format=%B", "HEAD"]),
      branch: (root) => gitText(root, ["branch", "--show-current"]),
      changedFiles: (root, source) =>
        gitText(root, ["diff", "--name-only", source, "--"]),
      untrackedFiles: (root) =>
        gitText(root, ["ls-files", "--others", "--exclude-standard"]),
      status: (root) => gitText(root, ["status", "--porcelain"]),
      stageFiles: async (root, files) => {
        await gitText(root, ["add", "--", ...files]);
      },
      commit: async (root, message) => {
        await gitText(root, ["commit", "-m", message]);
      },
      remoteUrl: (root, remote) => gitText(root, ["remote", "get-url", remote]),
      remoteHead: async (root, remote, branch) =>
        (
          await gitText(root, [
            "ls-remote",
            "--heads",
            remote,
            `refs/heads/${branch}`,
          ])
        ).split(/\s/)[0] || null,
      push: async (root, remote, branch) => {
        await gitText(root, ["push", remote, `HEAD:refs/heads/${branch}`]);
      },
      fingerprint: fingerprintWorktree,
    },
    artifacts: {
      hash: contentHash,
      verifyImages: verifyImageEvidence,
      async report(task, name, body) {
        const folder = join(data, "artifacts", task.id);
        await mkdir(folder, { recursive: true });
        const path = join(folder, name);
        await writeFile(path, body, { mode: 0o600 });
        return path;
      },
      async checkpoint(task, name, value) {
        const folder = join(data, "artifacts", task.id, "checkpoints");
        await mkdir(folder, { recursive: true });
        const path = join(folder, name),
          temp = `${path}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
        await rename(temp, path);
        return path;
      },
    },
    github: githubCli,
    repositoryName: githubRepository,
    branchMarker: deliveryBranchMarker,
  };
}
