import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, refreshToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim } from "../helpers/factories.js";

describe("M2.2 Smoke Test — HTTP Shell", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  // ── Auth rejection (no token) ─────────────────────────

  it("rejects requests without Authorization header", async () => {
    const res = await t.app.request("/v1/passports", { method: "GET" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("TOKEN_INVALID");
  });

  it("rejects POST without Content-Type: application/json", async () => {
    const res = await t.app.request("/v1/passports", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}` },
      body: "{}",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ── Passports ─────────────────────────────────────────

  it("POST /v1/passports — creates a passport", async () => {
    const res = await t.app.request("/v1/passports", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Test Passport" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("Test Passport");
    expect(body.data.id).toMatch(/^psp_/);
    expect(body.meta.request_id).toMatch(/^req_/);
  });

  it("GET /v1/passports — lists passports", async () => {
    const res = await t.app.request("/v1/passports", {
      method: "GET",
      headers: { Authorization: `Bearer ${userToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  // ── Bindings ──────────────────────────────────────────

  it("POST /v1/bindings — creates a binding", async () => {
    const res = await t.app.request("/v1/bindings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        passport_id: "psp_default",
        app_principal_id: "app_test",
        purposes: ["coding_assistance"],
        requested_capabilities: ["read_context", "write_claims"],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.binding.id).toMatch(/^bnd_/);
    expect(body.data.binding.status).toBe("active");
    expect(body.data.grant.id).toMatch(/^grt_/);
  });

  it("GET /v1/bindings — returns binding for app auth", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/bindings", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("bnd_test_a");
  });

  it("POST /v1/bindings/:id/revoke — revokes a binding", async () => {
    const binding = makeBinding({ id: "bnd_revoke", passport_id: "psp_default" });
    t.addBinding(binding);

    const res = await t.app.request("/v1/bindings/bnd_revoke/revoke", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken()}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("revoked");
  });

  // ── Grants ────────────────────────────────────────────

  it("POST /v1/bindings/:id/grants — creates a grant", async () => {
    const binding = makeBinding({ id: "bnd_g", passport_id: "psp_default" });
    t.addBinding(binding);

    const res = await t.app.request("/v1/bindings/bnd_g/grants", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requested_capabilities: ["read_context"] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.grant.id).toMatch(/^grt_/);
  });

  it("POST /v1/grants/:id/consent — consents to grant", async () => {
    const grant = makeGrant({ id: "grt_consent" });
    t.addGrant(grant);

    const res = await t.app.request("/v1/grants/grt_consent/consent", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ approved: true }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/grants/:id/revoke — revokes a grant", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_default" });
    const grant = makeGrant({ id: "grt_revoke", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/grants/grt_revoke/revoke", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken()}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.active).toBe(false);
  });

  // ── Observations ──────────────────────────────────────

  it("POST /v1/observations — submits an observation through kernel", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      capabilities: ["read_context", "read_claims", "write_claims", "retract_own_observation"],
      data_policy: {
        read: { categories: ["skills"], sensitivity_ceiling: "personal" },
        write: {
          categories: ["skills"], sensitivity_ceiling: "personal",
          rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 },
          semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 },
          evidence_required: true,
        },
      },
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotency_key: "test_obs_001",
        subject: "user",
        predicate: "knows",
        value: "TypeScript",
        qualifiers: {},
        declared_sensitivity: "public",
        declared_category: "skills",
        extraction_method: "user_stated",
        raw_context: "User said they know TypeScript",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.outcome.status).toBe("accepted");
    expect(body.data.observation_id).toMatch(/^obs_/);
  });

  // ── Context ───────────────────────────────────────────

  it("GET /v1/context — returns synthesized context through kernel", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const claim = makeClaim({ id: "clm_ctx", passport_id: "psp_test_a", category: "skills", sensitivity: "public" });
    t.addClaim(claim);

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].claim_id).toBe("clm_ctx");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  // ── Claims ────────────────────────────────────────────

  it("GET /v1/claims/:id — returns a claim through kernel filters", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      capabilities: ["read_context", "read_claims", "write_claims", "retract_own_observation"],
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const claim = makeClaim({ id: "clm_read", passport_id: "psp_test_a" });
    t.addClaim(claim);

    const res = await t.app.request("/v1/claims/clm_read", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("clm_read");
    expect(body.data).not.toHaveProperty("passport_id");
    expect(body.data).not.toHaveProperty("evidence_ids");
  });

  // ── User Claim Actions ────────────────────────────────

  it("POST /v1/claims/:id/confirm — user confirms claim", async () => {
    const claim = makeClaim({ id: "clm_action", passport_id: "psp_default" });
    t.addClaim(claim);

    const res = await t.app.request("/v1/claims/clm_action/confirm", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken()}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.new_state).toBe("DECLARED");
  });

  it("POST /v1/claims/:id/delete — user deletes claim", async () => {
    const claim = makeClaim({ id: "clm_del", passport_id: "psp_default" });
    t.addClaim(claim);

    const res = await t.app.request("/v1/claims/clm_del/delete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken()}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
  });

  // ── Token Refresh ─────────────────────────────────────

  it("POST /v1/tokens/refresh — rotates token through kernel", async () => {
    t.addTokenFamily({
      family_id: "fam_tok1",
      binding_id: "bnd_test_a",
      current_generation: 0,
      created_at: "2026-10-01T00:00:00Z",
      revoked_at: null,
    });

    const res = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken("fam_tok1", 0) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.access_token).toBeTruthy();
    expect(body.data.refresh_token).toBeTruthy();
    expect(body.data.token_type).toBe("Bearer");
  });

  // ── Response envelope ─────────────────────────────────

  it("all responses include request_id in meta", async () => {
    const res = await t.app.request("/v1/passports", {
      method: "GET",
      headers: { Authorization: `Bearer ${userToken()}` },
    });
    const body = await res.json();
    expect(body.meta.request_id).toMatch(/^req_/);
  });

  it("error responses include request_id", async () => {
    const res = await t.app.request("/v1/passports", { method: "GET" });
    const body = await res.json();
    expect(body.error.request_id).toBeTruthy();
  });

  it("all /v1/* responses include Cache-Control: no-store", async () => {
    const res = await t.app.request("/v1/passports", {
      method: "GET",
      headers: { Authorization: `Bearer ${userToken()}` },
    });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Pragma")).toBe("no-cache");
  });
});
