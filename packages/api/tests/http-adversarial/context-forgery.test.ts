/**
 * Attack Vector #11 (HTTP): Authentication Context Forgery
 *
 * Client-supplied identity fields (passport_id, binding_id) in body/headers/query
 * are ignored. Identity comes only from the auth token.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim } from "../helpers/factories.js";

describe("HTTP Attack Vector #11: Authentication Context Forgery", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("11a: passport_id in observation body ignored — server uses token's passport", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        passport_id: "psp_attacker",
        idempotency_key: "idem_forgery",
        subject: "user", predicate: "knows", value: "Python",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res.status).toBe(201);

    const ctxRes = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    const ctxBody = await ctxRes.json();
    expect(ctxBody.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it("11b: passport_id in request header ignored", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_mine", passport_id: "psp_test_a", category: "skills", sensitivity: "public" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${appToken()}`,
        "X-Passport-Id": "psp_attacker",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].claim_id).toBe("clm_mine");
  });

  it("11c: passport_id in query param ignored", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_mine2", passport_id: "psp_test_a", category: "skills", sensitivity: "public" }));

    const res = await t.app.request("/v1/context?passport_id=psp_attacker", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items[0].claim_id).toBe("clm_mine2");
  });

  it("11d: binding_id in query param ignored for claims", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_q", passport_id: "psp_test_a", category: "skills", sensitivity: "public" }));

    const res = await t.app.request("/v1/claims/clm_q?binding_id=bnd_attacker", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("clm_q");
  });

  it("11e: body passport_id on binding revoke ignored — server checks token passport", async () => {
    const binding = makeBinding({ id: "bnd_mine", passport_id: "psp_default" });
    t.addBinding(binding);

    const res = await t.app.request("/v1/bindings/bnd_mine/revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ passport_id: "psp_attacker" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("revoked");
  });

  it("11f: missing token returns 401 regardless of body passport_id", async () => {
    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { "X-Passport-Id": "psp_attacker" },
    });
    expect(res.status).toBe(401);
  });
});
