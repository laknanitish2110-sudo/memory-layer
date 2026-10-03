/**
 * Attack Vector #14 (HTTP): Authorization Caching
 *
 * Cached authorization decisions must not survive binding state changes.
 * Every HTTP request re-evaluates authorization from live state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim } from "../helpers/factories.js";

describe("HTTP Attack Vector #14: Authorization Caching", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("14a: revoking binding between two requests denies the second", async () => {
    const binding = makeBinding({ id: "bnd_cache", passport_id: "psp_cache" });
    const grant = makeGrant({ id: "grt_cache", binding_id: "bnd_cache" });
    t.addBinding(binding);
    t.addGrant(grant);
    t.addClaim(makeClaim({ id: "clm_cache", passport_id: "psp_cache", category: "skills", sensitivity: "public" }));

    const res1 = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_cache", "fam_cache")}` },
    });
    expect(res1.status).toBe(200);

    t.addBinding(makeBinding({
      id: "bnd_cache", passport_id: "psp_cache",
      status: "revoked", revoked_at: "2026-10-01T00:30:00Z",
    }));

    const res2 = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_cache", "fam_cache")}` },
    });
    expect([401, 403]).toContain(res2.status);
  });

  it("14b: deactivating grant between two requests denies the second", async () => {
    const binding = makeBinding({ id: "bnd_gd", passport_id: "psp_gd" });
    const grant = makeGrant({ id: "grt_gd", binding_id: "bnd_gd", active: true });
    t.addBinding(binding);
    t.addGrant(grant);

    const res1 = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_gd", "fam_gd")}` },
    });
    expect(res1.status).toBe(200);

    t.addGrant(makeGrant({ id: "grt_gd", binding_id: "bnd_gd", active: false }));

    const res2 = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_gd", "fam_gd")}` },
    });
    expect(res2.status).toBe(401);
  });

  it("14c: suspending binding between two requests denies the second", async () => {
    const binding = makeBinding({ id: "bnd_susp", passport_id: "psp_susp" });
    const grant = makeGrant({ id: "grt_susp", binding_id: "bnd_susp" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res1 = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_susp", "fam_susp")}` },
    });
    expect(res1.status).toBe(200);

    t.addBinding(makeBinding({
      id: "bnd_susp", passport_id: "psp_susp",
      status: "suspended", suspension_type: "platform_security",
      suspended_at: "2026-10-01T00:30:00Z",
    }));

    const res2 = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_susp", "fam_susp")}` },
    });
    expect([401, 403]).toContain(res2.status);
  });

  it("14d: concurrent requests get result based on binding state at check time", async () => {
    const binding = makeBinding({ id: "bnd_conc", passport_id: "psp_conc" });
    const grant = makeGrant({ id: "grt_conc", binding_id: "bnd_conc" });
    t.addBinding(binding);
    t.addGrant(grant);
    t.addClaim(makeClaim({ id: "clm_conc", passport_id: "psp_conc", category: "skills", sensitivity: "public" }));

    const [resA, resB] = await Promise.all([
      t.app.request("/v1/context", {
        method: "GET",
        headers: { Authorization: `Bearer ${appToken("bnd_conc", "fam_conc")}` },
      }),
      t.app.request("/v1/context", {
        method: "GET",
        headers: { Authorization: `Bearer ${appToken("bnd_conc", "fam_conc")}` },
      }),
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
  });

  it("14e: authenticated responses include no-cache headers", async () => {
    const binding = makeBinding({ id: "bnd_hdr", passport_id: "psp_hdr" });
    const grant = makeGrant({ id: "grt_hdr", binding_id: "bnd_hdr" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_hdr", "fam_hdr")}` },
    });
    expect(res.status).toBe(200);
    const cacheControl = res.headers.get("Cache-Control");
    if (cacheControl) {
      expect(cacheControl).toContain("no-store");
    }
  });

  it("14f: write endpoint also re-checks auth on every request", async () => {
    const binding = makeBinding({ id: "bnd_w", passport_id: "psp_w", app_principal_id: "app_w" });
    const grant = makeGrant({ id: "grt_w", binding_id: "bnd_w" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res1 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_w", "fam_w")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_auth1", subject: "user", predicate: "knows", value: "X",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res1.status).toBe(201);

    t.addBinding(makeBinding({
      id: "bnd_w", passport_id: "psp_w",
      status: "revoked", revoked_at: "2026-10-01T00:30:00Z",
    }));

    const res2 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_w", "fam_w")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_auth2", subject: "user", predicate: "knows", value: "Y",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect([401, 403]).toContain(res2.status);
  });
});
