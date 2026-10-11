import { ApplicationErrorCode } from "../../../application/constants/index";
import { HttpStatus } from "../constants/http-status";
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
        if (
          error instanceof Error &&
          error.message === ApplicationErrorCode.ARTIFACT_NOT_FOUND
        )
          return json(
            { error: ApplicationErrorCode.ARTIFACT_NOT_FOUND },
            HttpStatus.NOT_FOUND,
          );
        if (
          error instanceof Error &&
          error.message === ApplicationErrorCode.ARTIFACT_TOO_LARGE
        )
          return json(
            { error: ApplicationErrorCode.ARTIFACT_TOO_LARGE },
            HttpStatus.BAD_REQUEST,
          );
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
