import { ApplicationErrorCode } from "../../../application/constants/index";
import { HttpStatus } from "../constants/http-status";
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
        if (
          error instanceof Error &&
          error.message === ApplicationErrorCode.REPOSITORY_BUSY
        )
          return json(
            {
              error: ApplicationErrorCode.REPOSITORY_BUSY,
              details: [
                "Dừng task và xác nhận tiến trình đã dừng trước khi gỡ repository.",
              ],
            },
            HttpStatus.CONFLICT,
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
        if (code === ApplicationErrorCode.FOLDER_PICKER_BUSY)
          return json({ error: code }, HttpStatus.CONFLICT);
        if (code === ApplicationErrorCode.FOLDER_PICKER_UNSUPPORTED)
          return json({ error: code }, 501);
        return json(
          { error: ApplicationErrorCode.FOLDER_PICKER_FAILED },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
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
        return json(
          await repositoryService.registerRepository(input),
          HttpStatus.CREATED,
        );
      }
    }
  };
}
