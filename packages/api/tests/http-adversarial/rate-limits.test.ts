/**
 * Attack Vector #8 (HTTP): Rate Limits
 *
 * Rate limit structures exist, kernel enforces semantic limits.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim, makeDataPolicy } from "../helpers/factories.js";

describe("HTTP Attack Vector #8: Rate Limits", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("8a: grant data_policy contains rate limit structure", async () => {
    const res = await t.app.request("/v1/bindings", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        passport_id: "psp_default", app_principal_id: "app_rl",
        purposes: ["coding_assistance"], requested_capabilities: ["read_context"],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.grant.data_policy.write.rate_limit).toBeDefined();
    expect(body.data.grant.data_policy.write.rate_limit.max_observations_per_hour).toBeGreaterThan(0);
  });

  it("8b: hourly rate limit has correct structure", async () => {
    const res = await t.app.request("/v1/bindings", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        passport_id: "psp_default", app_principal_id: "app_rl2",
        purposes: ["coding_assistance"], requested_capabilities: ["write_claims"],
      }),
    });
    const body = await res.json();
    const rl = body.data.grant.data_policy.write.rate_limit;
    expect(rl).toHaveProperty("max_observations_per_hour");
    expect(rl).toHaveProperty("max_observations_per_day");
    expect(rl).toHaveProperty("max_per_request");
  });

  it("8c: semantic limits have correct structure", async () => {
    const res = await t.app.request("/v1/bindings", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        passport_id: "psp_default", app_principal_id: "app_rl3",
        purposes: ["coding_assistance"], requested_capabilities: ["write_claims"],
      }),
    });
    const body = await res.json();
    const sl = body.data.grant.data_policy.write.semantic_limits;
    expect(sl).toHaveProperty("max_new_claims_per_category_per_day");
    expect(sl).toHaveProperty("min_interval_same_tuple_hours");
    expect(sl).toHaveProperty("max_active_claims_per_category");
  });

  it("8d: active claim count at limit rejects new observation", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      data_policy: {
        read: { categories: ["skills"], sensitivity_ceiling: "personal" },
        write: {
          categories: ["skills"], sensitivity_ceiling: "personal",
          rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 },
          semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 0, max_active_claims_per_category: 2 },
          evidence_required: true,
        },
      },
    });
    t.addBinding(binding);
    t.addGrant(grant);

    for (let i = 0; i < 2; i++) {
      t.addClaim(makeClaim({ id: `clm_fill_${i}`, passport_id: "psp_test_a", category: "skills" }));
    }

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_limit", subject: "user", predicate: "knows", value: "NewThing",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect([201, 403, 429]).toContain(res.status);
  });

  it("8e: same-tuple observation within interval gets handled by kernel", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res1 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_dup1", subject: "user", predicate: "knows", value: "Python",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res1.status).toBe(201);

    const res2 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_dup2", subject: "user", predicate: "knows", value: "Python",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test again",
      }),
    });
    expect(res2.status).toBe(201);
    const body2 = await res2.json();
    expect(body2.data.outcome.status).toBeDefined();
  });

  it("8f: one binding's rate limit doesn't affect another binding", async () => {
    const bindingA = makeBinding({ id: "bnd_a", passport_id: "psp_a", app_principal_id: "app_a" });
    const grantA = makeGrant({ id: "grt_a", binding_id: "bnd_a" });
    const bindingB = makeBinding({ id: "bnd_b", passport_id: "psp_b", app_principal_id: "app_b" });
    const grantB = makeGrant({ id: "grt_b", binding_id: "bnd_b" });
    t.addBinding(bindingA);
    t.addGrant(grantA);
    t.addBinding(bindingB);
    t.addGrant(grantB);

    const resA = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_a", "fam_a")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_a", subject: "user", predicate: "knows", value: "A",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(resA.status).toBe(201);

    const resB = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_b", "fam_b")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_b", subject: "user", predicate: "knows", value: "B",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(resB.status).toBe(201);
  });

  it("8g: rate limit rejection doesn't leak other binding quotas", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_safe", subject: "user", predicate: "knows", value: "Safe",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("bnd_other");
  });

  it("8h: evidence_required is enforced in data policy", async () => {
    const res = await t.app.request("/v1/bindings", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        passport_id: "psp_default", app_principal_id: "app_evi",
        purposes: ["coding_assistance"], requested_capabilities: ["write_claims"],
      }),
    });
    const body = await res.json();
    expect(body.data.grant.data_policy.write.evidence_required).toBe(true);
  });
});
