import { readSession } from "../local-session";
import { json } from "../http-response";
import type { HttpRouteContext, HttpResourceRoute } from "../route-context";
export function createSystemRoute(
  context: HttpRouteContext,
): HttpResourceRoute {
  const { dashboard, system, sessions } = context;
  return async (request, url, parts) => {
    const method = request.method;
    if (parts[0] === "codex-auth") {
      if (!parts[1] && method === "GET")
        return json(await system.loginStatus());
      if (!parts[1] && method === "POST")
        return json(await system.startLogin());
      if (parts[1] === "cancel" && method === "POST")
        return json(await system.cancelLogin());
    }
    if (parts[0] === "session" && method === "GET")
      return json({ csrf: readSession(request, sessions)!.csrf });
    if (parts[0] === "health" && method === "GET")
      return json(dashboard.health());
    if (parts[0] === "approvals" && !parts[1] && method === "GET")
      return json(dashboard.approvals());
    if (parts[0] === "models" && method === "GET") {
      try {
        return json({ models: await system.models(), auth: "connected" });
      } catch {
        return json(
          { models: [], auth: "unavailable", error: "codex_unavailable" },
          503,
        );
      }
    }
  };
}
