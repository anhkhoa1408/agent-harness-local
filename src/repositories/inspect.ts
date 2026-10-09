import {
  GIT_MAX_BUFFER_BYTES,
  GIT_COMMAND_TIMEOUT_MS,
  MAX_SOURCE_DOCUMENT_BYTES,
  MAX_SOURCE_CONTEXT_BYTES,
} from "./limits";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  realpath,
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  RepoProfileSchema,
  type Repository,
  type ModelChoice,
} from "../core/contracts";
import type { AgentClient, AgentEvent } from "../codex/types";
import type { Bundle } from "../context/skills";
import { composeInstructions } from "../context/prompts";
const exec = promisify(execFile);
export class RepositoryRegistrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryRegistrationError";
  }
}
export async function gitText(
  root: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  return (
    await exec("git", ["-C", root, ...args], {
      maxBuffer: GIT_MAX_BUFFER_BYTES,
      signal,
      timeout: GIT_COMMAND_TIMEOUT_MS,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    })
  ).stdout.trim();
}
export async function inspectRepository(
  path: string,
  baseBranch: string,
  remote: string | null,
): Promise<Repository> {
  let failure = new RepositoryRegistrationError(
    "repository_path_unavailable",
    `Đường dẫn “${path}” không tồn tại, không phải thư mục hoặc không thể truy cập từ máy/container chạy Harness.`,
  );
  try {
    if (!(await stat(path)).isDirectory()) throw failure;
    failure = new RepositoryRegistrationError(
      "repository_not_git",
      `Thư mục “${path}” không phải repository Git có thể truy cập. Kiểm tra thư mục .git và Git trên máy/container chạy Harness.`,
    );
    const root = await realpath(
      await gitText(path, ["rev-parse", "--show-toplevel"]),
    );
    failure = new RepositoryRegistrationError(
      "repository_branch_invalid",
      `Tên nhánh “${baseBranch}” không hợp lệ. Hãy nhập tên nhánh Git hợp lệ.`,
    );
    await gitText(root, ["check-ref-format", "--branch", baseBranch]);
    failure = new RepositoryRegistrationError(
      "repository_branch_unavailable",
      `Không tìm thấy nhánh “${baseBranch}” có commit trong repo local. Kiểm tra tên nhánh (main/master); nếu repo mới, hãy tạo commit đầu tiên.`,
    );
    const head = await gitText(root, [
      "rev-parse",
      "--verify",
      `${baseBranch}^{commit}`,
    ]);
    if (remote) {
      failure = new RepositoryRegistrationError(
        "repository_remote_unavailable",
        `Không tìm thấy remote “${remote}” trong repo. Kiểm tra tên remote hoặc để trống nếu chỉ dùng local.`,
      );
      await gitText(root, ["remote", "get-url", remote]);
    }
    failure = new RepositoryRegistrationError(
      "repository_inspection_failed",
      "Không thể đọc trạng thái repository. Kiểm tra quyền truy cập và cấu hình Git của repo.",
    );
    return {
      id: randomUUID(),
      root,
      baseBranch,
      remote,
      head,
      dirty: !!(await gitText(root, ["status", "--porcelain=v1", "-z"])),
    };
  } catch {
    throw failure;
  }
}
export async function sourceDocuments(
  repo: Repository,
): Promise<{ path: string; content: string }[]> {
  const paths = (
    await gitText(repo.root, ["ls-tree", "-r", "--name-only", "-z", repo.head])
  )
    .split("\0")
    .filter(Boolean);
  const docs: { path: string; content: string }[] = [];
  let total = 0;
  for (const path of paths) {
    if (
      /(^|\/)(\.env(?:\.|$)|node_modules\/|\.git\/)|\.(pem|key|p12|png|jpg|pdf|lock)$|(^|\/)(id_rsa|credentials)/i.test(
        path,
      )
    )
      continue;
    const size = Number(
      await gitText(repo.root, ["cat-file", "-s", `${repo.head}:${path}`]),
    );
    if (
      size > MAX_SOURCE_DOCUMENT_BYTES ||
      total + size > MAX_SOURCE_CONTEXT_BYTES
    )
      continue;
    const content = (
      await exec("git", ["-C", repo.root, "show", `${repo.head}:${path}`], {
        maxBuffer: GIT_MAX_BUFFER_BYTES,
      })
    ).stdout;
    if (content.includes("\0")) continue;
    docs.push({ path, content });
    total += size;
  }
  return docs;
}
export async function withSourceSnapshot<T>(
  repo: Repository,
  work: (path: string) => Promise<T>,
): Promise<T> {
  const snapshot = await mkdtemp(join(tmpdir(), "harness-source-"));
  try {
    for (const doc of await sourceDocuments(repo)) {
      const target = join(snapshot, doc.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, doc.content);
    }
    return await work(snapshot);
  } finally {
    await rm(snapshot, { recursive: true, force: true });
  }
}
export async function discoverRepository(
  repo: Repository,
  client: AgentClient,
  bundle: Bundle,
  model: ModelChoice,
  signal: AbortSignal,
  executionMode?: "manual" | "auto",
  onEvent: (event: AgentEvent) => void = () => {},
) {
  const docs = await sourceDocuments(repo),
    snapshot = await mkdtemp(join(tmpdir(), "harness-discovery-"));
  try {
    for (const doc of docs) {
      const target = join(snapshot, doc.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, doc.content);
    }
    const run = await client.runDirectTurn(
      {
        cwd: snapshot,
        model,
        instructions: composeInstructions(bundle),
        prompt: `Inspect the committed source snapshot only. Do not run setup or commands. Return languages, areas, candidate argv commands, prerequisites, evidence paths and unknowns. Missing or truncated files are unknowns. repositoryId=${repo.id}; sourceCommit=${repo.head}`,
        outputSchema: z.toJSONSchema(RepoProfileSchema),
        write: false,
        executionMode,
      },
      onEvent,
      signal,
    );
    const profile = RepoProfileSchema.parse(run.result);
    if (
      profile.repositoryId !== repo.id ||
      profile.sourceCommit !== repo.head ||
      profile.evidence.some((e) => !docs.some((d) => d.path === e.path))
    )
      throw new Error("invalid_profile_evidence");
    return profile;
  } finally {
    await rm(snapshot, { recursive: true, force: true });
  }
}
