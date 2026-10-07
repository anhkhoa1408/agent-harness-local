import { z } from "zod";

import { RepositoryRegistrationError } from "../repositories/inspect";

export const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
export function httpErrorResponse(error: unknown): Response {
  if (error instanceof RepositoryRegistrationError)
    return json({ error: error.code, details: [error.message] }, 400);
  if (error instanceof z.ZodError)
    return json(
      {
        error: "invalid_input",
        details: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      400,
    );
  const message = error instanceof Error ? error.message : "request_failed";
  if (message.includes("not_found")) return json({ error: "not_found" }, 404);
  if (message.includes("conflict"))
    return json({ error: "revision_conflict" }, 409);
  return json(
    {
      error:
        message.startsWith("model_") || message.startsWith("effort_")
          ? message
          : "request_failed",
    },
    400,
  );
}
