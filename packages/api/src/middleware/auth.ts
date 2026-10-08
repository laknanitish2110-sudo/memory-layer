import type { MiddlewareHandler } from "hono";
import { ApiError } from "../errors/api-error.js";
import type { AppAuthContext, UserAuthContext, AppContext } from "../context.js";
import { checkRateLimit } from "./rate-limit.js";

export interface TokenClaims {
  binding_id: string;
  family_id: string;
  passport_id: string;
  generation: number;
  issued_at: string;
  expires_at: string;
}

export interface TokenValidator {
  validateAppToken(token: string): TokenClaims | null;
  validateUserToken(token: string): { passport_id: string; account_id: string } | null;
}

export function appAuth(validator: TokenValidator, appCtx: AppContext): MiddlewareHandler {
  return async (c, next) => {
    const requestId = c.get("requestId") ?? "req_unknown";
    const authHeader = c.req.header("Authorization");

    if (!authHeader) {
      throw new ApiError(401, "TOKEN_INVALID", "Missing Authorization header", requestId);
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new ApiError(401, "TOKEN_INVALID", "Malformed Authorization header", requestId);
    }

    const token = parts[1];
    const claims = validator.validateAppToken(token);
    if (!claims) {
      throw new ApiError(401, "TOKEN_INVALID", "Invalid access token", requestId);
    }

    const now = new Date().toISOString();
    if (claims.expires_at && new Date(claims.expires_at) < new Date(now)) {
      throw new ApiError(401, "TOKEN_EXPIRED", "Access token expired", requestId);
    }

    const binding = await appCtx.stores.bindings.getBinding(claims.binding_id);
    if (!binding) {
      throw new ApiError(401, "TOKEN_INVALID", "Binding not found", requestId);
    }

    const grant = await appCtx.stores.grants.getActiveGrantForBinding(claims.binding_id);
    if (!grant) {
      throw new ApiError(401, "TOKEN_INVALID", "No active grant", requestId);
    }

    const authContext: AppAuthContext = {
      type: "app",
      passportId: binding.passport_id,
      bindingId: binding.id,
      grantId: grant.id,
      bindingRevision: binding.revision,
      binding,
      grant,
    };

    c.set("auth", authContext);

    // Set passport scope for RLS enforcement (defense-in-depth)
    if (appCtx.setPassportScope) {
      await appCtx.setPassportScope(binding.passport_id);
    }

    // Per-binding rate limiting for authenticated endpoints (M14)
    const apiLimit = checkRateLimit(`api:${binding.id}`, { windowMs: 60_000, maxRequests: 120 });
    if (!apiLimit.allowed) {
      c.header("Retry-After", String(Math.ceil((apiLimit.resetAt - Date.now()) / 1000)));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil(apiLimit.resetAt / 1000)));
      return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests. Try again later.", request_id: requestId } }, 429);
    }
    c.header("X-RateLimit-Remaining", String(apiLimit.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(apiLimit.resetAt / 1000)));

    await next();
  };
}

export function userAuth(validator: TokenValidator, appCtx?: AppContext): MiddlewareHandler {
  return async (c, next) => {
    const requestId = c.get("requestId") ?? "req_unknown";
    const authHeader = c.req.header("Authorization");

    if (!authHeader) {
      throw new ApiError(401, "TOKEN_INVALID", "Missing Authorization header", requestId);
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new ApiError(401, "TOKEN_INVALID", "Malformed Authorization header", requestId);
    }

    const token = parts[1];
    const userClaims = validator.validateUserToken(token);
    if (!userClaims) {
      throw new ApiError(401, "TOKEN_INVALID", "Invalid user session token", requestId);
    }

    const authContext: UserAuthContext = {
      type: "user",
      passportId: userClaims.passport_id,
      accountId: userClaims.account_id,
    };

    c.set("auth", authContext);

    // Set passport scope for RLS enforcement (defense-in-depth)
    if (appCtx?.setPassportScope) {
      await appCtx.setPassportScope(userClaims.passport_id);
    }

    await next();
  };
}
