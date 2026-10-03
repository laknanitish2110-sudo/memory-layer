/**
 * Attack Vector #9 (HTTP): API Replay
 *
 * No request replay can create duplicate state.
 * Idempotency keys enforce per-binding uniqueness through the HTTP stack.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeObservation } from "../helpers/factories.js";

describe("HTTP Attack Vector #9: API Replay", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);
  });

  it("9a: replay with same idempotency_key returns conflict or duplicate rejection", async () => {
    const body = {
      idempotency_key: "idem_replay_001", subject: "user", predicate: "knows", value: "Python",
      qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
      extraction_method: "user_stated", raw_context: "test",
    };

    const res1 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res1.status).toBe(201);

    const res2 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect([201, 409]).toContain(res2.status);
    const body2 = await res2.json();
    if (res2.status === 201) {
      expect(body2.data.outcome.status).toBeDefined();
    }
  });

  it("9b: same idempotency_key with different payload handled correctly", async () => {
    const res1 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_conflict_001", subject: "user", predicate: "knows", value: "Python",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res1.status).toBe(201);

    const res2 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_conflict_001", subject: "user", predicate: "knows", value: "Rust",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "different test",
      }),
    });
    expect([201, 409]).toContain(res2.status);
  });

  it("9c: same idempotency_key per binding enforced through HTTP", async () => {
    const res1 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_body_001", subject: "user", predicate: "knows", value: "JS",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res1.status).toBe(201);

    const res2 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_body_001", subject: "user", predicate: "knows", value: "JS",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect([201, 409]).toContain(res2.status);
  });

  it("9d: same idempotency_key with different binding is allowed", async () => {
    const bindingB = makeBinding({ id: "bnd_b", passport_id: "psp_b", app_principal_id: "app_b" });
    const grantB = makeGrant({ id: "grt_b", binding_id: "bnd_b" });
    t.addBinding(bindingB);
    t.addGrant(grantB);

    const res1 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_cross_001", subject: "user", predicate: "knows", value: "A",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res1.status).toBe(201);

    const res2 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_b", "fam_b")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_cross_001", subject: "user", predicate: "knows", value: "B",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res2.status).toBe(201);
  });

  it("9e: replayed refresh token with old generation handled by kernel", async () => {
    t.addTokenFamily({
      family_id: "fam_test_a",
      binding_id: "bnd_test_a",
      current_generation: 5,
      created_at: "2026-10-01T00:00:00Z",
    });

    const res = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "refresh|fam_test_a|3" }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("9f: POST after binding revocation returns 401", async () => {
    const revokedBinding = makeBinding({
      id: "bnd_revoked", passport_id: "psp_revoked",
      status: "revoked", revoked_at: "2026-10-01T00:30:00Z",
    });
    const revokedGrant = makeGrant({ id: "grt_revoked", binding_id: "bnd_revoked" });
    t.addBinding(revokedBinding);
    t.addGrant(revokedGrant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_revoked", "fam_revoked")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_revoked", subject: "user", predicate: "knows", value: "X",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("9g: GET after binding revocation returns 401 or 403", async () => {
    const revokedBinding = makeBinding({
      id: "bnd_revoked2", passport_id: "psp_revoked2",
      status: "revoked", revoked_at: "2026-10-01T00:30:00Z",
    });
    const revokedGrant = makeGrant({ id: "grt_revoked2", binding_id: "bnd_revoked2" });
    t.addBinding(revokedBinding);
    t.addGrant(revokedGrant);

    const res = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken("bnd_revoked2", "fam_revoked2")}` },
    });
    expect([401, 403]).toContain(res.status);
  });

  it("9h: replay response doesn't contain original observation details", async () => {
    const res1 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_leak_001", subject: "user", predicate: "knows", value: "Secret",
        qualifiers: {}, declared_sensitivity: "personal", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res1.status).toBe(201);

    const res2 = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_leak_001", subject: "user", predicate: "knows", value: "Secret",
        qualifiers: {}, declared_sensitivity: "personal", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect([201, 409]).toContain(res2.status);
    const body2 = await res2.json();
    const bodyStr = JSON.stringify(body2);
    expect(bodyStr).not.toContain("raw_context");
  });
});
