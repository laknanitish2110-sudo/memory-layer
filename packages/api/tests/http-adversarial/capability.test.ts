/**
 * Attack Vector #5 (HTTP): Capability Confusion
 *
 * Each capability grants exactly what it names. No implicit escalation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim, makeDataPolicy } from "../helpers/factories.js";

describe("HTTP Attack Vector #5: Capability Confusion", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("5a: read_context does not grant read_claims", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      capabilities: ["read_context"],
    });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_x", passport_id: "psp_test_a" }));

    const res = await t.app.request("/v1/claims/clm_x", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).not.toBe(200);
  });

  it("5b: read_claims does not grant write_claims", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      capabilities: ["read_claims"],
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_001", subject: "user", predicate: "knows", value: "X",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res.status).not.toBe(201);
  });

  it("5c: write_claims does not grant retract_own_observation", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      capabilities: ["write_claims"],
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations/obs_any/retract", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).not.toBe(200);
  });

  it("5d: app with no capabilities denied on all data endpoints", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      capabilities: [],
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).not.toBe(200);
  });

  it("5e: read categories ['skills'] cannot read claim with category 'health'", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      capabilities: ["read_claims"],
      data_policy: {
        read: { categories: ["skills"], sensitivity_ceiling: "personal" },
        write: { categories: [], sensitivity_ceiling: "personal", rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 }, semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 }, evidence_required: true },
      },
    });
    t.addBinding(binding);
    t.addGrant(grant);

    t.addClaim(makeClaim({ id: "clm_health", passport_id: "psp_test_a", category: "health" }));

    const res = await t.app.request("/v1/claims/clm_health", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(404);
  });

  it("5f: write categories ['skills'] denies observation with category 'health'", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      capabilities: ["write_claims"],
      data_policy: {
        read: { categories: ["skills"], sensitivity_ceiling: "personal" },
        write: { categories: ["skills"], sensitivity_ceiling: "personal", rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 }, semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 }, evidence_required: true },
      },
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_health", subject: "user", predicate: "has", value: "diabetes",
        qualifiers: {}, declared_sensitivity: "sensitive", declared_category: "health",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res.status).not.toBe(201);
  });

  it("5g: sensitivity above ceiling denied", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      capabilities: ["write_claims"],
      data_policy: {
        read: { categories: ["skills"], sensitivity_ceiling: "personal" },
        write: { categories: ["skills"], sensitivity_ceiling: "personal", rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 }, semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 }, evidence_required: true },
      },
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_sens", subject: "user", predicate: "knows", value: "secret",
        qualifiers: {}, declared_sensitivity: "restricted", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res.status).not.toBe(201);
  });

  it("5h: unauthorized purpose denied", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({
      id: "grt_test_a", binding_id: "bnd_test_a",
      capabilities: ["write_claims"],
      authorized_purposes: ["coding_assistance"],
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_purp", subject: "user", predicate: "knows", value: "Python",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test", purpose: "surveillance",
      }),
    });
    expect(res.status).not.toBe(201);
  });
});
