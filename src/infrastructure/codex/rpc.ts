import { RPC_REQUEST_TIMEOUT_MS } from "./limits";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
export type RuntimeThread = {
  id: string;
  parentThreadId?: string;
  path?: string | null;
  status?: { type: string };
  turns: Array<{
    id: string;
    status: string;
    items: Array<{ type: string; phase?: string; text?: string }>;
  }>;
};
export type ThreadResponse = {
  thread: RuntimeThread;
  turn: { id: string };
  model: string;
  reasoningEffort?: string;
  cwd: string;
  approvalPolicy: string;
  sandbox?: { type: string; networkAccess: boolean };
};
export type RpcMessage = {
  id?: number | string;
  method?: string;
  // Notifications and approval requests carry method-specific, experimental wire payloads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
  result?: unknown;
  error?: { code: number; message: string };
};
export class RpcRemoteError extends Error {}
export class JsonRpc {
  private sequence = 0;
  private closed = false;
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private listeners = new Set<(m: RpcMessage) => void>();
  private failures = new Set<(error: Error) => void>();
  private reader: ReturnType<typeof createInterface>;
  constructor(
    output: Readable,
    private input: Writable,
  ) {
    this.reader = createInterface({ input: output });
    this.reader.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const m = JSON.parse(line) as RpcMessage;
        if (m.method) {
          for (const listener of this.listeners) listener(m);
          return;
        }
        const entry =
          typeof m.id === "number" ? this.pending.get(m.id) : undefined;
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(m.id as number);
        if (m.error) entry.reject(new RpcRemoteError(m.error.message));
        else entry.resolve(m.result);
      } catch {
        this.fail(new Error("runtime_invalid_message"));
      }
    });
    this.reader.on("close", () => this.fail(new Error("runtime_disconnected")));
    output.on("error", () => this.fail(new Error("runtime_disconnected")));
    input.on("error", () => this.fail(new Error("runtime_disconnected")));
  }
  request<T = ThreadResponse>(
    method: string,
    params: unknown,
    timeoutMs = RPC_REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    if (this.closed) return Promise.reject(new Error("runtime_disconnected"));
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`runtime_request_timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      this.send({ id, method, params });
    });
  }
  notify(method: string, params?: unknown) {
    this.send({ method, params });
  }
  respond(id: number | string, result: unknown) {
    this.send({ id, result });
  }
  onMessage(listener: (m: RpcMessage) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  onFailure(listener: (e: Error) => void) {
    this.failures.add(listener);
    return () => {
      this.failures.delete(listener);
    };
  }
  private send(message: unknown) {
    if (this.closed) throw new Error("runtime_disconnected");
    this.input.write(JSON.stringify(message) + "\n");
  }
  fail(error: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    for (const listener of this.failures) listener(error);
  }
  close() {
    this.fail(new Error("runtime_disconnected"));
    this.reader.close();
    this.listeners.clear();
    this.failures.clear();
  }
}
