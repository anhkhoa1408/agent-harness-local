import { json } from "../http-response";
import type { HttpRouteContext, HttpResourceRoute } from "../route-context";
export function createArtifactsRoute(
  context: HttpRouteContext,
): HttpResourceRoute {
  const { artifactService } = context;
  return async (request, url, parts) => {
    const method = request.method;
    if (parts[0] === "artifacts" && method === "GET") {
      let file;
      try {
        file = await artifactService.read(parts[1]);
      } catch (error) {
        if (error instanceof Error && error.message === "artifact_not_found")
          return json({ error: "artifact_not_found" }, 404);
        if (error instanceof Error && error.message === "artifact_too_large")
          return json({ error: "artifact_too_large" }, 400);
        throw error;
      }
      const screenshot = file.screenshot;
      return new Response(file.body, {
        headers: {
          "content-type": screenshot
            ? "image/png"
            : "text/plain; charset=utf-8",
          "content-security-policy": "default-src 'none'; sandbox",
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        },
      });
    }
  };
}
