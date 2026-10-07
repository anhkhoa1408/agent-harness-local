import { z } from "zod";

import { createServices } from "../services";

import { json } from "../http-response";
import type { HttpRouteContext, HttpResourceRoute } from "../route-context";
export function createRepositoriesRoute(
  context: HttpRouteContext,
): HttpResourceRoute {
  const { store, folderPicker } = context;
  return async (request, url, parts, body) => {
    const method = request.method;
    if (
      parts[0] === "repositories" &&
      parts[1] === "pick-folder" &&
      parts.length === 2 &&
      method === "POST"
    ) {
      try {
        return json({ path: await folderPicker() });
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code === "folder_picker_busy") return json({ error: code }, 409);
        if (code === "folder_picker_unsupported")
          return json({ error: code }, 501);
        return json({ error: "folder_picker_failed" }, 503);
      }
    }
    if (parts[0] === "repositories" && !parts[1]) {
      if (method === "GET") return json(store.listRecords("repository"));
      if (method === "POST") {
        const input = z
          .object({
            path: z.string().min(1),
            baseBranch: z.string().min(1),
            remote: z.string().nullable(),
          })
          .parse(await body());
        return json(await createServices(store).registerRepository(input), 201);
      }
    }
  };
}
