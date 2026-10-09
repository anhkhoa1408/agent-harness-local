import { z } from "zod";

import { json } from "../http-response";
import type { HttpRouteContext, HttpResourceRoute } from "../route-context";
export function createRepositoriesRoute(
  context: HttpRouteContext,
): HttpResourceRoute {
  const { repositoryService, system } = context;
  return async (request, url, parts, body) => {
    const method = request.method;
    if (
      parts[0] === "repositories" &&
      parts[1] &&
      parts.length === 2 &&
      method === "DELETE"
    ) {
      try {
        const deletedTasks = repositoryService.remove(parts[1]);
        return json({ deletedTasks });
      } catch (error) {
        if (error instanceof Error && error.message === "repository_busy")
          return json(
            {
              error: "repository_busy",
              details: [
                "Dừng task và xác nhận tiến trình đã dừng trước khi gỡ repository.",
              ],
            },
            409,
          );
        throw error;
      }
    }
    if (
      parts[0] === "repositories" &&
      parts[1] === "pick-folder" &&
      parts.length === 2 &&
      method === "POST"
    ) {
      try {
        return json({ path: await system.pickFolder() });
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code === "folder_picker_busy") return json({ error: code }, 409);
        if (code === "folder_picker_unsupported")
          return json({ error: code }, 501);
        return json({ error: "folder_picker_failed" }, 503);
      }
    }
    if (parts[0] === "repositories" && !parts[1]) {
      if (method === "GET") return json(repositoryService.list());
      if (method === "POST") {
        const input = z
          .object({
            path: z.string().min(1),
            baseBranch: z.string().min(1),
            remote: z.string().nullable(),
          })
          .parse(await body());
        return json(await repositoryService.registerRepository(input), 201);
      }
    }
  };
}
