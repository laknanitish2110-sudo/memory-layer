/**
 * Attack Vector #7 (HTTP): Error Leakage
 *
 * Error responses never reveal whether resources exist for other users.
 * 404 is indistinguishable from cross-passport access.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim, makeObservation } from "../helpers/factories.js";

describe("HTTP Attack Vector #7: Error Leakage", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("7a: nonexistent claim returns generic 404", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/claims/clm_nonexistent", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).not.toContain("passport");
    expect(body.error.message).not.toContain("psp_");
  });

  it("7b: other user's claim returns same 404 as nonexistent", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_victim", passport_id: "psp_victim" }));

    const [notFound, crossPassport] = await Promise.all([
      t.app.request("/v1/claims/clm_ghost", { method: "GET", headers: { Authorization: `Bearer ${appToken()}` } }),
      t.app.request("/v1/claims/clm_victim", { method: "GET", headers: { Authorization: `Bearer ${appToken()}` } }),
    ]);

    expect(notFound.status).toBe(404);
    expect(crossPassport.status).toBe(404);
    const b1 = await notFound.json();
    const b2 = await crossPassport.json();
    expect(b1.error.code).toBe(b2.error.code);
    expect(b1.error.message).toBe(b2.error.message);
  });

  it("7c: revoking another user's binding returns 404 not 403", async () => {
    const binding = makeBinding({ id: "bnd_other", passport_id: "psp_other" });
    t.addBinding(binding);

    const res = await t.app.request("/v1/bindings/bnd_other/revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("7d: retracting another binding's observation returns 404 not 403", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const obs = makeObservation({ id: "obs_other", binding_id: "bnd_other" });
    t.addObservation(obs);

    const res = await t.app.request("/v1/observations/obs_other/retract", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).not.toContain("bnd_other");
  });

  it("7e: all error responses have consistent shape", async () => {
    const res401 = await t.app.request("/v1/context", { method: "GET" });
    const body401 = await res401.json();
    expect(body401.error).toBeDefined();
    expect(body401.error.code).toBeDefined();
    expect(body401.error.message).toBeDefined();
    expect(body401.error.request_id).toBeDefined();
  });

  it("7f: 401 doesn't reveal whether binding exists", async () => {
    const binding = makeBinding({ id: "bnd_exists", passport_id: "psp_e" });
    t.addBinding(binding);

    const [resGhost, resExists] = await Promise.all([
      t.app.request("/v1/bindings", { method: "GET", headers: { Authorization: `Bearer ${appToken("bnd_ghost", "fam_g")}` } }),
      t.app.request("/v1/bindings", { method: "GET", headers: { Authorization: `Bearer ${appToken("bnd_exists", "fam_e")}` } }),
    ]);

    expect(resGhost.status).toBe(401);
    expect(resExists.status).toBe(401);
    const bg = await resGhost.json();
    const be = await resExists.json();
    expect(bg.error.code).toBe(be.error.code);
  });

  it("7g: validation errors don't leak internal field names", async () => {
    const res = await t.app.request("/v1/passports", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}` },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).not.toContain("stack");
    expect(body.error.message).not.toContain("internal");
  });

  it("7h: nonexistent and cross-passport claim return identical 404 responses", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_other", passport_id: "psp_other" }));

    const [r1, r2] = await Promise.all([
      t.app.request("/v1/claims/clm_nope", { method: "GET", headers: { Authorization: `Bearer ${appToken()}` } }),
      t.app.request("/v1/claims/clm_other", { method: "GET", headers: { Authorization: `Bearer ${appToken()}` } }),
    ]);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.error).toEqual(expect.objectContaining({ code: "NOT_FOUND" }));
    expect(b2.error).toEqual(expect.objectContaining({ code: "NOT_FOUND" }));
    expect(b1.error.message).toBe(b2.error.message);
  });
});
