import type { Store } from "../storage/store";
import type { Task } from "../core/contracts";
import type { AgentClient, AgentEvent } from "../codex/types";
import { APPROVAL_POLL_INTERVAL_MS } from "./limits";
export class ApprovalBroker {
  private poll?: NodeJS.Timeout;
  private readonly pending = new Set<string>();
  constructor(
    private readonly store: Pick<
      Store,
      "getRecord" | "putRecord" | "deleteRecord" | "addEvent"
    >,
    private readonly client: Pick<AgentClient, "respondToApproval">,
    private readonly task: Task,
  ) {}
  start() {
    const { store, client } = this;
    this.poll = setInterval(() => {
      for (const key of this.pending) {
        const grant = store.getRecord("approval", key) as {
          requestId: string | number;
          decision?: string;
        };
        if (grant.decision) {
          this.pending.delete(key);
          client
            .respondToApproval(grant.requestId, { decision: grant.decision })
            .catch(() => {});
        }
      }
    }, APPROVAL_POLL_INTERVAL_MS);
  }
  handleRequest(request: Extract<AgentEvent, { type: "approval" }>["data"]) {
    const { store, client, task } = this;
    if (task.executionMode === "auto") {
      void client.respondToApproval(request.requestId, { decision: "decline" });
      store.addEvent(task.id, "approval.auto_declined", {
        method: request.method,
      });
      return;
    }
    const key = `${task.id}:${String(request.requestId)}`;
    if (
      ![
        "item/commandExecution/requestApproval",
        "item/fileChange/requestApproval",
      ].includes(request.method)
    ) {
      void client.respondToApproval(request.requestId, { decision: "decline" });
      store.addEvent(task.id, "approval.unsupported", {
        method: request.method,
      });
      return;
    }
    store.putRecord("approval", key, {
      id: key,
      taskId: task.id,
      ...request,
      decision: null,
    });
    this.pending.add(key);
    store.addEvent(task.id, "approval.requested", {
      id: key,
      method: request.method,
    });
  }
  dispose() {
    if (this.poll) clearInterval(this.poll);
    for (const key of this.pending) this.store.deleteRecord("approval", key);
  }
}
