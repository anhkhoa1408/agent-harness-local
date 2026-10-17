import { ApplicationErrorCode, EventType } from "../constants/index";
import { TaskStatus } from "../../domain/constants/task-status";
import type { PlanService } from "../planning";
import type { StoryService } from "../stories";
import type { ApplicationStore } from "../ports";
import type { RuntimePort } from "../runtime";
import type { ValidationPort } from "../validation";
import type { ControlCommand } from "../../domain/contracts";
import type { ActiveStageAttempt } from "../pipeline-contracts";
import { processTaskControl } from "./task-control";
import { processPlanControl } from "./plan-control";

export function processControlCommand(
  store: ApplicationStore,
  storyService: StoryService,
  planService: PlanService,
  active: ActiveStageAttempt | null,
  c: ControlCommand,
  validation: ValidationPort,
  runtime: RuntimePort,
) {
  try {
    const task = store.tasks.get(c.taskId);
    if (task.revision !== c.expectedRevision)
      throw new Error(ApplicationErrorCode.REVISION_CONFLICT);
    if (
      [TaskStatus.COMPLETED, TaskStatus.CANCELLED].some(
        (value) => value === task.status,
      )
    )
      throw new Error(ApplicationErrorCode.TERMINAL_TASK);
    if (
      c.kind === "pause" ||
      c.kind === "cancel" ||
      c.kind === "configure" ||
      c.kind === "resume" ||
      c.kind === "start"
    ) {
      processTaskControl(
        store,
        storyService,
        active,
        task,
        c,
        validation,
        runtime,
      );
    } else if (
      c.kind === "approve" ||
      c.kind === "comment" ||
      c.kind === "revise" ||
      c.kind === "answer"
    ) {
      processPlanControl(
        store,
        storyService,
        planService,
        task,
        c,
        validation,
        runtime,
      );
    } else if (c.kind === "grant") {
      const payload = c.payload as { id: string; decision: string };
      const approval = store.approvals.get(payload.id);
      if (
        !approval ||
        approval.taskId !== task.id ||
        approval.decision ||
        !["accept", "decline"].includes(payload.decision)
      )
        throw new Error(ApplicationErrorCode.APPROVAL_REQUEST_EXPIRED);
      store.approvals.put(payload.id, {
        ...approval,
        decision: payload.decision,
      });
    } else throw new Error(ApplicationErrorCode.APPROVAL_REQUEST_EXPIRED);
    store.commands.finish(c.id, { ok: true });
  } catch (error) {
    store.commands.finish(c.id, { error: String(error) });
    store.events.add(c.taskId, EventType.COMMAND_REJECTED, {
      commandId: c.id,
      error: String(error),
    });
  }
}
