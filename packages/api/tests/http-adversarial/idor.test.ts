/**
 * Attack Vector #3 (HTTP): IDOR on Every Entity ID Type
 *
 * Every entity lookup is passport/binding-scoped. Cross-tenant access impossible.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim, makeObservation } from "../helpers/factories.js";

describe("HTTP Attack Vector #3: IDOR on Every Entity ID Type", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("3a: GET /v1/claims/:id for another passport's claim returns 404", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const claim = makeClaim({ id: "clm_victim", passport_id: "psp_victim" });
    t.addClaim(claim);

    const res = await t.app.request("/v1/claims/clm_victim", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(404);
  });

  it("3b: retract observation belonging to another binding returns 404", async () => {
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

  it("3c: GET /v1/context returns only claims for authenticated passport", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_mine", passport_id: "psp_test_a", category: "skills", sensitivity: "public" }));
    t.addClaim(makeClaim({ id: "clm_other", passport_id: "psp_victim", category: "skills", sensitivity: "public" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.items.map((i: { claim_id: string }) => i.claim_id);
    expect(ids).toContain("clm_mine");
    expect(ids).not.toContain("clm_other");
  });

  it("3d: nonexistent and cross-passport claim both return identical 404", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_other", passport_id: "psp_victim" }));

    const [res1, res2] = await Promise.all([
      t.app.request("/v1/claims/clm_nonexistent", {
        method: "GET",
        headers: { Authorization: `Bearer ${appToken()}` },
      }),
      t.app.request("/v1/claims/clm_other", {
        method: "GET",
        headers: { Authorization: `Bearer ${appToken()}` },
      }),
    ]);

    expect(res1.status).toBe(404);
    expect(res2.status).toBe(404);
    const b1 = await res1.json();
    const b2 = await res2.json();
    expect(b1.error.code).toBe(b2.error.code);
  });

  it("3e: claim above sensitivity ceiling returns 404", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({
      id: "grt_test_a",
      binding_id: "bnd_test_a",
      data_policy: {
        read: { categories: ["skills"], sensitivity_ceiling: "personal" },
        write: { categories: ["skills"], sensitivity_ceiling: "personal", rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 }, semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 }, evidence_required: true },
      },
    });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_secret", passport_id: "psp_test_a", sensitivity: "restricted", category: "skills" }));

    const res = await t.app.request("/v1/claims/clm_secret", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(404);
  });

  it("3f: revoke binding belonging to other user returns 404", async () => {
    const binding = makeBinding({ id: "bnd_victim", passport_id: "psp_victim" });
    t.addBinding(binding);

    const res = await t.app.request("/v1/bindings/bnd_victim/revoke", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken("psp_attacker", "acct_attacker")}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  it("3g: revoke grant on binding belonging to other user returns 404", async () => {
    const binding = makeBinding({ id: "bnd_victim", passport_id: "psp_victim" });
    const grant = makeGrant({ id: "grt_victim", binding_id: "bnd_victim" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/grants/grt_victim/revoke", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken("psp_attacker", "acct_attacker")}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  it("3h: GET /v1/context for passport with no claims returns 200 with empty items", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toEqual([]);
  });
});
