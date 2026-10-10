import { z } from "zod";
import { json } from "../http-response";
import type { HttpRouteContext, HttpResourceRoute } from "../route-context";
export function createTasksRoute(context: HttpRouteContext): HttpResourceRoute {
  const { dashboard, taskService } = context;
  return async (request, url, parts, body) => {
    const method = request.method;
    if (parts[0] !== "tasks") return;
    if (!parts[1]) {
      if (method === "GET") return json(dashboard.tasks());
      if (method === "POST")
        return json(await taskService.createTask(await body()), 201);
    }
    const task = dashboard.task(parts[1]);
    if (parts[2] === "events" && method === "GET") {
      const after = z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(url.searchParams.get("after") ?? 0);
      return json(dashboard.events(task.id, after));
    }
    if (parts[2] === "commands" && method === "POST") {
      const result = dashboard.acceptCommand(task.id, await body());
      return json(
        result,
        "error" in result
          ? result.error === "revision_conflict"
            ? 409
            : 503
          : 202,
      );
    }
    if (!parts[2] && method === "GET")
      return json(await dashboard.detail(task.id));
  };
}
