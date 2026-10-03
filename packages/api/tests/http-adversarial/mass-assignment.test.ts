/**
 * Attack Vector #4 (HTTP): Mass Assignment
 *
 * Server-determined fields rejected. Client cannot set IDs, status, outcomes.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant } from "../helpers/factories.js";

describe("HTTP Attack Vector #4: Mass Assignment", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  function seedAppAuth() {
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);
  }

  const validObs = {
    idempotency_key: "idem_001",
    subject: "user",
    predicate: "knows",
    value: "TypeScript",
    qualifiers: {},
    declared_sensitivity: "public",
    declared_category: "skills",
    extraction_method: "user_stated",
    raw_context: "User said they know TypeScript",
  };

  it("4a: observation with 'id' in body is rejected", async () => {
    seedAppAuth();
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...validObs, id: "obs_hacked" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("4b: observation with 'binding_id' in body is rejected", async () => {
    seedAppAuth();
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...validObs, binding_id: "bnd_attacker" }),
    });
    expect(res.status).toBe(400);
  });

  it("4c: observation with 'outcome' in body is rejected", async () => {
    seedAppAuth();
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...validObs, outcome: { status: "accepted" } }),
    });
    expect(res.status).toBe(400);
  });

  it("4d: observation with 'submitted_at' in body is rejected", async () => {
    seedAppAuth();
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...validObs, submitted_at: "2020-01-01T00:00:00Z" }),
    });
    expect(res.status).toBe(400);
  });

  it("4e: binding status is always 'active' regardless of body", async () => {
    const res = await t.app.request("/v1/bindings", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        passport_id: "psp_default",
        app_principal_id: "app_evil",
        status: "revoked",
        purposes: ["coding_assistance"],
        requested_capabilities: ["read_context"],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.binding.status).toBe("active");
  });

  it("4f: binding ID is server-generated, body 'id' ignored", async () => {
    const res = await t.app.request("/v1/bindings", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "bnd_hacked",
        passport_id: "psp_default",
        app_principal_id: "app_test",
        purposes: ["coding_assistance"],
        requested_capabilities: ["read_context"],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.binding.id).toMatch(/^bnd_/);
    expect(body.data.binding.id).not.toBe("bnd_hacked");
  });

  it("4g: passport ID is server-generated, body 'id' ignored", async () => {
    const res = await t.app.request("/v1/passports", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "psp_hacked", name: "Test" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toMatch(/^psp_/);
    expect(body.data.id).not.toBe("psp_hacked");
  });

  it("4h: observation_id in response is server-generated", async () => {
    seedAppAuth();
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(validObs),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.observation_id).toMatch(/^obs_/);
  });

  it("4i: valid observation with declared_sensitivity passes through kernel", async () => {
    seedAppAuth();
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...validObs, idempotency_key: "idem_002" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.outcome.status).toBeDefined();
  });

  it("4j: grant ID is server-generated", async () => {
    const binding = makeBinding({ id: "bnd_g", passport_id: "psp_default" });
    t.addBinding(binding);

    const res = await t.app.request("/v1/bindings/bnd_g/grants", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "grt_hacked", requested_capabilities: ["read_context"] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.grant.id).toMatch(/^grt_/);
    expect(body.data.grant.id).not.toBe("grt_hacked");
  });

  it("4k: grant active is always true, body 'active: false' ignored", async () => {
    const binding = makeBinding({ id: "bnd_g2", passport_id: "psp_default" });
    t.addBinding(binding);

    const res = await t.app.request("/v1/bindings/bnd_g2/grants", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ active: false, requested_capabilities: ["read_context"] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.grant.active).toBe(true);
  });
});
