/**
 * SDK Adversarial Tests — M3.3
 *
 * Attacks the SDK boundary to verify:
 * 1. SDK never turns an API failure into a misleading success
 * 2. Every HTTP error → correct MemoryError subclass
 * 3. Cross-passport isolation holds through the SDK
 * 4. Malformed inputs are rejected before or at the API
 * 5. Capability/category enforcement works end-to-end
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryLayer } from "../src/client.js";
import {
  MemoryAuthError,
  MemoryPermissionError,
  MemoryValidationError,
  MemoryError,
} from "../src/errors.js";
import { createTestApp, appToken, userToken } from "../../api/tests/helpers/test-app.js";
import { makeBinding, makeGrant, makeClaim, makeDataPolicy } from "../../api/tests/helpers/factories.js";
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

// ─── Attack Vector 1: Authentication Failures ────────────────────

describe("SDK Adversarial: Authentication", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("garbage token → MemoryAuthError on context()", async () => {
    const memory = sdkWithApp(t, "garbage_token_xyz");
    await expect(memory.context()).rejects.toThrow(MemoryAuthError);
  });

  it("garbage token → MemoryAuthError on observe()", async () => {
    const memory = sdkWithApp(t, "garbage_token_xyz");
    await expect(memory.observe({
      predicate: "knows",
      value: "TypeScript",
    })).rejects.toThrow(MemoryAuthError);
  });

  it("empty token → MemoryValidationError at construction", () => {
    expect(() => sdkWithApp(t, "")).toThrow(MemoryValidationError);
  });

  it("expired token format → MemoryAuthError", async () => {
    const expired = "app|bnd_x|fam_x|0|2020-01-01T00:00:00Z";
    const memory = sdkWithApp(t, expired);
    await expect(memory.context()).rejects.toThrow(MemoryAuthError);
  });

  it("token for nonexistent binding → MemoryAuthError", async () => {
    const memory = sdkWithApp(t, appToken("bnd_nonexistent", "fam_x"));
    await expect(memory.context()).rejects.toThrow(MemoryAuthError);
  });

  it("auth errors always include .code and .suggestion", async () => {
    const memory = sdkWithApp(t, "garbage");
    try {
      await memory.context();
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(MemoryAuthError);
      expect(err.code).toBeDefined();
      expect(err.suggestion).toBeDefined();
      expect(typeof err.suggestion).toBe("string");
      expect(err.suggestion.length).toBeGreaterThan(0);
    }
  });
});

// ─── Attack Vector 2: Capability Enforcement ─────────────────────

describe("SDK Adversarial: Capability Enforcement", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("read-only grant → observe() throws MemoryPermissionError", async () => {
    const binding = makeBinding({ id: "bnd_ro", passport_id: "psp_ro" });
    const grant = makeGrant({
      id: "grt_ro",
      binding_id: "bnd_ro",
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

  it("read-only grant → context() succeeds", async () => {
    const binding = makeBinding({ id: "bnd_ro2", passport_id: "psp_ro2" });
    const grant = makeGrant({
      id: "grt_ro2",
      binding_id: "bnd_ro2",
      capabilities: ["read_context"],
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const memory = sdkWithApp(t, appToken("bnd_ro2", "fam_ro2"));
    const ctx = await memory.context();
    expect(ctx.items).toEqual([]);
  });

  it("permission error includes correct .code", async () => {
    const binding = makeBinding({ id: "bnd_code", passport_id: "psp_code" });
    const grant = makeGrant({
      id: "grt_code",
      binding_id: "bnd_code",
      capabilities: ["read_context"],
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const memory = sdkWithApp(t, appToken("bnd_code", "fam_code"));
    try {
      await memory.observe({ predicate: "knows", value: "Go" });
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(MemoryPermissionError);
      expect(err.code).toBe("PERMISSION_DENIED");
    }
  });
});

// ─── Attack Vector 3: Category Enforcement ───────────────────────

describe("SDK Adversarial: Category Enforcement", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
    const binding = makeBinding({ id: "bnd_cat", passport_id: "psp_cat" });
    const grant = makeGrant({
      id: "grt_cat",
      binding_id: "bnd_cat",
      data_policy: makeDataPolicy({
        write: { categories: ["skills"] },
      }),
    });
    t.addBinding(binding);
    t.addGrant(grant);
  });

  it("writing to unauthorized category → MemoryPermissionError", async () => {
    const memory = sdkWithApp(t, appToken("bnd_cat", "fam_cat"));
    await expect(memory.observe({
      predicate: "likes",
      value: "pizza",
      category: "preferences",
    })).rejects.toThrow(MemoryPermissionError);
  });

  it("category error has CATEGORY_DENIED code", async () => {
    const memory = sdkWithApp(t, appToken("bnd_cat", "fam_cat"));
    try {
      await memory.observe({
        predicate: "health",
        value: "fine",
        category: "health",
        sensitivity: "sensitive",
      });
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(MemoryPermissionError);
      expect(err.code).toBe("CATEGORY_DENIED");
    }
  });

  it("writing to authorized category succeeds", async () => {
    const memory = sdkWithApp(t, appToken("bnd_cat", "fam_cat"));
    const result = await memory.observe({
      predicate: "knows",
      value: "Python",
      category: "skills",
    });
    expect(result.outcome).toBe("accepted");
  });
});

// ─── Attack Vector 4: Cross-Passport Isolation ───────────────────

describe("SDK Adversarial: Cross-Passport Isolation", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
    const binding1 = makeBinding({ id: "bnd_a", passport_id: "psp_alice" });
    const grant1 = makeGrant({
      id: "grt_a",
      binding_id: "bnd_a",
      data_policy: makeDataPolicy({ write: { categories: ["skills"] } }),
    });
    const binding2 = makeBinding({ id: "bnd_b", passport_id: "psp_bob" });
    const grant2 = makeGrant({
      id: "grt_b",
      binding_id: "bnd_b",
      data_policy: makeDataPolicy({ write: { categories: ["skills"] } }),
    });
    t.addBinding(binding1);
    t.addGrant(grant1);
    t.addBinding(binding2);
    t.addGrant(grant2);
  });

  it("Alice's observations are invisible to Bob", async () => {
    const alice = sdkWithApp(t, appToken("bnd_a", "fam_a"));
    const bob = sdkWithApp(t, appToken("bnd_b", "fam_b"));

    await alice.observe({
      predicate: "knows",
      value: "Alice's secret skill",
      category: "skills",
    });

    const aliceCtx = await alice.context();
    expect(aliceCtx.items.length).toBe(1);

    const bobCtx = await bob.context();
    expect(bobCtx.items.length).toBe(0);
  });

  it("Bob's observations are invisible to Alice", async () => {
    const alice = sdkWithApp(t, appToken("bnd_a", "fam_a"));
    const bob = sdkWithApp(t, appToken("bnd_b", "fam_b"));

    await bob.observe({
      predicate: "knows",
      value: "Bob's private data",
      category: "skills",
    });

    const aliceCtx = await alice.context();
    expect(aliceCtx.items.length).toBe(0);

    const bobCtx = await bob.context();
    expect(bobCtx.items.length).toBe(1);
  });
});

// ─── Attack Vector 5: Client-Side Validation ─────────────────────

describe("SDK Adversarial: Client-Side Validation", () => {
  it("observe() with empty predicate → MemoryValidationError", async () => {
    const t = createTestApp();
    const memory = sdkWithApp(t, appToken("bnd_x", "fam_x"));
    await expect(memory.observe({
      predicate: "",
      value: "something",
    })).rejects.toThrow(MemoryValidationError);
  });

  it("observe() with empty value → MemoryValidationError", async () => {
    const t = createTestApp();
    const memory = sdkWithApp(t, appToken("bnd_x", "fam_x"));
    await expect(memory.observe({
      predicate: "knows",
      value: "",
    })).rejects.toThrow(MemoryValidationError);
  });

  it("constructor with no credentials → MemoryValidationError", () => {
    expect(() => new MemoryLayer({} as any)).toThrow(MemoryValidationError);
  });

  it("constructor with both credentials → MemoryValidationError", () => {
    expect(() => new MemoryLayer({
      apiKey: "x",
      sessionToken: "y",
    })).toThrow(MemoryValidationError);
  });

  it("validation errors include .suggestion", () => {
    try {
      new MemoryLayer({} as any);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(MemoryValidationError);
      expect(err.suggestion).toBeDefined();
      expect(err.suggestion.length).toBeGreaterThan(0);
    }
  });
});

// ─── Attack Vector 6: Error Classification ───────────────────────

describe("SDK Adversarial: Error Classification", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("401 → MemoryAuthError (not generic MemoryError)", async () => {
    const memory = sdkWithApp(t, "bad_token");
    try {
      await memory.context();
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(MemoryAuthError);
      expect(err).not.toBeInstanceOf(MemoryPermissionError);
    }
  });

  it("403 (capability) → MemoryPermissionError (not MemoryAuthError)", async () => {
    const binding = makeBinding({ id: "bnd_perm", passport_id: "psp_perm" });
    const grant = makeGrant({
      id: "grt_perm",
      binding_id: "bnd_perm",
      capabilities: ["read_context"],
    });
    t.addBinding(binding);
    t.addGrant(grant);

    const memory = sdkWithApp(t, appToken("bnd_perm", "fam_perm"));
    try {
      await memory.observe({ predicate: "knows", value: "Go" });
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(MemoryPermissionError);
      expect(err).not.toBeInstanceOf(MemoryAuthError);
    }
  });

  it("all SDK errors extend MemoryError", async () => {
    const memory = sdkWithApp(t, "bad");
    try {
      await memory.context();
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(MemoryError);
    }
  });

  it("errors are proper Error instances with stack traces", async () => {
    const memory = sdkWithApp(t, "bad");
    try {
      await memory.context();
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(Error);
      expect(err.stack).toBeDefined();
      expect(err.message).toBeDefined();
      expect(err.message.length).toBeGreaterThan(0);
    }
  });
});

// ─── Attack Vector 7: Claim Operations on Wrong Passport ─────────

describe("SDK Adversarial: Cross-Passport Claim Operations", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
    const binding = makeBinding({ id: "bnd_claim", passport_id: "psp_claim" });
    const grant = makeGrant({ id: "grt_claim", binding_id: "bnd_claim" });
    t.addBinding(binding);
    t.addGrant(grant);
  });

  it("confirm() on nonexistent claim → error (not silent success)", async () => {
    const memory = sdkWithApp(t, userToken());
    await expect(
      memory.advanced.claims.confirm("clm_does_not_exist")
    ).rejects.toThrow();
  });

  it("correct() on nonexistent claim → error (not silent success)", async () => {
    const memory = sdkWithApp(t, userToken());
    await expect(
      memory.advanced.claims.correct("clm_does_not_exist", "new value")
    ).rejects.toThrow();
  });

  it("dispute() on nonexistent claim → error (not silent success)", async () => {
    const memory = sdkWithApp(t, userToken());
    await expect(
      memory.advanced.claims.dispute("clm_does_not_exist")
    ).rejects.toThrow();
  });

  it("delete() on nonexistent claim → error (not silent success)", async () => {
    const memory = sdkWithApp(t, userToken());
    await expect(
      memory.advanced.claims.delete("clm_does_not_exist")
    ).rejects.toThrow();
  });
});

// ─── Attack Vector 8: SDK Must Not Swallow Errors ────────────────

describe("SDK Adversarial: No Silent Failures", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("network timeout → MemoryError with NETWORK_ERROR code", async () => {
    const memory = new MemoryLayer({
      apiKey: "test_key",
      baseUrl: "http://localhost",
      timeout: 1,
      fetch: async (_input: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const timer = setTimeout(() => _resolve(new Response("too late")), 100);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      },
    });

    try {
      await memory.context();
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(MemoryError);
      expect(err.code).toBe("NETWORK_ERROR");
    }
  });

  it("non-JSON error response → MemoryError (not unhandled parse error)", async () => {
    const memory = new MemoryLayer({
      apiKey: "test_key",
      baseUrl: "http://localhost",
      fetch: async () => new Response("Internal Server Error", { status: 500 }),
    });

    try {
      await memory.context();
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(MemoryError);
    }
  });

  it("malformed JSON error response → MemoryError", async () => {
    const memory = new MemoryLayer({
      apiKey: "test_key",
      baseUrl: "http://localhost",
      fetch: async () => new Response("{broken json", {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    });

    try {
      await memory.context();
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(MemoryError);
    }
  });

  it("permissions.status() returns connected=false on auth failure (not throw)", async () => {
    const memory = sdkWithApp(t, "invalid_token");
    const status = await memory.permissions.status();
    expect(status.connected).toBe(false);
  });
});
