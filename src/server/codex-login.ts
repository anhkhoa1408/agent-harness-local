import {
  CODEX_LOGIN_TIMEOUT_MS,
  CODEX_LOGIN_STATUS_TIMEOUT_MS,
  CLI_STATUS_MAX_BUFFER_BYTES,
  MAX_LOGIN_OUTPUT_CHARACTERS,
} from "./limits";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
export type LoginState = {
  status:
    | "signed_out"
    | "starting"
    | "waiting"
    | "authenticated"
    | "error"
    | "unavailable";
  authorizationUrl: string | null;
  error: string | null;
};
export type LoginService = Pick<CodexLogin, "status" | "start" | "cancel">;
const state = (
  status: LoginState["status"],
  error: string | null = null,
): LoginState => ({ status, authorizationUrl: null, error });

export class CodexLogin {
  private current = state("signed_out");
  private starting: Promise<LoginState> | null = null;
  private pending: {
    child: ChildProcess;
    closed: Promise<void>;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  constructor(
    private binary = process.env.CODEX_BIN ?? "codex",
    private timeoutMs = CODEX_LOGIN_TIMEOUT_MS,
  ) {}

  async status(): Promise<LoginState> {
    if (this.pending || this.starting) return { ...this.current };
    try {
      await exec(this.binary, ["login", "status"], {
        timeout: CODEX_LOGIN_STATUS_TIMEOUT_MS,
        maxBuffer: CLI_STATUS_MAX_BUFFER_BYTES,
      });
      if (this.pending) return { ...this.current };
      this.current = state("authenticated");
    } catch (error) {
      if (this.pending) return { ...this.current };
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        this.current = state("unavailable", "codex_unavailable");
      else if (this.current.status !== "error")
        this.current = state("signed_out");
    }
    return { ...this.current };
  }

  start(): Promise<LoginState> {
    if (this.starting) return this.starting;
    if (this.pending) return Promise.resolve({ ...this.current });
    this.starting = this.begin().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async begin(): Promise<LoginState> {
    // Do not invalidate a valid saved session or launch a second OAuth callback server.
    const existing = await this.status();
    if (["authenticated", "unavailable"].includes(existing.status))
      return existing;
    this.current = state("starting");
    const child = spawn(
      this.binary,
      ["login", "-c", 'cli_auth_credentials_store="file"'],
      { stdio: ["ignore", "pipe", "pipe"], shell: false },
    );
    let output = "";
    const receive = (chunk: Buffer) => {
      output = (output + chunk.toString())
        .replace(/\x1b\[[0-9;]*m/g, "")
        .slice(-MAX_LOGIN_OUTPUT_CHARACTERS);
      const match =
        /https:\/\/auth\.openai\.com\/oauth\/authorize\?[^\s]+(?=\s)/.exec(
          output,
        );
      if (!match) return;
      try {
        const url = new URL(match[0]);
        const redirect = url.searchParams.get("redirect_uri");
        if (
          ![
            "http://127.0.0.1:1455/auth/callback",
            "http://localhost:1455/auth/callback",
          ].includes(redirect ?? "") ||
          !url.searchParams.get("state") ||
          !url.searchParams.get("code_challenge")
        )
          return;
        this.current = {
          status: "waiting",
          authorizationUrl: url.href,
          error: null,
        };
      } catch {
        /* Wait for a complete URL; never return raw CLI output. */
      }
    };
    child.stdout!.on("data", receive);
    child.stderr!.on("data", receive);
    const timer = setTimeout(() => {
      this.current = state("error", "login_expired");
      child.kill("SIGTERM");
    }, this.timeoutMs);
    timer.unref();
    const closed = new Promise<void>((resolve) => {
      child.once("error", () => {
        this.current = state("unavailable", "codex_unavailable");
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (this.pending?.child === child) {
          this.pending = null;
          if (!["error", "unavailable"].includes(this.current.status))
            this.current =
              code === 0
                ? state("authenticated")
                : state("error", "login_failed");
        }
        resolve();
      });
    });
    this.pending = { child, timer, closed };
    return { ...this.current };
  }

  async cancel(): Promise<LoginState> {
    await this.starting;
    const pending = this.pending;
    if (pending) {
      this.pending = null;
      clearTimeout(pending.timer);
      this.current = state("signed_out");
      pending.child.kill("SIGTERM");
      await pending.closed;
    }
    return this.status();
  }
}
const globalState = globalThis as typeof globalThis & {
  codexLogin?: CodexLogin;
};
export const getCodexLogin = () =>
  (globalState.codexLogin ??= new CodexLogin());
