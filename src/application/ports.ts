import type { Store } from "../storage/store";
export type ApplicationStore = Pick<
  Store,
  | "atomic"
  | "getTask"
  | "createTask"
  | "updateTask"
  | "addEvent"
  | "getRecord"
  | "putRecord"
  | "listRecords"
  | "deleteRecord"
>;
export interface StoryRepositoryPort {
  readGit(root: string, args: string[], signal?: AbortSignal): Promise<string>;
  fingerprintWorktree(
    root: string,
    excluded: string[],
    sourceCommit: string,
  ): Promise<string>;
}
