/**
 * Attack Vector #2 (HTTP): Never Trust Request IDs
 *
 * Server derives all identity from auth tokens, never from request body/headers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim, makeObservation } from "../helpers/factories.js";

describe("HTTP Attack Vector #2: Never Trust Request IDs", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("2a: binding_id in observation body is rejected (server-determined)", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        binding_id: "bnd_attacker",
        idempotency_key: "idem_001",
        subject: "user",
        predicate: "knows",
        value: "Python",
        qualifiers: {},
        declared_sensitivity: "public",
        declared_category: "skills",
        extraction_method: "user_stated",
        raw_context: "User said they know Python",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("binding_id");
  });

  it("2c: GET /v1/claims/:id for another passport's claim returns 404", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const claim = makeClaim({ id: "clm_other", passport_id: "psp_victim" });
    t.addClaim(claim);

    const res = await t.app.request("/v1/claims/clm_other", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(404);
  });

  it("2d: POST /v1/claims/:id/confirm on another user's claim returns 404", async () => {
    const claim = makeClaim({ id: "clm_victim", passport_id: "psp_victim" });
    t.addClaim(claim);

    const res = await t.app.request("/v1/claims/clm_victim/confirm", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken("psp_attacker", "acct_attacker")}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  it("2e: token for nonexistent binding returns 401", async () => {
    const res = await t.app.request("/v1/bindings", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_ghost", "fam_ghost")}` },
    });
    expect(res.status).toBe(401);
  });

  it("2f: token for binding with no active grant returns 401", async () => {
    const binding = makeBinding({ id: "bnd_no_grant", passport_id: "psp_ng" });
    t.addBinding(binding);

    const res = await t.app.request("/v1/bindings", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_no_grant", "fam_ng")}` },
    });
    expect(res.status).toBe(401);
  });

  it("2g: retract observation belonging to different binding returns 404", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const obs = makeObservation({ id: "obs_other", binding_id: "bnd_other" });
    t.addObservation(obs);

    const res = await t.app.request("/v1/observations/obs_other/retract", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appToken()}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });
});
