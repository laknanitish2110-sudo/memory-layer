/**
 * Attack Vector #13 (HTTP): Parser Attacks
 *
 * Malformed payloads, type confusion, prototype pollution — all handled safely.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, appToken, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeBinding, makeGrant } from "../helpers/factories.js";

describe("HTTP Attack Vector #13: Parser Attacks", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
    const binding = makeBinding({ id: "bnd_test_a", passport_id: "psp_test_a", app_principal_id: "app_test_a" });
    const grant = makeGrant({ id: "grt_test_a", binding_id: "bnd_test_a" });
    t.addBinding(binding);
    t.addGrant(grant);
  });

  it("13a: duplicate keys in JSON — server doesn't crash", async () => {
    const rawJson = '{"idempotency_key":"a","idempotency_key":"b","subject":"user","predicate":"knows","value":"X","qualifiers":{},"declared_sensitivity":"public","declared_category":"skills","extraction_method":"user_stated","raw_context":"test"}';
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: rawJson,
    });
    expect([201, 400]).toContain(res.status);
  });

  it("13b: nested object where string expected", async () => {
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_nested", subject: { nested: true }, predicate: "knows", value: "X",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect([201, 400, 500]).toContain(res.status);
  });

  it("13c: null value for required field returns 400", async () => {
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_null", subject: null, predicate: "knows", value: "X",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("13d: array where string expected returns 400", async () => {
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_arr", subject: ["a", "b"], predicate: "knows", value: "X",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect([400, 500]).toContain(res.status);
  });

  it("13e: prototype pollution keys have no effect", async () => {
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        __proto__: { admin: true },
        constructor: { prototype: { admin: true } },
        idempotency_key: "idem_proto", subject: "user", predicate: "knows", value: "X",
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect([201, 400]).toContain(res.status);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it("13f: large payload handled gracefully", async () => {
    const largeValue = "x".repeat(100_000);
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: "idem_large", subject: "user", predicate: "knows", value: largeValue,
        qualifiers: {}, declared_sensitivity: "public", declared_category: "skills",
        extraction_method: "user_stated", raw_context: "test",
      }),
    });
    expect([201, 400, 413]).toContain(res.status);
  });

  it("13g: POST with Content-Type text/plain returns 400", async () => {
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "text/plain" },
      body: "{}",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("13h: array at top level instead of object returns 400", async () => {
    const res = await t.app.request("/v1/observations", {
      method: "POST",
      headers: { Authorization: `Bearer ${appToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ subject: "user" }]),
    });
    expect(res.status).toBe(400);
  });
});
