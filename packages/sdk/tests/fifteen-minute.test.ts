/**
 * 15-Minute App — Integration Test
 *
 * Proves the reference app's flow works end-to-end against the real stack.
 * Same path as production: SDK → HTTP → Middleware → Controller → Kernel → Repository
 *
 * Run: npx vitest run (from packages/sdk)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryLayer, MemoryPermissionError } from "../src/index.js";
import { createTestApp, appToken } from "../../api/tests/helpers/test-app.js";
import { makeBinding, makeGrant, makeDataPolicy } from "../../api/tests/helpers/factories.js";
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

describe("15-Minute App — The Reference Flow", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
    const binding = makeBinding({ id: "bnd_quick", passport_id: "psp_quick", app_principal_id: "app_quick" });
    const grant = makeGrant({
      id: "grt_quick",
      binding_id: "bnd_quick",
      data_policy: makeDataPolicy({
        write: { categories: ["skills", "preferences"] },
      }),
    });
    t.addBinding(binding);
    t.addGrant(grant);
  });

  it("completes the entire quickstart flow without protocol knowledge", async () => {
    const memory = sdkWithApp(t, appToken("bnd_quick", "fam_quick"));

    // Step 1: Check what you already know (empty for new user)
    const existing = await memory.context();
    expect(existing.items).toEqual([]);

    // Step 2: Record what you learned
    const obs1 = await memory.observe({
      predicate: "learning",
      value: "Rust",
      category: "skills",
    });
    expect(obs1.outcome).toBe("accepted");

    const obs2 = await memory.observe({
      predicate: "prefers",
      value: "visual explanations with diagrams",
      category: "preferences",
      method: "model_inferred",
      context: "User responded better to diagrams than text-heavy explanations",
    });
    expect(obs2.outcome).toBe("accepted");

    // Step 3: Read back — both observations are now in context
    const updated = await memory.context();
    expect(updated.items.length).toBe(2);

    const summaries = updated.items.map((i) => i.summary);
    expect(summaries.some((s) => s.includes("Rust"))).toBe(true);
    expect(summaries.some((s) => s.includes("visual explanations"))).toBe(true);

    // Step 4: Filter by category
    const skills = await memory.context({ categories: ["skills"] });
    expect(skills.items.length).toBe(1);
    expect(skills.items[0].category).toBe("skills");

    // Step 5: Permission boundaries work
    // The default grant allows skills + preferences, not health
    const restrictedGrant = makeGrant({
      id: "grt_restricted",
      binding_id: "bnd_quick",
      capabilities: ["read_context"],
    });
    t.addGrant(restrictedGrant);

    const restrictedMemory = sdkWithApp(t, appToken("bnd_quick", "fam_quick2"));

    await expect(
      restrictedMemory.observe({
        predicate: "diagnosed_with",
        value: "anxiety",
        category: "health",
        sensitivity: "sensitive",
      })
    ).rejects.toThrow(MemoryPermissionError);
  });
});
