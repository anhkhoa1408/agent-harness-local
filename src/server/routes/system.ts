import { WORKER_LEASE_TTL_MS } from "../../core/limits";

import { readSession } from "../local-session";

import { json } from "../http-response";
import type { HttpRouteContext, HttpResourceRoute } from "../route-context";
export function createSystemRoute(
  context: HttpRouteContext,
): HttpResourceRoute {
  const { store, models, login } = context;
  return async (request, url, parts, body) => {
    const method = request.method;
    if (parts[0] === "codex-auth") {
      if (!parts[1] && method === "GET") return json(await login.status());
      if (!parts[1] && method === "POST") return json(await login.start());
      if (parts[1] === "cancel" && method === "POST")
        return json(await login.cancel());
    }
    if (parts[0] === "session" && method === "GET")
      return json({ csrf: readSession(request, store)!.csrf });
    if (parts[0] === "health" && method === "GET") {
      const lease = store.getRecord("health", "worker") as {
        at: number;
      } | null;
      return json({
        app: "ready",
        worker:
          lease && Date.now() - lease.at < WORKER_LEASE_TTL_MS
            ? "online"
            : "offline",
        heartbeat: lease?.at ?? null,
      });
    }
    if (parts[0] === "models" && method === "GET") {
      try {
        return json({ models: await models(), auth: "connected" });
      } catch {
        return json(
          { models: [], auth: "unavailable", error: "codex_unavailable" },
          503,
        );
      }
    }
  };
}
