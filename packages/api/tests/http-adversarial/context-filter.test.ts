/**
 * Attack Vector #6 (HTTP): Context Filter-Before-Synthesis
 *
 * Filters run before context assembly. No unauthorized data leaks through.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim } from "../helpers/factories.js";

describe("HTTP Attack Vector #6: Context Filter-Before-Synthesis", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  function seedWithGrant(grantOverrides = {}) {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      data_policy: {
        read: { categories: ["skills"], sensitivity_ceiling: "personal" },
        write: { categories: ["skills"], sensitivity_ceiling: "personal", rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 }, semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 }, evidence_required: true },
      },
      ...grantOverrides,
    });
    t.addBinding(binding);
    t.addGrant(grant);
  }

  it("6a: context only contains claims from authorized categories", async () => {
    seedWithGrant();
    t.addClaim(makeClaim({ id: "clm_skill", passport_id: "psp_test_a", category: "skills", sensitivity: "public" }));
    t.addClaim(makeClaim({ id: "clm_health", passport_id: "psp_test_a", category: "health", sensitivity: "public" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.items.map((i: { claim_id: string }) => i.claim_id);
    expect(ids).toContain("clm_skill");
    expect(ids).not.toContain("clm_health");
  });

  it("6b: claims above sensitivity ceiling excluded from context", async () => {
    seedWithGrant();
    t.addClaim(makeClaim({ id: "clm_pub", passport_id: "psp_test_a", category: "skills", sensitivity: "public" }));
    t.addClaim(makeClaim({ id: "clm_restr", passport_id: "psp_test_a", category: "skills", sensitivity: "restricted" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    const body = await res.json();
    const ids = body.data.items.map((i: { claim_id: string }) => i.claim_id);
    expect(ids).toContain("clm_pub");
    expect(ids).not.toContain("clm_restr");
  });

  it("6c: claims with user_only sharing policy excluded", async () => {
    seedWithGrant();
    t.addClaim(makeClaim({ id: "clm_shared", passport_id: "psp_test_a", category: "skills", sensitivity: "public", sharing_policy: { type: "grant_controlled" } }));
    t.addClaim(makeClaim({ id: "clm_private", passport_id: "psp_test_a", category: "skills", sensitivity: "public", sharing_policy: { type: "user_only" } }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    const body = await res.json();
    const ids = body.data.items.map((i: { claim_id: string }) => i.claim_id);
    expect(ids).toContain("clm_shared");
    expect(ids).not.toContain("clm_private");
  });

  it("6d: explicit_only claims excluded when binding not in approved list", async () => {
    seedWithGrant();
    t.addClaim(makeClaim({
      id: "clm_explicit", passport_id: "psp_test_a", category: "skills", sensitivity: "public",
      sharing_policy: { type: "explicit_only", approved_binding_ids: ["bnd_other"] },
    }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    const body = await res.json();
    const ids = body.data.items.map((i: { claim_id: string }) => i.claim_id);
    expect(ids).not.toContain("clm_explicit");
  });

  it("6e: explicit_only claims included when binding is in approved list", async () => {
    seedWithGrant();
    t.addClaim(makeClaim({
      id: "clm_approved", passport_id: "psp_test_a", category: "skills", sensitivity: "public",
      sharing_policy: { type: "explicit_only", approved_binding_ids: ["bnd_test_a"] },
    }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    const body = await res.json();
    const ids = body.data.items.map((i: { claim_id: string }) => i.claim_id);
    expect(ids).toContain("clm_approved");
  });

  it("6f: deleted claims excluded from context", async () => {
    seedWithGrant();
    t.addClaim(makeClaim({ id: "clm_active", passport_id: "psp_test_a", category: "skills", sensitivity: "public", deleted: false }));
    t.addClaim(makeClaim({ id: "clm_deleted", passport_id: "psp_test_a", category: "skills", sensitivity: "public", deleted: true }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    const body = await res.json();
    const ids = body.data.items.map((i: { claim_id: string }) => i.claim_id);
    expect(ids).toContain("clm_active");
    expect(ids).not.toContain("clm_deleted");
  });

  it("6g: expired claims excluded from context", async () => {
    seedWithGrant();
    t.addClaim(makeClaim({ id: "clm_valid", passport_id: "psp_test_a", category: "skills", sensitivity: "public", state: "SUPPORTED" }));
    t.addClaim(makeClaim({ id: "clm_expired", passport_id: "psp_test_a", category: "skills", sensitivity: "public", state: "EXPIRED" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    const body = await res.json();
    const ids = body.data.items.map((i: { claim_id: string }) => i.claim_id);
    expect(ids).toContain("clm_valid");
    expect(ids).not.toContain("clm_expired");
  });

  it("6h: response items don't contain passport_id or evidence_ids", async () => {
    seedWithGrant();
    t.addClaim(makeClaim({ id: "clm_check", passport_id: "psp_test_a", category: "skills", sensitivity: "public" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    const body = await res.json();
    for (const item of body.data.items) {
      expect(item).not.toHaveProperty("passport_id");
      expect(item).not.toHaveProperty("evidence_ids");
    }
  });
});
