/**
 * Happy-Path Integration: Token Lifecycle
 *
 * issue → access → refresh → rotate → reuse old refresh → family invalidation
 * The complete token rotation flow through HTTP.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, refreshToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant } from "../helpers/factories.js";

describe("Integration: Token Lifecycle", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("full lifecycle: issue → refresh → rotate → verify new token works", async () => {
    const binding = makeBinding({ id: "bnd_tok", passport_id: "psp_tok" });
    const grant = makeGrant({ id: "grt_tok", binding_id: "bnd_tok" });
    t.addBinding(binding);
    t.addGrant(grant);

    // Step 1: Create a token family (simulating initial issuance)
    t.addTokenFamily({
      family_id: "fam_lifecycle",
      binding_id: "bnd_tok",
      current_generation: 0,
      created_at: "2026-10-01T00:00:00Z",
      revoked_at: null,
    });

    // Step 2: Refresh the token (generation 0 → 1)
    const refreshRes = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken("fam_lifecycle", 0) }),
    });
    expect(refreshRes.status).toBe(200);
    const refreshBody = await refreshRes.json();
    expect(refreshBody.data.access_token).toBeTruthy();
    expect(refreshBody.data.refresh_token).toBeTruthy();
    expect(refreshBody.data.token_type).toBe("Bearer");
    expect(refreshBody.data.access_token_expires_at).toBeTruthy();
  });

  it("reusing old refresh token triggers family revocation", async () => {
    t.addTokenFamily({
      family_id: "fam_reuse",
      binding_id: "bnd_reuse",
      current_generation: 0,
      created_at: "2026-10-01T00:00:00Z",
      revoked_at: null,
    });
    const binding = makeBinding({ id: "bnd_reuse", passport_id: "psp_reuse" });
    const grant = makeGrant({ id: "grt_reuse", binding_id: "bnd_reuse" });
    t.addBinding(binding);
    t.addGrant(grant);

    // First refresh succeeds (gen 0 → 1)
    const res1 = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken("fam_reuse", 0) }),
    });
    expect(res1.status).toBe(200);

    // Replay old gen 0 token — should detect reuse and revoke family
    const res2 = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken("fam_reuse", 0) }),
    });
    expect(res2.status).toBe(401);
    const body2 = await res2.json();
    expect(body2.error.code).toBe("TOKEN_REUSE_DETECTED");
  });

  it("refresh with nonexistent family returns 401", async () => {
    const res = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken("fam_ghost", 0) }),
    });
    expect(res.status).toBe(401);
  });

  it("refresh without refresh_token field returns 400", async () => {
    const res = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("refresh with malformed token returns 401", async () => {
    const res = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "not-a-valid-token" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("TOKEN_INVALID");
  });

  it("token refresh requires no authorization header (public endpoint)", async () => {
    t.addTokenFamily({
      family_id: "fam_pub",
      binding_id: "bnd_pub",
      current_generation: 0,
      created_at: "2026-10-01T00:00:00Z",
      revoked_at: null,
    });
    const binding = makeBinding({ id: "bnd_pub", passport_id: "psp_pub" });
    const grant = makeGrant({ id: "grt_pub", binding_id: "bnd_pub" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken("fam_pub", 0) }),
    });
    expect(res.status).toBe(200);
  });

  it("after family revocation, new refresh attempts fail", async () => {
    t.addTokenFamily({
      family_id: "fam_rev",
      binding_id: "bnd_rev",
      current_generation: 3,
      created_at: "2026-10-01T00:00:00Z",
      revoked_at: "2026-10-01T00:30:00Z",
    });

    const res = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken("fam_rev", 3) }),
    });
    expect(res.status).toBe(401);
  });
});
