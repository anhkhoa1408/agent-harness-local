import { PROCESS_KILL_GRACE_MS } from "./limits";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CommandSpec } from "../core/contracts";
import { contained } from "../context/rules";
export type ProcessResult = {
  exitCode: number | null;
  signal: string | null;
  stdoutPath: string;
  stderrPath: string;
  timedOut: boolean;
};
export async function runProcess(
  command: CommandSpec,
  root: string,
  artifacts: string,
  signal: AbortSignal,
): Promise<ProcessResult> {
  const cwd = await contained(root, command.cwd);
  if (signal.aborted) throw new Error("interrupted");
  await mkdir(artifacts, { recursive: true });
  const id = randomUUID(),
    stdoutPath = join(artifacts, `${id}.stdout.log`),
    stderrPath = join(artifacts, `${id}.stderr.log`);
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
    LANG: "en_US.UTF-8",
    CI: "1",
    NODE_ENV: process.env.NODE_ENV ?? "test",
  };
  for (const name of command.envNames) {
    if (/^(NODE_OPTIONS|LD_|DYLD_)/.test(name))
      throw new Error("unsafe_environment");
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  const out = createWriteStream(stdoutPath, { mode: 0o600 }),
    err = createWriteStream(stderrPath, { mode: 0o600 });
  const child = spawn(command.executable, command.args, {
    cwd,
    env,
    shell: false,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(out);
  child.stderr.pipe(err);
  let timedOut = false,
    killer: NodeJS.Timeout | undefined;
  const kill = (sig: NodeJS.Signals) => {
    if (child.pid)
      try {
        process.kill(-child.pid, sig);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
  };
  const stop = () => {
    kill("SIGTERM");
    killer ??= setTimeout(() => kill("SIGKILL"), PROCESS_KILL_GRACE_MS);
  };
  signal.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, command.timeoutMs);
  try {
    const result = await new Promise<{
      exitCode: number | null;
      signal: string | null;
    }>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (exitCode, signal) => {
        kill("SIGTERM");
        resolve({ exitCode, signal });
      });
    });
    // A child may exit while a grandchild still holds its pipes. Bound that cleanup too.
    killer ??= setTimeout(() => kill("SIGKILL"), PROCESS_KILL_GRACE_MS);
    await Promise.all([finished(out), finished(err)]);
    kill("SIGKILL");
    return { ...result, stdoutPath, stderrPath, timedOut };
  } finally {
    clearTimeout(timer);
    if (killer) clearTimeout(killer);
    signal.removeEventListener("abort", stop);
    out.end();
    err.end();
  }
}
