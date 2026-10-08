import type { Context } from "hono";
import type { AppContext } from "../context.js";
import { ApiError } from "../errors/api-error.js";
import { refreshTokenFamily } from "@memory-layer/protocol/src/credentials/token-family.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

export interface RefreshTokenDecoder {
  decode(token: string): { family_id: string; generation: number } | null;
}

export function makeTokenHandlers(ctx: AppContext, decoder: RefreshTokenDecoder) {
  return {
    refresh: async (c: Context) => {
      const requestId = c.get("requestId");

      // IP-based rate limiting for unauthenticated token refresh (M13)
      const clientIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const refreshLimit = checkRateLimit(`refresh:${clientIp}`, { windowMs: 60_000, maxRequests: 10 });
      if (!refreshLimit.allowed) {
        c.header("Retry-After", String(Math.ceil((refreshLimit.resetAt - Date.now()) / 1000)));
        c.header("X-RateLimit-Remaining", "0");
        c.header("X-RateLimit-Reset", String(Math.ceil(refreshLimit.resetAt / 1000)));
        return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests. Try again later.", request_id: requestId } }, 429);
      }
      c.header("X-RateLimit-Remaining", String(refreshLimit.remaining));
      c.header("X-RateLimit-Reset", String(Math.ceil(refreshLimit.resetAt / 1000)));

      const body = await c.req.json().catch(() => {
        throw new ApiError(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
      });

      if (!body.refresh_token) {
        throw new ApiError(400, "VALIDATION_ERROR", "refresh_token is required", requestId);
      }

      const decoded = decoder.decode(body.refresh_token);
      if (!decoded) {
        throw new ApiError(401, "TOKEN_INVALID", "Invalid refresh token", requestId);
      }

      const now = new Date().toISOString();
      const result = await refreshTokenFamily(
        ctx.stores.tokenFamilies,
        ctx.tokenIssuer,
        decoded.family_id,
        decoded.generation,
        now
      );

      if (result.status === "reuse_detected") {
        throw new ApiError(401, "TOKEN_REUSE_DETECTED", "Token reuse detected. Token family revoked.", requestId);
      }

      return c.json({
        data: {
          access_token: result.access_token.token_hash,
          access_token_expires_at: result.access_token.expires_at,
          refresh_token: result.refresh_token.token_hash,
          token_type: "Bearer",
        },
        meta: { request_id: requestId, policy_version: "v0.1.0" },
      });
    },
  };
}
