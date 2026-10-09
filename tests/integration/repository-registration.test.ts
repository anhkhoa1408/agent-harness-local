import { test, expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { openStore } from "../../src/infrastructure/persistence/store";
import { createHttpHandler } from "../../src/bootstrap/http";
import { bootstrapSession } from "../../src/bootstrap/session";
import { createTempRepo } from "../support/temp-repo";

test("registration reports actionable errors without persisting invalid repositories", async () => {
  const repo = await createTempRepo({});
  const plain = await mkdtemp(join(tmpdir(), "registration-"));
  const unborn = join(plain, "unborn");
  execFileSync("git", ["init", "-b", "main", unborn], { stdio: "ignore" });
  const file = join(plain, "file.txt");
  await writeFile(file, "not a directory");
  const store = openStore(":memory:");
  const handle = createHttpHandler(store, plain, async () => []);
  const base = "http://127.0.0.1:3100",
    host = "127.0.0.1:3100";
  try {
    const boot = bootstrapSession(
      new Request(base + "/session", {
        headers: {
          host,
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
        },
      }),
      store,
    );
    const cookie = boot.headers.get("set-cookie")!.split(";")[0];
    const { csrf } = await (
      await handle(
        new Request(base + "/api/session", {
          headers: { host, cookie },
        }),
      )
    ).json();
    const register = (
      path: string,
      baseBranch = "main",
      remote: string | null = null,
    ) =>
      handle(
        new Request(base + "/api/repositories", {
          method: "POST",
          headers: {
            host,
            cookie,
            origin: base,
            "x-harness-csrf": csrf,
            "content-type": "application/json",
          },
          body: JSON.stringify({ path, baseBranch, remote }),
        }),
      );
    for (const [path, branch, remote, code, detail] of [
      [
        join(plain, "missing"),
        "main",
        null,
        "repository_path_unavailable",
        "Đường dẫn",
      ],
      [file, "main", null, "repository_path_unavailable", "Đường dẫn"],
      [plain, "main", null, "repository_not_git", "Git"],
      [
        repo.root,
        "bad branch",
        null,
        "repository_branch_invalid",
        "bad branch",
      ],
      [repo.root, "missing", null, "repository_branch_unavailable", "missing"],
      [unborn, "main", null, "repository_branch_unavailable", "commit"],
      [repo.root, "main", "absent", "repository_remote_unavailable", "absent"],
    ] as const) {
      const response = await register(path, branch, remote);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe(code);
      expect(body.details[0]).toContain(detail);
      expect(body.details[0]).not.toContain("Command failed");
      expect(store.listRecords("repository")).toEqual([]);
    }
    const response = await register(repo.root);
    expect(response.status).toBe(201);
    expect((await response.json()).root).toBe(repo.root);
    expect(store.listRecords("repository")).toHaveLength(1);
  } finally {
    store.close();
    await repo.dispose();
    await rm(plain, { recursive: true, force: true });
  }
});
