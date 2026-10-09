import type {ApplicationStore} from "../ports";
import type {RuntimePort} from "../runtime";
import type { Task } from "../../domain/contracts";
import type { AgentExecutionPort, AgentEvent } from "./contracts";
import { APPROVAL_POLL_INTERVAL_MS } from "../pipeline/limits";
export class ApprovalBroker {
  private poll?:()=>void;
  private readonly pending = new Set<string>();
  constructor(
    private readonly store:ApplicationStore,
    private readonly client: Pick<AgentExecutionPort, "respondToApproval">,
    private readonly task: Task,
    private readonly runtime:RuntimePort,
    private readonly supports:(method:string)=>boolean,
  ) {}
  start() {
    const { store, client } = this;
    this.poll = this.runtime.every(APPROVAL_POLL_INTERVAL_MS,() => {
      for (const key of this.pending) {
        const grant = store.approvals.get(key);
        if (grant?.decision) {
          this.pending.delete(key);
          client
            .respondToApproval(grant.requestId, { decision: grant.decision })
            .catch(() => {});
        }
      }
    });
  }
  handleRequest(request: Extract<AgentEvent, { type: "approval" }>["data"]) {
    const { store, client, task } = this;
    if (task.executionMode === "auto") {
      void client.respondToApproval(request.requestId, { decision: "decline" });
      store.events.add(task.id, "approval.auto_declined", {
        method: request.method,
      });
      return;
    }
    const key = `${task.id}:${String(request.requestId)}`;
    if (!this.supports(request.method)) {
      void client.respondToApproval(request.requestId, { decision: "decline" });
      store.events.add(task.id, "approval.unsupported", {
        method: request.method,
      });
      return;
    }
    store.approvals.put(key, {
      id: key,
      taskId: task.id,
      ...request,
      decision: null,
    });
    this.pending.add(key);
    store.events.add(task.id, "approval.requested", {
      id: key,
      method: request.method,
    });
  }
  dispose() {
    if (this.poll) this.poll();
    for (const key of this.pending) this.store.approvals.delete(key);
  }
}
