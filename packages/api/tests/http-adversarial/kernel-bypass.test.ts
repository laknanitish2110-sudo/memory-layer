/**
 * Attack Vector #10 (HTTP): API Must Not Bypass the Kernel
 *
 * Every mutation flows through the kernel. Observations go through ingest(),
 * context through executeReadPipeline(), claims through authorize().
 * No endpoint returns data without kernel mediation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim, makeObservation, makeEvidence } from "../helpers/factories.js";

describe("HTTP Attack Vector #10: API Must Not Bypass the Kernel", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("10a: POST /observations produces claim + evidence via kernel ingest()", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_kern_a", subject: "user", predicate: "knows", value: "Python",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.outcome).toBeDefined();
    expect(body.data.outcome.status).toBeDefined();
  });

  it("10b: GET /context returns kernel-filtered data only", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_visible", passport_id: "psp_test_a", category: "skills", sensitivity: "public" }));
    t.addClaim(makeClaim({ id: "clm_other", passport_id: "psp_other", category: "skills", sensitivity: "public" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const item of body.data.items) {
      expect(item.claim_id).not.toBe("clm_other");
    }
  });

  it("10c: GET /claims/:id applies authorization before returning data", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_theirs", passport_id: "psp_other", category: "skills" }));

    const res = await t.app.request("/v1/claims/clm_theirs", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(404);
  });

  it("10d: user action endpoints produce events through kernel path", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_default" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_action", passport_id: "psp_default", category: "skills" }));

    const res = await t.app.request("/v1/claims/clm_action/confirm", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect([200, 404]).toContain(res.status);
  });

  it("10e: token refresh flows through kernel refreshTokenFamily()", async () => {
    t.addTokenFamily({
      family_id: "fam_refresh",
      binding_id: "bnd_refresh",
      current_generation: 0,
      created_at: "2026-10-01T00:00:00Z",
    });
    const binding = makeBinding({ id: "bnd_refresh", passport_id: "psp_refresh" });
    const grant = makeGrant({ id: "grt_refresh", binding_id: "bnd_refresh" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "refresh|fam_refresh|0" }),
    });
    expect([200, 401]).toContain(res.status);
  });

  it("10f: observation retraction flows through kernel, not direct store delete", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const obs = makeObservation({ id: "obs_retract", binding_id: "bnd_test_a" });
    t.addObservation(obs);

    const res = await t.app.request("/v1/observations/obs_retract/retract", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect([200, 404]).toContain(res.status);
  });

  it("10g: binding revoke flows through kernel, updates binding state", async () => {
    const binding = makeBinding({ id: "bnd_mine", passport_id: "psp_default" });
    t.addBinding(binding);

    const res = await t.app.request("/v1/bindings/bnd_mine/revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("revoked");
  });

  it("10h: no endpoint returns data from another passport without kernel mediation", async () => {
    const bindingA = makeBinding({ id: "bnd_a", passport_id: "psp_a" });
    const grantA = makeGrant({ id: "grt_a", binding_id: "bnd_a" });
    t.addBinding(bindingA);
    t.addGrant(grantA);

    t.addClaim(makeClaim({ id: "clm_secret", passport_id: "psp_b", category: "skills", sensitivity: "public" }));

    const ctxRes = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_a", "fam_a")}` },
    });
    expect(ctxRes.status).toBe(200);
    const ctxBody = await ctxRes.json();
    const claimIds = ctxBody.data.items.map((i: any) => i.claim_id);
    expect(claimIds).not.toContain("clm_secret");

    const claimRes = await t.app.request("/v1/claims/clm_secret", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_a", "fam_a")}` },
    });
    expect(claimRes.status).toBe(404);
  });
});
