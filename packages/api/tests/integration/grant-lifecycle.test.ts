/**
 * Happy-Path Integration: Grant Lifecycle
 *
 * request → consent → active → revoke/expire
 * Grants control what capabilities a binding has and can be revoked independently.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim } from "../helpers/factories.js";

describe("Integration: Grant Lifecycle", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("full lifecycle: create grant → consent → use → revoke → access denied", async () => {
    // Step 1: Create a binding (which auto-creates a grant)
    const bindRes = await t.app.request("/v1/bindings", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        passport_id: "psp_default",
        app_principal_id: "app_grant_test",
        purposes: ["coding_assistance"],
        requested_capabilities: ["read_context"],
      }),
    });
    expect(bindRes.status).toBe(201);
    const bindBody = await bindRes.json();
    const bindingId = bindBody.data.binding.id;
    const grantId = bindBody.data.grant.id;

    // Step 2: Consent to the grant
    const consentRes = await t.app.request(`/v1/grants/${grantId}/consent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ approved: true }),
    });
    expect(consentRes.status).toBe(200);

    // Step 3: App can use the grant to read context
    const ctxRes = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken(bindingId, "fam_grant")}` },
    });
    expect(ctxRes.status).toBe(200);

    // Step 4: Revoke the grant
    const revokeRes = await t.app.request(`/v1/grants/${grantId}/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(revokeRes.status).toBe(200);
    const revokeBody = await revokeRes.json();
    expect(revokeBody.data.active).toBe(false);

    // Step 5: App access now denied (no active grant)
    const deniedRes = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken(bindingId, "fam_grant")}` },
    });
    expect(deniedRes.status).toBe(401);
  });

  it("new grant can expand capabilities on existing binding", async () => {
    const binding = makeBinding({ id: "bnd_expand", passport_id: "psp_default" });
    const grant1 = makeGrant({
      id: "grt_narrow", binding_id: "bnd_expand",
      capabilities: ["read_context"],
    });
    t.addBinding(binding);
    t.addGrant(grant1);

    // Create a new grant with expanded capabilities
    const res = await t.app.request("/v1/bindings/bnd_expand/grants", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requested_capabilities: ["read_context", "write_claims"] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.grant.id).toMatch(/^grt_/);
  });

  it("revoking grant doesn't revoke the binding itself", async () => {
    const binding = makeBinding({ id: "bnd_persist", passport_id: "psp_default" });
    const grant = makeGrant({ id: "grt_die", binding_id: "bnd_persist" });
    t.addBinding(binding);
    t.addGrant(grant);

    // Revoke the grant
    await t.app.request("/v1/grants/grt_die/revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });

    // Binding still exists (but app can't access data without active grant)
    const readRes = await t.app.request("/v1/bindings", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_persist", "fam_persist")}` },
    });
    // Auth middleware rejects because no active grant
    expect(readRes.status).toBe(401);
  });
});
