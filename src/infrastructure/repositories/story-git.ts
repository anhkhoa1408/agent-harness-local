import type { StoryRepositoryPort } from "../../application/ports";
import { gitText } from "./inspect";
import { fingerprintWorktree } from "./fingerprint";
// Command arguments are owned by this adapter, never by use cases.
export function createStoryGit(
  read = gitText,
  fingerprint: StoryRepositoryPort["fingerprintWorktree"] = fingerprintWorktree,
): StoryRepositoryPort {
  return {
    resolveCommit: (root, ref, signal) =>
      read(root, ["rev-parse", "--verify", `${ref}^{commit}`], signal),
    validateBranch: async (root, branch) => {
      await read(root, ["check-ref-format", "--branch", branch]);
    },
    fetchBranch: async (root, remote, branch, signal) => {
      await read(
        root,
        [
          "fetch",
          "--no-tags",
          "--",
          remote,
          `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`,
        ],
        signal,
      );
    },
    assertAncestor: async (root, ancestor, commit, signal) => {
      await read(
        root,
        ["merge-base", "--is-ancestor", ancestor, commit],
        signal,
      );
    },
    head: (root) => read(root, ["rev-parse", "HEAD"]),
    headParent: (root) => read(root, ["rev-parse", "HEAD^"]),
    headMessage: (root) => read(root, ["show", "-s", "--format=%B", "HEAD"]),
    fingerprintWorktree: fingerprint,
  };
}
