import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test.skipIf(process.env.HARNESS_DOCKER_RUNTIME_TEST !== "1")(
  "Docker provides a working SSH client for Git SSH remotes",
  async () => {
    const { stdout } = await promisify(execFile)("docker", [
      "run", "--rm", "--network", "none", "--entrypoint", "ssh",
      "agent-harness-local-harness", "-G", "git@github.com",
    ], { timeout: 30_000 });
    expect(stdout).toContain("hostname github.com");
    expect(stdout).toContain("user git");
    expect(stdout).toContain("port 22");
  },
  35_000,
);

test.skipIf(process.env.HARNESS_DOCKER_SSH_AGENT_TEST !== "1")(
  "running Harness can use the host SSH agent without mounting private keys",
  async () => {
    const run = promisify(execFile);
    const { stdout } = await run("docker", [
      "compose", "exec", "-T", "harness", "ssh-add", "-l",
    ], { timeout: 30_000 });
    expect(stdout).toMatch(/SHA256:/);
    const inspection = await run("docker", [
      "inspect", "agent-harness-local-harness-1",
    ]);
    const mounts = JSON.parse(inspection.stdout)[0].Mounts as { Destination: string; RW: boolean }[];
    expect(mounts).toContainEqual(expect.objectContaining({
      Destination: "/run/host-services/ssh-auth.sock", RW: false,
    }));
    expect(mounts).toContainEqual(expect.objectContaining({
      Destination: "/etc/ssh/ssh_known_hosts", RW: false,
    }));
    expect(mounts.some(m => m.Destination === "/root/.ssh" || m.Destination.includes("id_ed25519"))).toBe(false);
  },
  35_000,
);
