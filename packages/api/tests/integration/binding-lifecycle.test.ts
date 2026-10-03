/**
 * Happy-Path Integration: Binding Lifecycle
 *
 * create → authorize → use → revoke → old access fails
 * A binding connects an app to a passport with scoped permissions.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim } from "../helpers/factories.js";

describe("Integration: Binding Lifecycle", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("full lifecycle: create binding → app reads data → user revokes → app denied", async () => {
    // Step 1: User creates a binding for an app
    const createRes = await t.app.request("/v1/bindings", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        passport_id: "psp_default",
        app_principal_id: "app_coding",
        purposes: ["coding_assistance"],
        requested_capabilities: ["read_context", "write_claims"],
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const bindingId = createBody.data.binding.id;
    const grantId = createBody.data.grant.id;
    expect(bindingId).toMatch(/^bnd_/);
    expect(createBody.data.binding.status).toBe("active");

    // Step 2: App can read its binding
    const readRes = await t.app.request("/v1/bindings", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken(bindingId, "fam_coding")}` },
    });
    expect(readRes.status).toBe(200);
    const readBody = await readRes.json();
    expect(readBody.data.id).toBe(bindingId);

    // Step 3: User revokes the binding
    const revokeRes = await t.app.request(`/v1/bindings/${bindingId}/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(revokeRes.status).toBe(200);
    const revokeBody = await revokeRes.json();
    expect(revokeBody.data.status).toBe("revoked");

    // Step 4: App can no longer access data — kernel denies revoked binding
    const ctxRes = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken(bindingId, "fam_coding")}` },
    });
    expect([401, 403]).toContain(ctxRes.status);
  });

  it("binding gives app scoped access — only authorized categories visible", async () => {
    const binding = makeBinding({ id: "bnd_scoped", passport_id: "psp_scoped" });
    const grant = makeGrant({
      id: "grt_scoped", binding_id: "bnd_scoped",
      data_policy: {
        read: { categories: ["skills"], sensitivity_ceiling: "personal" },
        write: {
          categories: ["skills"], sensitivity_ceiling: "personal",
          rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 },
          semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 },
          evidence_required: true,
        },
      },
    });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_skill", passport_id: "psp_scoped", category: "skills", sensitivity: "public" }));
    t.addClaim(makeClaim({ id: "clm_pref", passport_id: "psp_scoped", category: "preferences", sensitivity: "public" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_scoped", "fam_scoped")}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.items.map((i: any) => i.claim_id);
    expect(ids).toContain("clm_skill");
    expect(ids).not.toContain("clm_pref");
  });

  it("user cannot revoke another user's binding", async () => {
    const otherBinding = makeBinding({ id: "bnd_other", passport_id: "psp_other" });
    t.addBinding(otherBinding);

    const res = await t.app.request("/v1/bindings/bnd_other/revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });
});
