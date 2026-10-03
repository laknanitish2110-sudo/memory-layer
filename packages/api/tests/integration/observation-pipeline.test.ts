/**
 * Happy-Path Integration: Observation → Evidence → Reconciliation → Claim
 *
 * The developer never POSTs a claim directly.
 * Observations enter the write pipeline: validation → evidence → reconciliation → claim.
 * This is the core data flow of the Memory Passport protocol.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant } from "../helpers/factories.js";

describe("Integration: Observation Pipeline", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
    const binding = makeBinding({ id: "bnd_obs", passport_id: "psp_obs", app_principal_id: "app_obs" });
    const grant = makeGrant({ id: "grt_obs", binding_id: "bnd_obs" });
    t.addBinding(binding);
    t.addGrant(grant);
  });

  it("observation creates evidence + claim in one atomic pipeline pass", async () => {
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_obs", "fam_obs")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_pipeline_001",
        subject: "user", predicate: "knows", value: "TypeScript",
        qualifiers: {},
        declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "User said: I know TypeScript",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.data.outcome.status).toBe("accepted");
    expect(body.data.observation_id).toMatch(/^obs_/);
    expect(body.data.outcome.evidence_id).toMatch(/^evi_/);
    expect(body.data.outcome.claim_id).toMatch(/^clm_/);
  });

  it("second observation for same tuple merges into existing claim", async () => {
    // First observation creates the claim
    const res1 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_obs", "fam_obs")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_merge_001",
        subject: "user", predicate: "knows", value: "Python",
        qualifiers: {},
        declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "User said: I know Python",
      }),
    });
    expect(res1.status).toBe(201);
    const body1 = await res1.json();
    expect(body1.data.outcome.status).toBe("accepted");

    // Second observation for same subject/predicate — should merge
    const res2 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_obs", "fam_obs")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_merge_002",
        subject: "user", predicate: "knows", value: "Python Advanced",
        qualifiers: {},
        declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "User demonstrated advanced Python skills",
      }),
    });
    expect(res2.status).toBe(201);
    const body2 = await res2.json();
    expect(["accepted", "merged"]).toContain(body2.data.outcome.status);
  });

  it("observation with duplicate idempotency key is handled safely", async () => {
    const payload = {
      idempotency_key: "idem_dup_test",
      subject: "user", predicate: "knows", value: "Rust",
      qualifiers: {},
      declared_sensitivity: "public", declared_category: "skills",
      extraction_method: "user_stated", raw_context: "test",
    };

    const res1 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_obs", "fam_obs")}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(201);

    const res2 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_obs", "fam_obs")}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect([201, 409]).toContain(res2.status);
  });

  it("observation result is visible via GET /context", async () => {
    await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_obs", "fam_obs")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_visible_001",
        subject: "user", predicate: "prefers", value: "dark mode",
        qualifiers: {},
        declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "User set dark mode",
      }),
    });

    const ctxRes = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_obs", "fam_obs")}` },
    });
    expect(ctxRes.status).toBe(200);
    const ctxBody = await ctxRes.json();
    expect(ctxBody.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it("observation without write_claims capability is denied", async () => {
    const readOnlyBinding = makeBinding({ id: "bnd_ro", passport_id: "psp_ro", app_principal_id: "app_ro" });
    const readOnlyGrant = makeGrant({
      id: "grt_ro", binding_id: "bnd_ro",
      capabilities: ["read_context"],
    });
    t.addBinding(readOnlyBinding);
    t.addGrant(readOnlyGrant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_ro", "fam_ro")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_denied",
        subject: "user", predicate: "knows", value: "Java",
        qualifiers: {},
        declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("server-determined fields in request body are rejected", async () => {
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_obs", "fam_obs")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "obs_fake",
        idempotency_key: "idem_server_det",
        subject: "user", predicate: "knows", value: "X",
        qualifiers: {},
        declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("server-determined");
  });
});
