import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

// Requires Docker and the image built by `docker compose build`.
test.skipIf(process.env.HARNESS_DOCKER_SANDBOX_TEST !== "1")(
  "Docker permits Codex sandbox startup while read-only and network restrictions remain enforced",
  async () => {
    const { stdout } = await promisify(execFile)(
      "docker",
      [
        "run",
        "--rm",
        "--network",
        "none",
        "--tmpfs",
        "/codex",
        "--security-opt",
        `seccomp=${resolve("config/docker-seccomp.json")}`,
        "--entrypoint",
        "codex",
        "agent-harness-local-harness",
        "sandbox",
        "--",
        "python3",
        "-c",
        `
import pathlib, socket
assert pathlib.Path('/etc/hostname').read_text().strip()
try:
    pathlib.Path('/app/sandbox-must-not-write').write_text('bad')
except OSError as error:
    assert error.errno in (13, 30), error
else:
    raise AssertionError('read-only sandbox allowed a write')
try:
    socket.socket(socket.AF_INET, socket.SOCK_STREAM)
except PermissionError:
    pass
else:
    raise AssertionError('sandbox allowed a network socket')
print('sandbox-enforced')
`,
      ],
      { timeout: 30_000 },
    );
    expect(stdout.trim()).toBe("sandbox-enforced");
  },
  35_000,
);
