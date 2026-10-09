export type Delivery = {
  mode: "github" | "local";
  commit: string;
  reportPath: string;
  prUrl: string | null;
};
export interface GitHubPort {
  findPullRequest(
    repo: string,
    head: string,
    base: string,
  ): Promise<{ url: string; headCommit: string } | null>;
  createPullRequest(input: {
    repo: string;
    head: string;
    base: string;
    title: string;
    bodyFile: string;
  }): Promise<string>;
}

import type { Task } from "../../domain/contracts";
import type { CheckResult } from "../../domain/evidence";
export interface DeliveryGitPort {
  head(root: string): Promise<string>;
  headParent(root: string): Promise<string>;
  headMessage(root: string): Promise<string>;
  branch(root: string): Promise<string>;
  changedFiles(root: string, source: string): Promise<string>;
  untrackedFiles(root: string): Promise<string>;
  status(root: string): Promise<string>;
  stageFiles(root: string, files: string[]): Promise<void>;
  commit(root: string, message: string): Promise<void>;
  remoteUrl(root: string, remote: string): Promise<string>;
  remoteHead(
    root: string,
    remote: string,
    branch: string,
  ): Promise<string | null>;
  push(root: string, remote: string, branch: string): Promise<void>;
  fingerprint(
    root: string,
    excluded: string[],
    source: string,
  ): Promise<string>;
}
export interface DeliveryArtifactsPort {
  report(task: Task, name: string, body: string): Promise<string>;
  checkpoint(task: Task, name: string, value: unknown): Promise<string>;
  hash(value: string): string;
  verifyImages(checks: CheckResult[]): Promise<void>;
}
export type DeliveryDependencies = {
  git: DeliveryGitPort;
  artifacts: DeliveryArtifactsPort;
  github: GitHubPort;
  repositoryName(url: string): string;
  branchMarker(branch: string): string;
};
export type StoryCheckpoint = {
  commit: string;
  checkpointPath: string;
  checkpointArtifactId: string;
};
