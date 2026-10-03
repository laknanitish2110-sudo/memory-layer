import type { MiddlewareHandler } from "hono";

let counter = 0;

export const requestId: MiddlewareHandler = async (c, next) => {
  const id = `req_${Date.now()}_${String(++counter).padStart(6, "0")}`;
  c.set("requestId", id);
  await next();
};
