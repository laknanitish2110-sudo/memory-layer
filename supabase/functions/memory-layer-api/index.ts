// Memory Layer API — Supabase Edge Function (entry point)
import { Hono } from "https://esm.sh/hono@4.4.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import {
  type ClaimCategory, type Sensitivity, type UserMemoryAction,
  type AuthorizationRequest, type IdGenerator,
  type AppAuthContext, type UserAuthContext, type ApiBindingStore, type ApiGrantStore,
  type Stores, type AppContext, type TokenValidator, type RefreshTokenDecoder,
  ApiError, authorize, filterClaimsBySensitivity, filterClaimsBySharingPolicy,
  ingest, executeReadPipeline, refreshTokenFamily, mapKernelDenyToApiError, mapIngestionReasonToApiError,
} from "./kernel.ts";

import {
  SupabaseClaimStore, SupabaseObservationStore, SupabaseEvidenceStore,
  SupabaseBindingStoreImpl, SupabaseGrantStoreImpl,
  SupabaseTokenFamilyStoreImpl, SupabaseUserMemoryEventStoreImpl,
} from "./stores.ts";

// ═══════════════════════════════════════════════════════════════════
// BUILD APP
// ═══════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const sbBindingStore = new SupabaseBindingStoreImpl(supabase);
const sbGrantStore = new SupabaseGrantStoreImpl(supabase);

const apiBindingStore: ApiBindingStore = {
  getBinding: (id) => sbBindingStore.getBinding(id),
  getBindingByPassportAndApp: (pid, appId) => sbBindingStore.getBindingForPassportAndApp(pid, appId),
  createBinding: (b) => sbBindingStore.createBinding(b),
  updateBinding: (b) => sbBindingStore.updateBinding(b),
};

const apiGrantStore: ApiGrantStore = {
  getGrant: (id) => sbGrantStore.getGrant(id),
  getActiveGrantForBinding: async (bindingId) => {
    const grants = await sbGrantStore.getGrantsForBinding(bindingId);
    return grants.find((g) => g.active) ?? null;
  },
  createGrant: (g) => sbGrantStore.createGrant(g),
  updateGrant: async (g) => { if (!g.active) await sbGrantStore.deactivateGrant(g.id); },
};

const stores: Stores = {
  claims: new SupabaseClaimStore(supabase),
  evidence: new SupabaseEvidenceStore(supabase),
  observations: new SupabaseObservationStore(supabase),
  events: new SupabaseUserMemoryEventStoreImpl(supabase),
  bindings: apiBindingStore,
  grants: apiGrantStore,
  tokenFamilies: new SupabaseTokenFamilyStoreImpl(supabase),
};

const tokenValidator: TokenValidator = {
  validateAppToken: (token) => {
    if (!token.startsWith("app|")) return null;
    const parts = token.split("|");
    if (parts.length < 4) return null;
    return {
      binding_id: parts[1], family_id: parts[2], passport_id: "",
      generation: parseInt(parts[3], 10), issued_at: new Date().toISOString(),
      expires_at: parts[4] ?? new Date(Date.now() + 3600000).toISOString(),
    };
  },
  validateUserToken: (token) => {
    if (!token.startsWith("user|")) return null;
    const parts = token.split("|");
    if (parts.length < 3) return null;
    return { passport_id: parts[1], account_id: parts[2] };
  },
};

const refreshTokenDecoder: RefreshTokenDecoder = {
  decode: (token) => {
    if (!token.startsWith("refresh|")) return null;
    const parts = token.split("|");
    if (parts.length < 3) return null;
    return { family_id: parts[1], generation: parseInt(parts[2], 10) };
  },
};

const appContext: AppContext = {
  stores,
  tokenIssuer: {
    issueAccessToken: (familyId, bindingId) => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      return {
        token_hash: `app|${bindingId}|${familyId}|0|${expiresAt}`,
        family_id: familyId, binding_id: bindingId,
        issued_at: new Date().toISOString(), expires_at: expiresAt,
      };
    },
    issueRefreshToken: (familyId, generation) => ({
      token_hash: `refresh|${familyId}|${generation}`,
      family_id: familyId, generation,
      issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(),
    }),
  },
  generateId: (_prefix) => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

// ═══════════════════════════════════════════════════════════════════
// HONO APP + ROUTES
// ═══════════════════════════════════════════════════════════════════

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const app = new Hono().basePath("/memory-layer-api");

let reqCounter = 0;
app.use("*", async (c, next) => {
  const id = `req_${Date.now()}_${String(++reqCounter).padStart(6, "0")}`;
  c.set("requestId", id);
  await next();
});

app.onError((err, c) => {
  const requestId = c.get("requestId") ?? "req_unknown";
  if (err instanceof ApiError) return c.json(err.toJSON(), err.status as any);
  const errDetail = err instanceof Error ? { message: err.message, name: err.name, stack: err.stack } : err;
  console.error(JSON.stringify({ unhandled_error: errDetail, request_id: requestId, path: c.req.path, method: c.req.method }));
  return c.json({ error: { code: "INTERNAL_ERROR", message: "An internal error occurred", request_id: requestId } }, 500);
});

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

// --- Auth middleware factories ---

function appAuthMiddleware(validator: TokenValidator, ctx: AppContext) {
  return async (c: any, next: any) => {
    const requestId = c.get("requestId") ?? "req_unknown";
    const authHeader = c.req.header("Authorization");
    if (!authHeader) throw new ApiError(401, "TOKEN_INVALID", "Missing Authorization header", requestId);
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") throw new ApiError(401, "TOKEN_INVALID", "Malformed Authorization header", requestId);
    const claims = validator.validateAppToken(parts[1]);
    if (!claims) throw new ApiError(401, "TOKEN_INVALID", "Invalid access token", requestId);
    const now = new Date().toISOString();
    if (claims.expires_at && new Date(claims.expires_at) < new Date(now)) throw new ApiError(401, "TOKEN_EXPIRED", "Access token expired", requestId);
    const binding = await ctx.stores.bindings.getBinding(claims.binding_id);
    if (!binding) throw new ApiError(401, "TOKEN_INVALID", "Binding not found", requestId);
    const grant = await ctx.stores.grants.getActiveGrantForBinding(claims.binding_id);
    if (!grant) throw new ApiError(401, "TOKEN_INVALID", "No active grant", requestId);
    const authContext: AppAuthContext = { type: "app", passportId: binding.passport_id, bindingId: binding.id, grantId: grant.id, bindingRevision: binding.revision, binding, grant };
    c.set("auth", authContext);
    await next();
  };
}

function userAuthMiddleware(validator: TokenValidator) {
  return async (c: any, next: any) => {
    const requestId = c.get("requestId") ?? "req_unknown";
    const authHeader = c.req.header("Authorization");
    if (!authHeader) throw new ApiError(401, "TOKEN_INVALID", "Missing Authorization header", requestId);
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") throw new ApiError(401, "TOKEN_INVALID", "Malformed Authorization header", requestId);
    const userClaims = validator.validateUserToken(parts[1]);
    if (!userClaims) throw new ApiError(401, "TOKEN_INVALID", "Invalid user session token", requestId);
    const authContext: UserAuthContext = { type: "user", passportId: userClaims.passport_id, accountId: userClaims.account_id };
    c.set("auth", authContext);
    await next();
  };
}

const aAuth = appAuthMiddleware(tokenValidator, appContext);
const uAuth = userAuthMiddleware(tokenValidator);
const ctx = appContext;

// --- Health ---
app.get("/", (c) => c.json({ service: "memory-layer-api", version: "0.1.0", status: "ok" }));
app.get("/health", (c) => c.json({ status: "ok" }));

// --- Passports ---
app.post("/v1/passports", uAuth, async (c) => {
  const auth = c.get("auth") as UserAuthContext;
  const rid = c.get("requestId");
  const body = await c.req.json().catch(() => { throw new ApiError(400, "VALIDATION_ERROR", "Invalid JSON body", rid); });
  return c.json({ data: { id: ctx.generateId("psp"), account_id: auth.accountId, name: body.name ?? "Default", created_at: ctx.now(), is_ephemeral: body.is_ephemeral ?? false, binding_ids: [], bridge_ids: [] }, meta: { request_id: rid, policy_version: "v0.1.0" } }, 201);
});

app.get("/v1/passports", uAuth, async (c) => {
  return c.json({ data: [], meta: { request_id: c.get("requestId"), policy_version: "v0.1.0" } });
});

// --- Bindings ---
app.post("/v1/bindings", uAuth, async (c) => {
  const auth = c.get("auth") as UserAuthContext;
  const rid = c.get("requestId");
  const body = await c.req.json().catch(() => { throw new ApiError(400, "VALIDATION_ERROR", "Invalid JSON body", rid); });
  if (!body.passport_id || !body.app_principal_id) throw new ApiError(400, "VALIDATION_ERROR", "passport_id and app_principal_id are required", rid);

  const bindingId = ctx.generateId("bnd");
  const grantId = ctx.generateId("grt");
  const now = ctx.now();
  const binding = { id: bindingId, passport_id: body.passport_id, app_principal_id: body.app_principal_id, status: "active" as const, current_grant_id: grantId, revision: 1, created_at: now, suspended_at: null, revoked_at: null, suspension_type: null };
  await ctx.stores.bindings.createBinding(binding);

  const grant = {
    id: grantId, binding_id: bindingId, version: 1,
    capabilities: body.requested_capabilities ?? ["read_context"],
    data_policy: {
      read: { categories: body.requested_read_categories ?? ["skills"], sensitivity_ceiling: body.requested_read_sensitivity_ceiling ?? "personal" },
      write: { categories: body.requested_write_categories ?? [], sensitivity_ceiling: body.requested_write_sensitivity_ceiling ?? "personal", rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 }, semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 }, evidence_required: true as const },
    },
    authorized_purposes: body.purposes ?? ["coding_assistance"],
    consent_record_id: ctx.generateId("cns"), consented_at: now, consent_method: "initial_auth" as const, supersedes_grant_id: null, active: true,
  };
  await ctx.stores.grants.createGrant(grant);

  return c.json({ data: { binding: { id: binding.id, passport_id: binding.passport_id, app_principal_id: binding.app_principal_id, status: binding.status, revision: binding.revision, created_at: binding.created_at }, grant: { id: grant.id, version: grant.version, capabilities: grant.capabilities, data_policy: grant.data_policy, active: grant.active } }, meta: { request_id: rid, policy_version: "v0.1.0" } }, 201);
});

app.get("/v1/bindings", aAuth, async (c) => {
  const auth = c.get("auth") as AppAuthContext;
  const rid = c.get("requestId");
  return c.json({ data: { id: auth.binding.id, status: auth.binding.status, revision: auth.binding.revision, current_grant_id: auth.binding.current_grant_id, created_at: auth.binding.created_at }, meta: { request_id: rid, policy_version: "v0.1.0" } });
});

app.post("/v1/bindings/:id/revoke", uAuth, async (c) => {
  const auth = c.get("auth") as UserAuthContext;
  const rid = c.get("requestId");
  const bindingParamId = c.req.param("id");
  if (!UUID_RE.test(bindingParamId)) throw new ApiError(404, "NOT_FOUND", "Binding not found", rid);
  const binding = await ctx.stores.bindings.getBinding(bindingParamId);
  if (!binding || binding.passport_id !== auth.passportId) throw new ApiError(404, "NOT_FOUND", "Binding not found", rid);
  const now = ctx.now();
  const updated = { ...binding, status: "revoked" as const, revision: binding.revision + 1, revoked_at: now };
  await ctx.stores.bindings.updateBinding(updated);
  return c.json({ data: { id: updated.id, status: updated.status, revision: updated.revision, revoked_at: updated.revoked_at }, meta: { request_id: rid, policy_version: "v0.1.0" } });
});

// --- Grants ---
app.post("/v1/bindings/:id/grants", uAuth, async (c) => {
  const rid = c.get("requestId");
  const bindingId = c.req.param("id");
  if (!UUID_RE.test(bindingId)) throw new ApiError(404, "NOT_FOUND", "Binding not found", rid);
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
      write: { categories: body.requested_write_categories ?? [], sensitivity_ceiling: body.requested_write_sensitivity_ceiling ?? "personal", rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 }, semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 }, evidence_required: true as const },
    },
    authorized_purposes: body.purposes ?? [],
    consent_record_id: ctx.generateId("cns"), consented_at: now, consent_method: "initial_auth" as const, supersedes_grant_id: null, active: true,
  };
  await ctx.stores.grants.createGrant(grant);
  return c.json({ data: { grant: { id: grant.id, version: grant.version, capabilities: grant.capabilities, data_policy: grant.data_policy, active: grant.active } }, meta: { request_id: rid, policy_version: "v0.1.0" } }, 201);
});

app.post("/v1/grants/:id/consent", uAuth, async (c) => {
  const rid = c.get("requestId");
  const grantParamId = c.req.param("id");
  if (!UUID_RE.test(grantParamId)) throw new ApiError(404, "NOT_FOUND", "Grant not found", rid);
  const grant = await ctx.stores.grants.getGrant(grantParamId);
  if (!grant) throw new ApiError(404, "NOT_FOUND", "Grant not found", rid);
  return c.json({ data: { grant: { id: grant.id, version: grant.version, active: grant.active }, consent_record: { id: ctx.generateId("cns"), consent_type: "expansion" } }, meta: { request_id: rid, policy_version: "v0.1.0" } });
});

app.post("/v1/grants/:id/revoke", uAuth, async (c) => {
  const auth = c.get("auth") as UserAuthContext;
  const rid = c.get("requestId");
  const grantRevokeId = c.req.param("id");
  if (!UUID_RE.test(grantRevokeId)) throw new ApiError(404, "NOT_FOUND", "Grant not found", rid);
  const grant = await ctx.stores.grants.getGrant(grantRevokeId);
  if (!grant) throw new ApiError(404, "NOT_FOUND", "Grant not found", rid);
  const binding = await ctx.stores.bindings.getBinding(grant.binding_id);
  if (!binding || binding.passport_id !== auth.passportId) throw new ApiError(404, "NOT_FOUND", "Grant not found", rid);
  await ctx.stores.grants.updateGrant({ ...grant, active: false });
  return c.json({ data: { grant_id: grant.id, active: false, binding_revision: binding.revision }, meta: { request_id: rid, policy_version: "v0.1.0" } });
});

// --- Observations (write pipeline) ---
const SERVER_DETERMINED_FIELDS = ["id", "binding_id", "outcome", "submitted_at"] as const;

app.post("/v1/observations", aAuth, async (c) => {
  const auth = c.get("auth") as AppAuthContext;
  const requestId = c.get("requestId");
  const body = await c.req.json().catch(() => { throw new ApiError(400, "VALIDATION_ERROR", "Invalid JSON body", requestId); });

  for (const field of SERVER_DETERMINED_FIELDS) {
    if (field in body) throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' is server-determined and must not be provided`, requestId);
  }
  const STRING_FIELDS = ["idempotency_key", "subject", "predicate", "value", "declared_category", "declared_sensitivity", "extraction_method", "raw_context"] as const;
  for (const f of STRING_FIELDS) { if (body[f] !== undefined && typeof body[f] !== "string") throw new ApiError(400, "VALIDATION_ERROR", `Field '${f}' must be a string`, requestId); }
  if (!body.idempotency_key || !body.subject || !body.predicate || !body.value) throw new ApiError(400, "VALIDATION_ERROR", "Missing required fields: idempotency_key, subject, predicate, value", requestId);
  if (!body.declared_category || !body.declared_sensitivity) throw new ApiError(400, "VALIDATION_ERROR", "Missing required fields: declared_category, declared_sensitivity", requestId);
  const VALID_CATEGORIES: ClaimCategory[] = ["skills", "preferences", "goals", "projects", "behavioral_patterns", "emotional_patterns", "personal_context"];
  if (!VALID_CATEGORIES.includes(body.declared_category)) throw new ApiError(400, "VALIDATION_ERROR", `Invalid declared_category '${body.declared_category}'. Must be one of: ${VALID_CATEGORIES.join(", ")}`, requestId);
  const VALID_SENSITIVITIES: Sensitivity[] = ["public", "personal", "sensitive", "restricted"];
  if (!VALID_SENSITIVITIES.includes(body.declared_sensitivity)) throw new ApiError(400, "VALIDATION_ERROR", `Invalid declared_sensitivity '${body.declared_sensitivity}'. Must be one of: ${VALID_SENSITIVITIES.join(", ")}`, requestId);
  if (!body.extraction_method || !body.raw_context) throw new ApiError(400, "VALIDATION_ERROR", "Missing required fields: extraction_method, raw_context", requestId);
  const VALID_EXTRACTION_METHODS = ["user_stated", "app_measured", "model_inferred"];
  if (!VALID_EXTRACTION_METHODS.includes(body.extraction_method)) throw new ApiError(400, "VALIDATION_ERROR", `Invalid extraction_method '${body.extraction_method}'. Must be one of: ${VALID_EXTRACTION_METHODS.join(", ")}`, requestId);

  const authRequest: AuthorizationRequest = {
    credential_id: `cred_${auth.bindingId}`, binding_id: auth.bindingId, binding_revision: auth.bindingRevision,
    capability: "write_claims", categories: [body.declared_category as ClaimCategory],
    max_sensitivity: body.declared_sensitivity as Sensitivity, purpose: body.purpose ?? null,
  };
  const decision = authorize(authRequest, auth.binding, auth.grant);
  if (decision.decision === "DENY") throw mapKernelDenyToApiError(decision.reason, requestId);

  const now = ctx.now();
  const ids: IdGenerator = { observationId: () => ctx.generateId("obs"), evidenceId: () => ctx.generateId("evi"), claimId: () => ctx.generateId("clm"), claimVersionId: () => ctx.generateId("ver") };

  const observation = {
    idempotency_key: body.idempotency_key, binding_id: auth.bindingId,
    experience_id: body.experience_id ?? null, subject: body.subject, predicate: body.predicate,
    value: body.value, qualifiers: body.qualifiers ?? {},
    declared_sensitivity: body.declared_sensitivity as Sensitivity,
    declared_category: body.declared_category as ClaimCategory,
    extraction_method: body.extraction_method, raw_context: body.raw_context, submitted_at: now,
  };

  let result;
  try {
    result = await ingest(observation, { passportId: auth.passportId, binding: auth.binding, grant: auth.grant, appId: auth.binding.app_principal_id, now },
      { observations: ctx.stores.observations, claims: ctx.stores.claims, evidence: ctx.stores.evidence }, ids, body.declared_sensitivity as Sensitivity);
  } catch (ingestErr: unknown) {
    const detail = ingestErr instanceof Error ? { message: ingestErr.message, name: ingestErr.name, stack: ingestErr.stack } : ingestErr;
    console.error(JSON.stringify({ ingest_error: detail, request_id: requestId }));
    throw ingestErr;
  }

  if (result.status === "rejected") throw mapIngestionReasonToApiError(result.reason, requestId);
  if (result.status === "quarantined") return c.json({ data: { observation_id: null, outcome: { status: "quarantined", reason: result.reason, requires_user_action: true } }, meta: { request_id: requestId, policy_version: "v0.1.0" } }, 201);
  if (result.status === "merged") return c.json({ data: { observation_id: result.observation.id, outcome: { status: "merged", existing_claim_id: result.claim.id, evidence_id: result.evidence.id } }, meta: { request_id: requestId, policy_version: "v0.1.0" } }, 201);
  return c.json({ data: { observation_id: result.observation.id, outcome: { status: "accepted", evidence_id: result.evidence.id, claim_id: result.claim.id } }, meta: { request_id: requestId, policy_version: "v0.1.0" } }, 201);
});

app.post("/v1/observations/:id/retract", aAuth, async (c) => {
  const auth = c.get("auth") as AppAuthContext;
  const requestId = c.get("requestId");
  const obsId = c.req.param("id");
  if (!UUID_RE.test(obsId)) throw new ApiError(404, "NOT_FOUND", "Observation not found", requestId);
  const authRequest: AuthorizationRequest = { credential_id: `cred_${auth.bindingId}`, binding_id: auth.bindingId, binding_revision: auth.bindingRevision, capability: "retract_own_observation", categories: [], max_sensitivity: "public", purpose: null };
  const decision = authorize(authRequest, auth.binding, auth.grant);
  if (decision.decision === "DENY") throw mapKernelDenyToApiError(decision.reason, requestId);
  const observation = await ctx.stores.observations.getObservation(auth.passportId, obsId);
  if (!observation || observation.binding_id !== auth.bindingId) throw new ApiError(404, "NOT_FOUND", "Observation not found", requestId);
  return c.json({ data: { observation_id: observation.id, evidence_id: observation.outcome && "evidence_id" in observation.outcome ? observation.outcome.evidence_id : null, evidence_status: "retracted" }, meta: { request_id: requestId, policy_version: "v0.1.0" } });
});

// --- Context (read pipeline) ---
app.get("/v1/context", aAuth, async (c) => {
  const auth = c.get("auth") as AppAuthContext;
  const requestId = c.get("requestId");
  const categoriesParam = c.req.query("categories");
  const purposeParam = c.req.query("purpose");
  const requestedCategories: ClaimCategory[] = categoriesParam ? (categoriesParam.split(",") as ClaimCategory[]) : (auth.grant.data_policy.read.categories as ClaimCategory[]);

  const authRequest: AuthorizationRequest = {
    credential_id: `cred_${auth.bindingId}`, binding_id: auth.bindingId, binding_revision: auth.bindingRevision,
    capability: "read_context", categories: requestedCategories,
    max_sensitivity: auth.grant.data_policy.read.sensitivity_ceiling as Sensitivity, purpose: purposeParam ?? null,
  };
  const decision = authorize(authRequest, auth.binding, auth.grant);
  if (decision.decision === "DENY") throw mapKernelDenyToApiError(decision.reason, requestId);

  const result = await executeReadPipeline(decision, auth.passportId, ctx.stores.claims, "v0.1.0");
  if (result.validation.status === "INVALID") throw new ApiError(500, "INTERNAL_ERROR", "Context validation failed", requestId);

  const responseItems = result.context.items.map((item) => ({ claim_id: item.claim_id, category: item.category, sensitivity: item.sensitivity, summary: item.summary, confidence_band: item.confidence_band }));
  return c.json({ data: { items: responseItems, generated_at: result.context.generated_at, policy_version: result.context.policy_version }, meta: { request_id: requestId, policy_version: "v0.1.0" } });
});

// --- Claims ---
app.get("/v1/claims/:id", aAuth, async (c) => {
  const auth = c.get("auth") as AppAuthContext;
  const requestId = c.get("requestId");
  const claimId = c.req.param("id");
  if (!UUID_RE.test(claimId)) throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);

  const authRequest: AuthorizationRequest = { credential_id: `cred_${auth.bindingId}`, binding_id: auth.bindingId, binding_revision: auth.bindingRevision, capability: "read_claims", categories: auth.grant.data_policy.read.categories as ClaimCategory[], max_sensitivity: auth.grant.data_policy.read.sensitivity_ceiling as Sensitivity, purpose: null };
  const decision = authorize(authRequest, auth.binding, auth.grant);
  if (decision.decision === "DENY") throw mapKernelDenyToApiError(decision.reason, requestId);

  const claim = await ctx.stores.claims.getClaim(auth.passportId, claimId);
  if (!claim) throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);
  if (!decision.effective_categories.includes(claim.category)) throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);
  const sensFiltered = filterClaimsBySensitivity([claim], decision.effective_sensitivity_ceiling);
  if (sensFiltered.length === 0) throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);
  const policyFiltered = filterClaimsBySharingPolicy([claim], auth.bindingId, decision.effective_sensitivity_ceiling);
  if (policyFiltered.length === 0) throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);

  return c.json({ data: { id: claim.id, subject: claim.subject, predicate: claim.predicate, value: claim.value, qualifiers: claim.qualifiers, category: claim.category, state: claim.state, volatility: claim.volatility, sensitivity: claim.sensitivity, created_at: claim.created_at, updated_at: claim.updated_at, current_version_id: claim.current_version_id }, meta: { request_id: requestId, policy_version: "v0.1.0" } });
});

// --- User claim actions ---
function userClaimHandler(action: UserMemoryAction) {
  return async (c: any) => {
    const auth = c.get("auth") as UserAuthContext;
    const requestId = c.get("requestId");
    const claimId = c.req.param("id");
    if (!UUID_RE.test(claimId)) throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);
    const claim = await ctx.stores.claims.getClaim(auth.passportId, claimId);
    if (!claim) throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);
    const body = await c.req.json().catch(() => ({}));
    const now = ctx.now();
    const eventId = ctx.generateId("evt");
    const evidenceId = action === "CONFIRM" || action === "CORRECT" ? ctx.generateId("evi") : null;
    const versionId = action === "CORRECT" ? ctx.generateId("ver") : null;
    let newState = claim.state;
    let newValue = claim.value;
    let newSensitivity = claim.sensitivity;

    switch (action) {
      case "CONFIRM": newState = "DECLARED"; break;
      case "CORRECT": newState = "DECLARED"; newValue = body.new_value ?? claim.value; break;
      case "OVERRIDE": newState = body.declared_state ?? "DECLARED"; break;
      case "DISPUTE": newState = "CONTESTED"; break;
      case "RECLASSIFY": newSensitivity = body.new_sensitivity ?? claim.sensitivity; break;
      case "DELETE": break;
    }

    const event = { id: eventId, claim_id: claimId, action, previous_value: action === "CORRECT" ? claim.value : null, new_value: action === "CORRECT" ? newValue : null, previous_sensitivity: action === "RECLASSIFY" ? claim.sensitivity : null, new_sensitivity: action === "RECLASSIFY" ? newSensitivity : null, performed_at: now, creates_evidence_id: evidenceId, creates_version_id: versionId };
    await ctx.stores.events.createEvent(auth.passportId, event);

    if (action === "DELETE") {
      await ctx.stores.claims.updateClaim(auth.passportId, { ...claim, deleted: true, deleted_at: now, updated_at: now });
      return c.json({ data: { claim_id: claimId, deleted: true, deleted_at: now, event_id: eventId }, meta: { request_id: requestId, policy_version: "v0.1.0" } });
    }
    if (action === "RECLASSIFY") {
      await ctx.stores.claims.updateClaim(auth.passportId, { ...claim, sensitivity: newSensitivity, sharing_policy: body.new_sharing_policy ?? claim.sharing_policy, updated_at: now });
      return c.json({ data: { claim_id: claimId, previous_sensitivity: claim.sensitivity, new_sensitivity: newSensitivity, event_id: eventId }, meta: { request_id: requestId, policy_version: "v0.1.0" } });
    }

    await ctx.stores.claims.updateClaim(auth.passportId, { ...claim, state: newState, value: newValue, updated_at: now });
    const responseData: Record<string, unknown> = { claim_id: claimId, new_state: newState, event_id: eventId };
    if (evidenceId) responseData.evidence_id = evidenceId;
    if (versionId) responseData.version_id = versionId;
    if (action === "CORRECT") responseData.new_value = newValue;
    if (action === "OVERRIDE") responseData.previous_state = claim.state;
    return c.json({ data: responseData, meta: { request_id: requestId, policy_version: "v0.1.0" } });
  };
}

app.post("/v1/claims/:id/confirm", uAuth, userClaimHandler("CONFIRM"));
app.post("/v1/claims/:id/correct", uAuth, userClaimHandler("CORRECT"));
app.post("/v1/claims/:id/override", uAuth, userClaimHandler("OVERRIDE"));
app.post("/v1/claims/:id/dispute", uAuth, userClaimHandler("DISPUTE"));
app.post("/v1/claims/:id/reclassify", uAuth, userClaimHandler("RECLASSIFY"));
app.post("/v1/claims/:id/delete", uAuth, userClaimHandler("DELETE"));

// --- Token refresh ---
app.post("/v1/tokens/refresh", async (c) => {
  const requestId = c.get("requestId");
  const body = await c.req.json().catch(() => { throw new ApiError(400, "VALIDATION_ERROR", "Invalid JSON body", requestId); });
  if (!body.refresh_token || typeof body.refresh_token !== "string") throw new ApiError(400, "VALIDATION_ERROR", "refresh_token is required and must be a string", requestId);
  const decoded = refreshTokenDecoder.decode(body.refresh_token);
  if (!decoded) throw new ApiError(401, "TOKEN_INVALID", "Invalid refresh token", requestId);
  if (!UUID_RE.test(decoded.family_id)) throw new ApiError(401, "TOKEN_INVALID", "Invalid refresh token", requestId);
  const now = new Date().toISOString();
  const result = await refreshTokenFamily(ctx.stores.tokenFamilies, ctx.tokenIssuer, decoded.family_id, decoded.generation, now);
  if (result.status === "reuse_detected") throw new ApiError(401, "TOKEN_REUSE_DETECTED", "Token reuse detected. Token family revoked.", requestId);
  return c.json({ data: { access_token: result.access_token.token_hash, access_token_expires_at: result.access_token.expires_at, refresh_token: result.refresh_token.token_hash, token_type: "Bearer" }, meta: { request_id: requestId, policy_version: "v0.1.0" } });
});

// --- Not found (JSON 404 + root path fallback) ---
app.notFound((c) => {
  const p = new URL(c.req.url).pathname;
  if (p === "/memory-layer-api" || p === "/memory-layer-api/") {
    return c.json({ service: "memory-layer-api", version: "0.1.0", status: "ok" });
  }
  const rid = c.get("requestId") ?? `req_${crypto.randomUUID().slice(0, 8)}`;
  return c.json({ error: { code: "NOT_FOUND", message: "Not found", request_id: rid } }, 404);
});

// ═══════════════════════════════════════════════════════════════════
// SERVE
// ═══════════════════════════════════════════════════════════════════

Deno.serve(app.fetch);
