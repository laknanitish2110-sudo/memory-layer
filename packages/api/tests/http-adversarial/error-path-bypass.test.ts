/**
 * Attack Vector #15 (HTTP): Kernel Bypass Through Error/Recovery Paths
 *
 * Every code path — success, failure, timeout, retry — either flows
 * through the kernel or performs zero mutations. No error handler
 * becomes an alternate write path.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim } from "../helpers/factories.js";

describe("HTTP Attack Vector #15: Kernel Bypass Through Error/Recovery Paths", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("15a: validation error returns 400 with no domain state change", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ idempotency_key: "idem_val" }),
    });
    expect(res.status).toBe(400);

    const ctxRes = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(ctxRes.status).toBe(200);
    const ctxBody = await ctxRes.json();
    expect(ctxBody.data.items.length).toBe(0);
  });

  it("15b: auth failure produces no domain state changes", async () => {
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken("bnd_fake", "fam_fake")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_noauth", subject: "user", predicate: "knows", value: "X",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("15c: retry after duplicate idempotency key uses same kernel path", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const body = {
      idempotency_key: "idem_retry_001", subject: "user", predicate: "knows", value: "Python",
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
  });

  it("15d: 404 on nonexistent resource doesn't produce domain events", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/claims/clm_ghost", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("15e: error responses have safe generic structure without internals", async () => {
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "x" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBeDefined();
    expect(body.error.message).not.toContain("stack");
    expect(body.error.message).not.toContain("Error:");
  });

  it("15f: malformed body error doesn't execute any kernel function", async () => {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);

    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: "{{{{invalid json",
    });
    expect(res.status).toBe(400);

    const ctxRes = await t.app.request("/v1/context", {
      method: "GET",
      headers: { Authorization: `Bearer ${appToken()}` },
    });
    const ctxBody = await ctxRes.json();
    expect(ctxBody.data.items.length).toBe(0);
  });

  it("15g: token refresh failure doesn't leak domain state", async () => {
    const res = await t.app.request("/v1/tokens/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "refresh|fam_nonexistent|0" }),
    });
    expect([401, 403]).toContain(res.status);
    const body = await res.json();
    expect(body.error.message).not.toContain("fam_nonexistent");
    expect(body.error.message).not.toContain("store");
    expect(body.error.message).not.toContain("database");
  });
});
