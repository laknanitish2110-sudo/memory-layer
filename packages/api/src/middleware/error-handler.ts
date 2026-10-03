import type { ErrorHandler } from "hono";
import { ApiError } from "../errors/api-error.js";

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get("requestId") ?? "req_unknown";

  if (err instanceof ApiError) {
    return c.json(err.toJSON(), err.status as any);
  }

  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred",
        request_id: requestId,
      },
    },
    500
  );
};
