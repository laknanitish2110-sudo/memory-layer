import { Hono } from "hono";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { appAuth, userAuth, type TokenValidator } from "./middleware/auth.js";
import { makeObservationHandlers } from "./routes/observations.js";
import { makeContextHandlers } from "./routes/context.js";
import { makeClaimHandlers, makeUserClaimHandlers } from "./routes/claims.js";
import { makeTokenHandlers, type RefreshTokenDecoder } from "./routes/tokens.js";
import type { AppContext, AppAuthContext, UserAuthContext } from "./context.js";
import { ApiError } from "./errors/api-error.js";

export interface CreateAppOptions {
  appContext: AppContext;
  tokenValidator: TokenValidator;
  refreshTokenDecoder: RefreshTokenDecoder;
}

export function createApp(options: CreateAppOptions): Hono {
  const { appContext: ctx, tokenValidator, refreshTokenDecoder } = options;
  const app = new Hono();

  // Global middleware
  app.use("*", requestId);
  app.onError(errorHandler);

  app.use("*", async (c, next) => {
    if (c.req.method === "POST") {
      const ct = c.req.header("Content-Type");
      if (!ct || !ct.includes("application/json")) {
        throw new ApiError(400, "VALIDATION_ERROR", "Content-Type must be application/json", c.get("requestId"));
      }
    }
    await next();
  });

  app.use("/v1/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
    c.header("Pragma", "no-cache");
  });

  const uAuth = userAuth(tokenValidator, ctx);
  const aAuth = appAuth(tokenValidator, ctx);

  // Build handlers
  const obs = makeObservationHandlers(ctx);
  const ctxH = makeContextHandlers(ctx);
  const claims = makeClaimHandlers(ctx);
  const userClaims = makeUserClaimHandlers(ctx);
  const tokens = makeTokenHandlers(ctx, refreshTokenDecoder);

  // ── Passports (user auth) ─────────────────────────────

  app.post("/v1/passports", uAuth, async (c) => {
    const auth = c.get("auth") as UserAuthContext;
    const rid = c.get("requestId");
    const body = await c.req.json().catch(() => { throw new ApiError(400, "VALIDATION_ERROR", "Invalid JSON body", rid); });

    return c.json({
      data: {
        id: ctx.generateId("psp"), account_id: auth.accountId, name: body.name ?? "Default",
        created_at: ctx.now(), is_ephemeral: body.is_ephemeral ?? false, binding_ids: [], bridge_ids: [],
      },
      meta: { request_id: rid, policy_version: "v0.1.0" },
    }, 201);
  });

  app.get("/v1/passports", uAuth, async (c) => {
    return c.json({ data: [], meta: { request_id: c.get("requestId"), policy_version: "v0.1.0" } });
  });

  // ── Bindings ──────────────────────────────────────────

  app.post("/v1/bindings", uAuth, async (c) => {
    const auth = c.get("auth") as UserAuthContext;
    const rid = c.get("requestId");
    const body = await c.req.json().catch(() => { throw new ApiError(400, "VALIDATION_ERROR", "Invalid JSON body", rid); });

    if (!body.passport_id || !body.app_principal_id) {
      throw new ApiError(400, "VALIDATION_ERROR", "passport_id and app_principal_id are required", rid);
    }

    const bindingId = ctx.generateId("bnd");
    const grantId = ctx.generateId("grt");
    const now = ctx.now();

    const binding = {
      id: bindingId, passport_id: body.passport_id, app_principal_id: body.app_principal_id,
      status: "active" as const, current_grant_id: grantId, revision: 1, created_at: now,
      suspended_at: null, revoked_at: null, suspension_type: null,
    };
    await ctx.stores.bindings.createBinding(binding);

    const grant = {
      id: grantId, binding_id: bindingId, version: 1,
      capabilities: body.requested_capabilities ?? ["read_context"],
      data_policy: {
        read: { categories: body.requested_read_categories ?? ["skills"], sensitivity_ceiling: body.requested_read_sensitivity_ceiling ?? "personal" },
        write: {
          categories: body.requested_write_categories ?? [],
          sensitivity_ceiling: body.requested_write_sensitivity_ceiling ?? "personal",
          rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 },
          semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 },
          evidence_required: true as const,
        },
      },
      authorized_purposes: body.purposes ?? ["coding_assistance"],
      consent_record_id: ctx.generateId("cns"), consented_at: now, consent_method: "initial_auth" as const,
      supersedes_grant_id: null, active: true,
    };
    await ctx.stores.grants.createGrant(grant);

    return c.json({
      data: {
        binding: { id: binding.id, passport_id: binding.passport_id, app_principal_id: binding.app_principal_id, status: binding.status, revision: binding.revision, created_at: binding.created_at },
        grant: { id: grant.id, version: grant.version, capabilities: grant.capabilities, data_policy: grant.data_policy, active: grant.active },
      },
      meta: { request_id: rid, policy_version: "v0.1.0" },
    }, 201);
  });

  app.get("/v1/bindings", aAuth, async (c) => {
    const auth = c.get("auth") as AppAuthContext;
    const rid = c.get("requestId");
    return c.json({
      data: { id: auth.binding.id, status: auth.binding.status, revision: auth.binding.revision, current_grant_id: auth.binding.current_grant_id, created_at: auth.binding.created_at },
      meta: { request_id: rid, policy_version: "v0.1.0" },
    });
  });

  app.post("/v1/bindings/:id/revoke", uAuth, async (c) => {
    const auth = c.get("auth") as UserAuthContext;
    const rid = c.get("requestId");
    const binding = await ctx.stores.bindings.getBinding(c.req.param("id"));
    if (!binding || binding.passport_id !== auth.passportId) {
      throw new ApiError(404, "NOT_FOUND", "Binding not found", rid);
    }
    const now = ctx.now();
    const updated = { ...binding, status: "revoked" as const, revision: binding.revision + 1, revoked_at: now };
    await ctx.stores.bindings.updateBinding(updated);
    return c.json({ data: { id: updated.id, status: updated.status, revision: updated.revision, revoked_at: updated.revoked_at }, meta: { request_id: rid, policy_version: "v0.1.0" } });
  });

  // ── Grants ────────────────────────────────────────────

  app.post("/v1/bindings/:id/grants", uAuth, async (c) => {
    const rid = c.get("requestId");
    const bindingId = c.req.param("id");
    const body = await c.req.json().catch(() => { throw new ApiError(400, "VALIDATION_ERROR", "Invalid JSON body", rid); });

    const binding = await ctx.stores.bindings.getBinding(bindingId);
    if (!binding) throw new ApiError(404, "NOT_FOUND", "Binding not found", rid);

    const grantId = ctx.generateId("grt");
    const now = ctx.now();
    const grant = {
      id: grantId, binding_id: bindingId, version: 1,
      capabilities: body.requested_capabilities ?? [],
      data_policy: {
        read: { categories: body.requested_read_categories ?? [], sensitivity_ceiling: body.requested_read_sensitivity_ceiling ?? "personal" },
        write: { categories: body.requested_write_categories ?? [], sensitivity_ceiling: body.requested_write_sensitivity_ceiling ?? "personal",
          rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 },
          semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 },
          evidence_required: true as const },
      },
      authorized_purposes: body.purposes ?? [],
      consent_record_id: ctx.generateId("cns"), consented_at: now, consent_method: "initial_auth" as const,
      supersedes_grant_id: null, active: true,
    };
    await ctx.stores.grants.createGrant(grant);

    return c.json({ data: { grant: { id: grant.id, version: grant.version, capabilities: grant.capabilities, data_policy: grant.data_policy, active: grant.active } }, meta: { request_id: rid, policy_version: "v0.1.0" } }, 201);
  });

  app.post("/v1/grants/:id/consent", uAuth, async (c) => {
    const rid = c.get("requestId");
    const grant = await ctx.stores.grants.getGrant(c.req.param("id"));
    if (!grant) throw new ApiError(404, "NOT_FOUND", "Grant not found", rid);
    return c.json({ data: { grant: { id: grant.id, version: grant.version, active: grant.active }, consent_record: { id: ctx.generateId("cns"), consent_type: "expansion" } }, meta: { request_id: rid, policy_version: "v0.1.0" } });
  });

  app.post("/v1/grants/:id/revoke", uAuth, async (c) => {
    const auth = c.get("auth") as UserAuthContext;
    const rid = c.get("requestId");
    const grant = await ctx.stores.grants.getGrant(c.req.param("id"));
    if (!grant) throw new ApiError(404, "NOT_FOUND", "Grant not found", rid);
    const binding = await ctx.stores.bindings.getBinding(grant.binding_id);
    if (!binding || binding.passport_id !== auth.passportId) throw new ApiError(404, "NOT_FOUND", "Grant not found", rid);
    await ctx.stores.grants.updateGrant({ ...grant, active: false });
    return c.json({ data: { grant_id: grant.id, active: false, binding_revision: binding.revision }, meta: { request_id: rid, policy_version: "v0.1.0" } });
  });

  // ── Observations (app auth → kernel write pipeline) ───

  app.post("/v1/observations", aAuth, obs.create);
  app.post("/v1/observations/:id/retract", aAuth, obs.retract);

  // ── Context (app auth → kernel read pipeline) ─────────

  app.get("/v1/context", aAuth, ctxH.get);

  // ── Claims: GET = app auth, user actions = user auth ──

  app.get("/v1/claims/:id", aAuth, claims.get);
  app.post("/v1/claims/:id/confirm", uAuth, userClaims.confirm);
  app.post("/v1/claims/:id/correct", uAuth, userClaims.correct);
  app.post("/v1/claims/:id/override", uAuth, userClaims.override);
  app.post("/v1/claims/:id/dispute", uAuth, userClaims.dispute);
  app.post("/v1/claims/:id/reclassify", uAuth, userClaims.reclassify);
  app.post("/v1/claims/:id/delete", uAuth, userClaims.delete);

  // ── Token refresh (no auth) ───────────────────────────

  app.post("/v1/tokens/refresh", tokens.refresh);

  return app;
}
