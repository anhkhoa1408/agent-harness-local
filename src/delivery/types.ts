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
