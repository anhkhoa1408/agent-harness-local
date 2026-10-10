import type { HttpRouteContext } from "./route-context";
import { MAX_REQUEST_BODY_SIZE } from "./limits";
import { authorize } from "./local-session";
import { json, httpErrorResponse } from "./http-response";
import { createSystemRoute } from "./routes/system";
import { createSettingsRoute } from "./routes/settings";
import { createRepositoriesRoute } from "./routes/repositories";
import { createTasksRoute } from "./routes/tasks";
import { createArtifactsRoute } from "./routes/artifacts";
export function createHttpHandler(context: HttpRouteContext) {
  const routes = [
    createSystemRoute(context),
    createSettingsRoute(context),
    createRepositoriesRoute(context),
    createTasksRoute(context),
    createArtifactsRoute(context),
  ];
  return async (request: Request): Promise<Response> => {
    if (!authorize(request, context.sessions))
      return json({ error: "origin_or_session_invalid" }, 403);
    const url = new URL(request.url),
      parts = url.pathname
        .slice("/api/".length)
        .split("/")
        .map(decodeURIComponent);
    const body = async () => {
      if (Number(request.headers.get("content-length")) > MAX_REQUEST_BODY_SIZE)
        throw new Error("body_too_large");
      const text = await request.text();
      if (text.length > MAX_REQUEST_BODY_SIZE)
        throw new Error("body_too_large");
      return JSON.parse(text);
    };
    try {
      for (const route of routes) {
        const response = await route(request, url, parts, body);
        if (response) return response;
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      return httpErrorResponse(error);
    }
  };
}
