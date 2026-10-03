/**
 * Happy-Path Integration: Passport Lifecycle
 *
 * create → retrieve → isolation
 * Two passports cannot see each other's data.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim } from "../helpers/factories.js";

describe("Integration: Passport Lifecycle", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("creates a new passport and returns its ID", async () => {
    const res = await t.app.request("/v1/passports", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Learning Identity" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toMatch(/^psp_/);
    expect(body.data.name).toBe("My Learning Identity");
  });

  it("lists passports for the authenticated user", async () => {
    const res = await t.app.request("/v1/passports", {
      method: "GET",
      headers: { Authorization: `Bearer ${userToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("two passports are fully isolated — no data leaks across boundary", async () => {
    const bindingA = makeBinding({ id: "bnd_a", passport_id: "psp_alice", app_principal_id: "app_x" });
    const grantA = makeGrant({ id: "grt_a", binding_id: "bnd_a" });
    const bindingB = makeBinding({ id: "bnd_b", passport_id: "psp_bob", app_principal_id: "app_x" });
    const grantB = makeGrant({ id: "grt_b", binding_id: "bnd_b" });
    t.addBinding(bindingA);
    t.addGrant(grantA);
    t.addBinding(bindingB);
    t.addGrant(grantB);

    t.addClaim(makeClaim({ id: "clm_alice", passport_id: "psp_alice", category: "skills", sensitivity: "public", value: "Alice's skill" }));
    t.addClaim(makeClaim({ id: "clm_bob", passport_id: "psp_bob", category: "skills", sensitivity: "public", value: "Bob's skill" }));

    const aliceCtx = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_a", "fam_a")}` },
    });
    expect(aliceCtx.status).toBe(200);
    const aliceBody = await aliceCtx.json();
    const aliceIds = aliceBody.data.items.map((i: any) => i.claim_id);
    expect(aliceIds).toContain("clm_alice");
    expect(aliceIds).not.toContain("clm_bob");

    const bobCtx = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_b", "fam_b")}` },
    });
    expect(bobCtx.status).toBe(200);
    const bobBody = await bobCtx.json();
    const bobIds = bobBody.data.items.map((i: any) => i.claim_id);
    expect(bobIds).toContain("clm_bob");
    expect(bobIds).not.toContain("clm_alice");
  });

  it("passport creation is user-auth only — app tokens cannot create passports", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/passports", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Attacker Passport" }),
    });
    expect(res.status).toBe(401);
  });
});
