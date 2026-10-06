import { MAX_ARTIFACT_RESPONSE_BYTES } from "../limits";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { contained } from "../../context/rules";

import { json } from "../http-response";
import type { HttpRouteContext, HttpResourceRoute } from "../route-context";
export function createArtifactsRoute(
  context: HttpRouteContext,
): HttpResourceRoute {
  const { store, data } = context;
  return async (request, url, parts, body) => {
    const method = request.method;
    if (parts[0] === "artifacts" && method === "GET") {
      const record = store.getRecord("artifact", parts[1]) as {
        path: string;
        type?: string;
      } | null;
      if (!record) return json({ error: "artifact_not_found" }, 404);
      const path = await contained(join(data, "artifacts"), record.path);
      if ((await stat(path)).size > MAX_ARTIFACT_RESPONSE_BYTES)
        return json({ error: "artifact_too_large" }, 400);
      const screenshot = record.type === "screenshot";
      return new Response(
        screenshot ? await readFile(path) : await readFile(path, "utf8"),
        {
          headers: {
            "content-type": screenshot
              ? "image/png"
              : "text/plain; charset=utf-8",
            "content-security-policy": "default-src 'none'; sandbox",
            "x-content-type-options": "nosniff",
            "cache-control": "no-store",
          },
        },
      );
    }
  };
}
