import { WORKER_LEASE_TTL_MS } from "../../core/limits";
import {
  pipelineProgress,
  type ProgressAttempt,
} from "../../core/pipeline-progress";
import { z } from "zod";

import { ControlCommandSchema } from "../../core/contracts";

import { gitText } from "../../repositories/inspect";

import { json } from "../http-response";
import type { HttpRouteContext, HttpResourceRoute } from "../route-context";
export function createTasksRoute(context: HttpRouteContext): HttpResourceRoute {
  const { store, storyService, planService, taskService } = context;
  return async (request, url, parts, body) => {
    const method = request.method;
    if (parts[0] === "tasks") {
      if (!parts[1]) {
        if (method === "GET") {
          const attempts = store.listRecords("attempt") as ProgressAttempt[];
          return json(
            store.listTasks().map((task) => ({
              ...task,
              pipeline: pipelineProgress(task, attempts),
            })),
          );
        }
        if (method === "POST") {
          return json(await taskService.createTask(await body()), 201);
        }
      }
      const task = store.getTask(parts[1]);
      if (parts[2] === "events" && method === "GET") {
        const after = z.coerce
          .number()
          .int()
          .nonnegative()
          .parse(url.searchParams.get("after") ?? 0);
        return json(store.events(task.id, after));
      }
      if (parts[2] === "commands" && method === "POST") {
        const command = ControlCommandSchema.parse({
          ...(await body()),
          taskId: task.id,
        });
        if (command.expectedRevision !== task.revision)
          return json({ error: "revision_conflict" }, 409);
        const health = store.getRecord("health", "worker") as {
          at: number;
        } | null;
        if (!health || Date.now() - health.at > WORKER_LEASE_TTL_MS)
          return json({ error: "worker_unavailable" }, 503);
        return json({ accepted: store.enqueue(command) }, 202);
      }
      if (!parts[2] && method === "GET") {
        let diff = "";
        if (task.worktree)
          try {
            diff = await gitText(task.worktree, [
              "diff",
              task.sourceCommit,
              "--",
            ]);
          } catch {
            diff = "Diff unavailable";
          }
        return json({
          task,
          stories: {
            execution: storyService.getExecution(task.id),
            runs: storyService.listStoryRuns(task.id),
          },
          pipeline: pipelineProgress(
            task,
            store.listRecords("attempt") as ProgressAttempt[],
          ),
          plan: store.getRecord("plan", `${task.id}:${task.planVersion}`),
          comments: planService.planComments(task.id),
          analysis: store.getRecord("analysis", task.id),
          checks: store.getRecord("checks", task.id),
          review: store.getRecord("review", task.id),
          acceptance: store.getRecord("acceptance", task.id),
          delivery: store.getRecord("delivery", task.id),
          runtime: store.getRecord("runtime", task.id),
          approvals: store
            .listRecords("approval")
            .filter((r: any) => r.taskId === task.id && !r.decision),
          artifacts: store
            .listRecords("artifact")
            .filter((r: any) => r.taskId === task.id)
            .map((r: any) => ({ id: r.id, type: r.type })),
          diff,
        });
      }
    }
  };
}
