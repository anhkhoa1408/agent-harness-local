import { ROLLOUT_INITIAL_RETRY_DELAY_MS, ROLLOUT_MAX_RETRY_DELAY_MS } from "./limits";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

// thread/resume does not restore experimentalRawEvents on Codex 0.159.
// Local app-server returns its own durable rollout path; never use a repo-supplied path.
export async function durableSpawnEvidence(
  path: string | null,
  turnId: string,
  callId: string,
  timeoutMs: number,
): Promise<Map<string, any>> {
  if (!path) throw new Error("subagent_capability_unavailable");
  const deadline = Date.now() + timeoutMs;
  let delay = ROLLOUT_INITIAL_RETRY_DELAY_MS;
  for (;;) {
    const calls = new Map<string, any>();
    const stream = createReadStream(path, { encoding: "utf8" }),
      lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          continue;
        } // A final line can still be flushing.
        const item = record.payload;
        if (
          record.type === "response_item" &&
          item?.type === "function_call" &&
          item.name === "spawn_agent" &&
          item.internal_chat_message_metadata_passthrough?.turn_id === turnId
        )
          calls.set(item.call_id, JSON.parse(item.arguments));
      }
    } finally {
      lines.close();
      stream.destroy();
    }
    if (calls.has(callId)) return calls;
    if (Date.now() >= deadline) throw new Error("subagent_evidence_missing");
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(delay, deadline - Date.now())),
    );
    delay = Math.min(delay * 2, ROLLOUT_MAX_RETRY_DELAY_MS);
  }
}
