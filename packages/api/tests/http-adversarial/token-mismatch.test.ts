/**
 * Attack Vector #12 (HTTP): Token/Binding Mismatch
 *
 * Token must match a valid, active binding with an active grant.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant } from "../helpers/factories.js";

describe("HTTP Attack Vector #12: Token/Binding Mismatch", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("12a: token for binding_a can only see binding_a data", async () => {
    const bindingA = makeBinding({ id: "bnd_a", passport_id: "psp_a" });
    const grantA = makeGrant({ id: "grt_a", binding_id: "bnd_a" });
    const bindingB = makeBinding({ id: "bnd_b", passport_id: "psp_b" });
    const grantB = makeGrant({ id: "grt_b", binding_id: "bnd_b" });
    t.addBinding(bindingA);
    t.addGrant(grantA);
    t.addBinding(bindingB);
    t.addGrant(grantB);

    const res = await t.app.request("/v1/bindings", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_a", "fam_a")}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("bnd_a");
  });

  it("12b: token for revoked binding — kernel denies data access", async () => {
    const binding = makeBinding({ id: "bnd_rev", passport_id: "psp_rev", status: "revoked", revoked_at: "2026-10-01T00:00:00Z" });
    const grant = makeGrant({ id: "grt_rev", binding_id: "bnd_rev" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_rev", "fam_rev")}` },
    });
    expect([401, 403]).toContain(res.status);
  });

  it("12c: token for binding with inactive grant returns 401", async () => {
    const binding = makeBinding({ id: "bnd_ig", passport_id: "psp_ig" });
    const grant = makeGrant({ id: "grt_ig", binding_id: "bnd_ig", active: false });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/bindings", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_ig", "fam_ig")}` },
    });
    expect(res.status).toBe(401);
  });

  it("12d: token for suspended binding — kernel denies data access", async () => {
    const binding = makeBinding({ id: "bnd_susp", passport_id: "psp_susp", status: "suspended", suspended_at: "2026-10-01T00:00:00Z" });
    const grant = makeGrant({ id: "grt_susp", binding_id: "bnd_susp" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_susp", "fam_susp")}` },
    });
    expect([401, 403]).toContain(res.status);
  });

  it("12e: token with nonexistent binding returns 401", async () => {
    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_phantom", "fam_ph")}` },
    });
    expect(res.status).toBe(401);
  });

  it("12f: token for binding with no grant at all returns 401", async () => {
    const binding = makeBinding({ id: "bnd_bare", passport_id: "psp_bare" });
    t.addBinding(binding);

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_bare", "fam_bare")}` },
    });
    expect(res.status).toBe(401);
  });

  it("12g: binding at revision 2 still works with valid token", async () => {
    const binding = makeBinding({ id: "bnd_r2", passport_id: "psp_r2", revision: 2 });
    const grant = makeGrant({ id: "grt_r2", binding_id: "bnd_r2" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/bindings", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_r2", "fam_r2")}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("bnd_r2");
  });
});
