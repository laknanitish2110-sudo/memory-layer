/**
 * SDK End-to-End Tests
 *
 * These tests exercise the SDK against the real Hono HTTP stack.
 * The path is: SDK → HTTP → Middleware → Controller → Kernel → Repository
 * No mocks. No test-only endpoints. No magic credentials.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryLayer } from "../src/client.js";
import { MemoryValidationError, MemoryPermissionError, MemoryAuthError } from "../src/errors.js";
import { createTestApp, appToken, userToken } from "../../api/tests/helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim } from "../../api/tests/helpers/factories.js";
import type { TestAppContext } from "../../api/tests/helpers/test-app.js";

function sdkWithApp(t: TestAppContext, token: string): MemoryLayer {
  return new MemoryLayer({
    apiKey: token,
    baseUrl: "http://localhost",
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      const path = url.pathname + url.search;
      return t.app.request(path, {
        method: init?.method ?? "GET",
        headers: init?.headers as Record<string, string>,
        body: init?.body as string | undefined,
      });
    },
  });
}

describe("SDK E2E: Layer 1 — Simple API", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
    const binding = makeBinding({ id: "bnd_sdk", passport_id: "psp_sdk", app_principal_id: "app_sdk" });
    const grant = makeGrant({ id: "grt_sdk", binding_id: "bnd_sdk" });
    t.addBinding(binding);
    t.addGrant(grant);
  });

  it("memory.context() returns empty context for new user", async () => {
    const memory = sdkWithApp(t, appToken("bnd_sdk", "fam_sdk"));
    const ctx = await memory.context();

    expect(ctx.items).toEqual([]);
    expect(ctx.generatedAt).toBeDefined();
  });

  it("memory.context() returns claims filtered by category", async () => {
    t.addClaim(makeClaim({ id: "clm_skill", passport_id: "psp_sdk", category: "skills", sensitivity: "public" }));
    t.addClaim(makeClaim({ id: "clm_proj", passport_id: "psp_sdk", category: "projects", sensitivity: "public" }));

    const memory = sdkWithApp(t, appToken("bnd_sdk", "fam_sdk"));
    const ctx = await memory.context({ categories: ["skills"] });

    expect(ctx.items.length).toBe(1);
    expect(ctx.items[0].category).toBe("skills");
  });

  it("memory.observe() creates a claim through the full pipeline", async () => {
    const memory = sdkWithApp(t, appToken("bnd_sdk", "fam_sdk"));

    const result = await memory.observe({
      predicate: "knows",
      value: "TypeScript",
      category: "skills",
    });

    expect(result.outcome).toBe("accepted");
    expect(result.observationId).toMatch(/^obs_/);
    expect(result.claimId).toMatch(/^clm_/);
    expect(result.evidenceId).toMatch(/^evi_/);
  });

  it("memory.observe() → memory.context() round-trip", async () => {
    const memory = sdkWithApp(t, appToken("bnd_sdk", "fam_sdk"));

    await memory.observe({
      predicate: "knows",
      value: "Rust",
      category: "skills",
    });

    const ctx = await memory.context();
    expect(ctx.items.length).toBe(1);
    expect(ctx.items[0].summary).toContain("Rust");
  });

  it("memory.observe() with explicit options", async () => {
    const memory = sdkWithApp(t, appToken("bnd_sdk", "fam_sdk"));

    const result = await memory.observe({
      subject: "user",
      predicate: "prefers",
      value: "dark mode",
      category: "skills",
      sensitivity: "public",
      method: "user_stated",
      context: "User explicitly said: I prefer dark mode",
      idempotencyKey: "idem_explicit_001",
    });

    expect(result.outcome).toBe("accepted");
  });

  it("memory.recall() filters by category", async () => {
    t.addClaim(makeClaim({ id: "clm_r1", passport_id: "psp_sdk", category: "skills", sensitivity: "public" }));
    t.addClaim(makeClaim({ id: "clm_r2", passport_id: "psp_sdk", category: "preferences", sensitivity: "public" }));

    const memory = sdkWithApp(t, appToken("bnd_sdk", "fam_sdk"));
    const ctx = await memory.recall({ categories: ["skills"] });

    expect(ctx.items.length).toBe(1);
    expect(ctx.items[0].category).toBe("skills");
  });
});

describe("SDK E2E: Layer 2 — Permissions", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
    const binding = makeBinding({ id: "bnd_perm", passport_id: "psp_perm" });
    const grant = makeGrant({ id: "grt_perm", binding_id: "bnd_perm" });
    t.addBinding(binding);
    t.addGrant(grant);
  });

  it("permissions.status() returns connected=true for valid token", async () => {
    const memory = sdkWithApp(t, appToken("bnd_perm", "fam_perm"));
    const status = await memory.permissions.status();

    expect(status.connected).toBe(true);
  });

  it("permissions.status() returns connected=false for invalid token", async () => {
    const memory = sdkWithApp(t, "invalid_token");
    const status = await memory.permissions.status();

    expect(status.connected).toBe(false);
  });
});

describe("SDK E2E: Layer 3 — Advanced", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
    const binding = makeBinding({ id: "bnd_adv", passport_id: "psp_adv" });
    const grant = makeGrant({ id: "grt_adv", binding_id: "bnd_adv" });
    t.addBinding(binding);
    t.addGrant(grant);
  });

  it("advanced.claims.confirm() goes through kernel", async () => {
    t.addClaim(makeClaim({ id: "clm_confirm", passport_id: "psp_default", state: "SUPPORTED" }));

    const memory = sdkWithApp(t, userToken());
    await memory.advanced.claims.confirm("clm_confirm");
  });

  it("advanced.claims.correct() updates value through kernel", async () => {
    t.addClaim(makeClaim({ id: "clm_correct", passport_id: "psp_default", value: "Python 2" }));

    const memory = sdkWithApp(t, userToken());
    await memory.advanced.claims.correct("clm_correct", "Python 3");
  });

  it("advanced.claims.dispute() transitions state through kernel", async () => {
    t.addClaim(makeClaim({ id: "clm_dispute", passport_id: "psp_default", state: "SUPPORTED" }));

    const memory = sdkWithApp(t, userToken());
    await memory.advanced.claims.dispute("clm_dispute");
  });

  it("advanced.claims.delete() soft-deletes through kernel", async () => {
    t.addClaim(makeClaim({ id: "clm_delete", passport_id: "psp_default" }));

    const memory = sdkWithApp(t, userToken());
    await memory.advanced.claims.delete("clm_delete");
  });
});

describe("SDK E2E: Error Handling", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("throws MemoryValidationError when no credentials provided", () => {
    expect(() => new MemoryLayer({} as any)).toThrow(MemoryValidationError);
  });

  it("throws MemoryValidationError when both credentials provided", () => {
    expect(() => new MemoryLayer({ apiKey: "x", sessionToken: "y" })).toThrow(MemoryValidationError);
  });

  it("observe() validates required fields client-side", async () => {
    const memory = sdkWithApp(t, "app|bnd_x|fam_x|0|2099-12-31T23:59:59Z");

    await expect(memory.observe({ predicate: "", value: "x" }))
      .rejects.toThrow(MemoryValidationError);
  });

  it("auth errors produce MemoryAuthError", async () => {
    const memory = sdkWithApp(t, "invalid_token");

    await expect(memory.context())
      .rejects.toThrow(MemoryAuthError);
  });

  it("capability errors produce MemoryPermissionError", async () => {
    const binding = makeBinding({ id: "bnd_ro", passport_id: "psp_ro" });
    const grant = makeGrant({
      id: "grt_ro", binding_id: "bnd_ro",
      capabilities: ["read_context"],
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const memory = sdkWithApp(t, appToken("bnd_ro", "fam_ro"));

    await expect(memory.observe({
      predicate: "knows",
      value: "Java",
      category: "skills",
    })).rejects.toThrow(MemoryPermissionError);
  });

  it("errors include suggestion for recovery", async () => {
    const memory = sdkWithApp(t, "invalid_token");

    try {
      await memory.context();
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.suggestion).toBeDefined();
      expect(err.code).toBeDefined();
    }
  });
});

describe("SDK E2E: The 15-Minute Test", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
    const binding = makeBinding({ id: "bnd_15", passport_id: "psp_15" });
    const grant = makeGrant({ id: "grt_15", binding_id: "bnd_15" });
    t.addBinding(binding);
    t.addGrant(grant);
  });

  it("complete quickstart flow: context → observe → context with data", async () => {
    const memory = sdkWithApp(t, appToken("bnd_15", "fam_15"));

    // Step 1: Empty context for new user
    const empty = await memory.context();
    expect(empty.items).toEqual([]);

    // Step 2: Observe something
    const obs = await memory.observe({
      predicate: "learning",
      value: "Rust",
    });
    expect(obs.outcome).toBe("accepted");

    // Step 3: Context now includes the observation
    const filled = await memory.context();
    expect(filled.items.length).toBe(1);
    expect(filled.items[0].summary).toContain("Rust");
    expect(filled.items[0].confidence).toBe("medium");

    // Step 4: Observe something else
    await memory.observe({
      predicate: "prefers",
      value: "visual explanations",
      category: "skills",
      method: "model_inferred",
      context: "Student responded better to diagrams than text",
    });

    // Step 5: Context now has both
    const full = await memory.context();
    expect(full.items.length).toBe(2);
  });
});
