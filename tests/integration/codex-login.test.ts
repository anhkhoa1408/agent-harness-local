import { test, expect, vi } from "vitest";
import { mkdtemp, writeFile, chmod, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexLogin } from "../../src/server/codex-login";

async function fixture(mode = "success", timeoutMs = 5000) {
  const root = await mkdtemp(join(tmpdir(), "harness-login-"));
  const binary = join(root, "codex");
  await writeFile(
    binary,
    `#!${process.execPath}
    const fs = require('node:fs');
    const path = require('node:path');
    const root = ${JSON.stringify(root)};
    if (process.argv.includes('status')) {
      const counterPath = path.join(root, 'status-count');
      const count = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath)) + 1 : 1;
      fs.writeFileSync(counterPath, String(count));
      if (${JSON.stringify(mode)} === 'race' && count === 1) { setTimeout(() => process.exit(1), 300); return; }
      process.exit(fs.existsSync(path.join(root, 'auth')) ? 0 : 1);
    }
    fs.appendFileSync(path.join(root, 'starts'), '1');
    console.log('https://auth.openai.com/oauth/authorize?response_type=code&state=fixture&code_challenge=fixture&code_challenge_method=S256&redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback');
    if (${JSON.stringify(mode)} === 'fail') { console.error('secret diagnostic'); setTimeout(() => process.exit(1), 100); }
    else if (${JSON.stringify(mode)} === 'success') setTimeout(() => { fs.writeFileSync(path.join(root, 'auth'), 'fixture'); process.exit(0); }, 300);
    else setInterval(() => {}, 1000);
  `,
  );
  await chmod(binary, 0o700);
  const login = new CodexLogin(binary, timeoutMs);
  return {
    login,
    root,
    dispose: async () => {
      await login.cancel();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("browser OAuth starts once, exposes only authorization URL and restores saved login", async () => {
  const f = await fixture();
  try {
    expect((await f.login.status()).status).toBe("signed_out");
    await Promise.all([f.login.start(), f.login.start()]);
    await vi.waitFor(async () => {
      expect((await f.login.status()).authorizationUrl).toContain(
        "https://auth.openai.com/oauth/authorize?",
      );
    });
    expect(await readFile(join(f.root, "starts"), "utf8")).toBe("1");
    await vi.waitFor(async () =>
      expect((await f.login.status()).status).toBe("authenticated"),
    );
    expect((await new CodexLogin(join(f.root, "codex")).status()).status).toBe(
      "authenticated",
    );
    expect((await f.login.status()).authorizationUrl).toBeNull();
  } finally {
    await f.dispose();
  }
});

test("failed login redacts CLI diagnostics and permits retry", async () => {
  const f = await fixture("fail");
  try {
    await f.login.start();
    await vi.waitFor(async () =>
      expect((await f.login.status()).status).toBe("error"),
    );
    expect(JSON.stringify(await f.login.status())).not.toContain("secret");
    await f.login.start();
    await vi.waitFor(async () =>
      expect(await readFile(join(f.root, "starts"), "utf8")).toBe("11"),
    );
  } finally {
    await f.dispose();
  }
});

test("cancel and timeout stop the pending login process", async () => {
  const f = await fixture("pending", 250);
  try {
    await f.login.start();
    await vi.waitFor(async () =>
      expect((await f.login.status()).error).toBe("login_expired"),
    );
    await f.login.start();
    await f.login.cancel();
    expect((await f.login.status()).status).toBe("signed_out");
  } finally {
    await f.dispose();
  }
});

test("missing Codex binary is reported without returning process errors", async () => {
  const login = new CodexLogin("/missing-codex-binary");
  expect((await login.status()).status).toBe("unavailable");
  expect((await login.start()).status).toBe("unavailable");
});

test("a slow status request cannot overwrite a newly started OAuth session", async () => {
  const f = await fixture("race");
  try {
    const previousStatus = f.login.status();
    await vi.waitFor(async () =>
      expect(await readFile(join(f.root, "status-count"), "utf8")).toBe("1"),
    );
    await f.login.start();
    await vi.waitFor(async () =>
      expect((await f.login.status()).status).toBe("waiting"),
    );
    await previousStatus;
    expect((await f.login.status()).status).toBe("waiting");
    expect((await f.login.status()).authorizationUrl).toContain(
      "https://auth.openai.com/oauth/authorize?",
    );
  } finally {
    await f.dispose();
  }
});
