import { errorMessage } from "../../application/utils/index";
import { HttpStatus } from "./constants/http-status";
import { ApplicationErrorCode } from "../../application/constants/index";
import { z } from "zod";

import { RepositoryRegistrationError } from "../../application/repositories";

export const json = (body: unknown, status = HttpStatus.OK) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
export function httpErrorResponse(error: unknown): Response {
  if (error instanceof RepositoryRegistrationError)
    return json(
      { error: error.code, details: [error.message] },
      HttpStatus.BAD_REQUEST,
    );
  if (error instanceof z.ZodError)
    return json(
      {
        error: "invalid_input",
        details: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      HttpStatus.BAD_REQUEST,
    );
  const message = errorMessage(error, "request_failed");
  if (message.includes("not_found"))
    return json({ error: "not_found" }, HttpStatus.NOT_FOUND);
  if (message.includes("conflict"))
    return json(
      { error: ApplicationErrorCode.REVISION_CONFLICT },
      HttpStatus.CONFLICT,
    );
  return json(
    {
      error:
        message.startsWith("model_") || message.startsWith("effort_")
          ? message
          : "request_failed",
    },
    HttpStatus.BAD_REQUEST,
  );
}
