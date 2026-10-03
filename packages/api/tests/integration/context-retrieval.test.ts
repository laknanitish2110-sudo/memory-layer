/**
 * Happy-Path Integration: Context Retrieval
 *
 * GET /context → authorized claims → ContextModel → validation → AI application
 * This is the product's killer endpoint — what makes AI apps remember.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim } from "../helpers/factories.js";

describe("Integration: Context Retrieval", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("returns authorized claims filtered by grant categories", async () => {
    const binding = makeBinding({ id: "bnd_ctx", passport_id: "psp_ctx" });
    const grant = makeGrant({
      id: "grt_ctx", binding_id: "bnd_ctx",
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

    t.addClaim(makeClaim({ id: "clm_skill", passport_id: "psp_ctx", category: "skills", sensitivity: "public" }));
    t.addClaim(makeClaim({ id: "clm_pref", passport_id: "psp_ctx", category: "preferences", sensitivity: "public" }));
    t.addClaim(makeClaim({ id: "clm_proj", passport_id: "psp_ctx", category: "projects", sensitivity: "public" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_ctx", "fam_ctx")}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const categories = body.data.items.map((i: any) => i.category);
    expect(categories).toContain("skills");
    expect(categories).not.toContain("preferences");
    expect(categories).not.toContain("projects");
  });

  it("respects sensitivity ceiling — excludes claims above ceiling", async () => {
    const binding = makeBinding({ id: "bnd_sens", passport_id: "psp_sens" });
    const grant = makeGrant({
      id: "grt_sens", binding_id: "bnd_sens",
      data_policy: {
        read: { categories: ["skills", "preferences"], sensitivity_ceiling: "personal" },
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

    t.addClaim(makeClaim({ id: "clm_pub", passport_id: "psp_sens", category: "skills", sensitivity: "public" }));
    t.addClaim(makeClaim({ id: "clm_pers", passport_id: "psp_sens", category: "skills", sensitivity: "personal" }));
    t.addClaim(makeClaim({ id: "clm_sens", passport_id: "psp_sens", category: "skills", sensitivity: "sensitive" }));
    t.addClaim(makeClaim({ id: "clm_rest", passport_id: "psp_sens", category: "skills", sensitivity: "restricted" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_sens", "fam_sens")}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.items.map((i: any) => i.claim_id);
    expect(ids).toContain("clm_pub");
    expect(ids).toContain("clm_pers");
    expect(ids).not.toContain("clm_sens");
    expect(ids).not.toContain("clm_rest");
  });

  it("context response includes metadata for AI consumption", async () => {
    const binding = makeBinding({ id: "bnd_meta", passport_id: "psp_meta" });
    const grant = makeGrant({ id: "grt_meta", binding_id: "bnd_meta" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_meta", passport_id: "psp_meta", category: "skills", sensitivity: "public" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_meta", "fam_meta")}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.generated_at).toBeDefined();
    expect(body.data.policy_version).toBe("v0.1.0");
    expect(body.meta.request_id).toMatch(/^req_/);

    const item = body.data.items[0];
    expect(item).toHaveProperty("claim_id");
    expect(item).toHaveProperty("category");
    expect(item).toHaveProperty("sensitivity");
    expect(item).toHaveProperty("summary");
    expect(item).toHaveProperty("confidence_band");
  });

  it("deleted claims are excluded from context", async () => {
    const binding = makeBinding({ id: "bnd_del", passport_id: "psp_del" });
    const grant = makeGrant({ id: "grt_del", binding_id: "bnd_del" });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_live", passport_id: "psp_del", category: "skills", sensitivity: "public", deleted: false }));
    t.addClaim(makeClaim({ id: "clm_dead", passport_id: "psp_del", category: "skills", sensitivity: "public", deleted: true, deleted_at: "2026-10-01T00:30:00Z" }));

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_del", "fam_del")}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.items.map((i: any) => i.claim_id);
    expect(ids).toContain("clm_live");
    expect(ids).not.toContain("clm_dead");
  });

  it("empty context returns valid structure with zero items", async () => {
    const binding = makeBinding({ id: "bnd_empty", passport_id: "psp_empty" });
    const grant = makeGrant({ id: "grt_empty", binding_id: "bnd_empty" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_empty", "fam_empty")}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.generated_at).toBeDefined();
  });

  it("context response always includes Cache-Control: no-store", async () => {
    const binding = makeBinding({ id: "bnd_cache", passport_id: "psp_cache" });
    const grant = makeGrant({ id: "grt_cache", binding_id: "bnd_cache" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_cache", "fam_cache")}` },
    });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
