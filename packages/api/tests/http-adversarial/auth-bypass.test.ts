/**
 * Attack Vector #1 (HTTP): Authentication Bypass
 *
 * Every request without valid credentials → 401.
 * No endpoint is accidentally unprotected.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant } from "../helpers/factories.js";

describe("HTTP Attack Vector #1: Authentication Bypass", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  // 1a: No Authorization header → 401 on every protected endpoint
  it("1a: missing auth header returns 401 on all protected endpoints", async () => {
    const endpoints = [
      { method: "GET", path: "/v1/passports" },
      { method: "GET", path: "/v1/bindings" },
      { method: "GET", path: "/v1/context" },
      { method: "GET", path: "/v1/claims/clm_any" },
    ];

    for (const { method, path } of endpoints) {
      const res = await t.app.request(path, { method });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("TOKEN_INVALID");
    }
  });

  // 1b: Invalid token format → 401
  it("1b: malformed token returns 401", async () => {
    const badTokens = [
      "",
      "not-a-token",
      "Bearer",
      "invalid|format",
      "app|",
      "user|",
    ];

    for (const token of badTokens) {
      const res = await t.app.request("/v1/passports", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(401);
    }
  });

  // 1c: Expired app token → 401 TOKEN_EXPIRED
  it("1c: expired app token returns 401 TOKEN_EXPIRED", async () => {
    const binding = makeBinding({ id: "bnd_exp", passport_id: "psp_exp" });
    const grant = makeGrant({ id: "grt_exp", binding_id: "bnd_exp" });
    t.addBinding(binding);
    t.addGrant(grant);

    const expiredToken = `app|bnd_exp|fam_exp|0|2020-01-01T00:00:00Z`;
    const res = await t.app.request("/v1/bindings", {
      method: "GET",
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("TOKEN_EXPIRED");
  });

  // 1d: App token on user-only endpoint → 401
  it("1d: app token on user-only endpoint returns 401", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/passports", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(401);
  });

  // 1e: User token on app-only endpoint → 401
  it("1e: user token on app-only endpoint returns 401", async () => {
    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${userToken()}` },
    });
    expect(res.status).toBe(401);
  });

  // 1f: Token for nonexistent binding → 401
  it("1f: token referencing nonexistent binding returns 401", async () => {
    const token = appToken("bnd_nonexistent", "fam_none");
    const res = await t.app.request("/v1/bindings", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  // 1g: Token for binding with no active grant → 401
  it("1g: token for binding without active grant returns 401", async () => {
    const binding = makeBinding({ id: "bnd_no_grant", passport_id: "psp_ng" });
    t.addBinding(binding);
    // No grant added

    const token = appToken("bnd_no_grant", "fam_ng");
    const res = await t.app.request("/v1/bindings", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  // 1h: POST endpoints without Content-Type → 400
  it("1h: POST without Content-Type application/json returns 400", async () => {
    const postEndpoints = [
      "/v1/passports",
      "/v1/bindings",
      "/v1/observations",
    ];

    for (const path of postEndpoints) {
      const res = await t.app.request(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken()}` },
        body: "{}",
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  // 1i: Token refresh endpoint is the ONLY unprotected POST
  it("1i: token refresh works without auth header", async () => {
    t.addTokenFamily({
      family_id: "fam_noauth",
      binding_id: "bnd_test",
      current_generation: 0,
      created_at: "2026-10-01T00:00:00Z",
      revoked_at: null,
    });

    const res = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "refresh|fam_noauth|0" }),
    });
    expect(res.status).toBe(200);
  });
});
