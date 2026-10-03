import { describe, it, expect } from "vitest";
import { synthesize, validateOutput, type ContextModel } from "../../src/context/context-model.js";
import { makeClaim } from "../helpers.js";

describe("Context Engine", () => {
  describe("synthesize()", () => {
    it("builds ContextItems from authorized claims", () => {
      const claims = [
        makeClaim({ id: "c1", subject: "user", predicate: "knows", value: "Python" }),
        makeClaim({ id: "c2", subject: "user", predicate: "prefers", value: "dark mode" }),
      ];
      const items = synthesize(claims);
      expect(items).toHaveLength(2);
      expect(items[0]!.claim_id).toBe("c1");
      expect(items[0]!.summary).toContain("Python");
    });

    it("excludes deleted claims", () => {
      const claims = [
        makeClaim({ id: "c1", deleted: false }),
        makeClaim({ id: "c2", deleted: true }),
      ];
      const items = synthesize(claims);
      expect(items).toHaveLength(1);
      expect(items[0]!.claim_id).toBe("c1");
    });

    it("excludes expired claims", () => {
      const claims = [
        makeClaim({ id: "c1", state: "OBSERVED" }),
        makeClaim({ id: "c2", state: "EXPIRED" }),
      ];
      const items = synthesize(claims);
      expect(items).toHaveLength(1);
    });

    it("maps state to confidence band correctly", () => {
      expect(synthesize([makeClaim({ state: "DECLARED" })])[0]!.confidence_band).toBe("high");
      expect(synthesize([makeClaim({ state: "SUPPORTED" })])[0]!.confidence_band).toBe("high");
      expect(synthesize([makeClaim({ state: "OBSERVED" })])[0]!.confidence_band).toBe("medium");
      expect(synthesize([makeClaim({ state: "CONTESTED" })])[0]!.confidence_band).toBe("low");
      expect(synthesize([makeClaim({ state: "UNKNOWN" })])[0]!.confidence_band).toBe("low");
      expect(synthesize([makeClaim({ state: "STALE" })])[0]!.confidence_band).toBe("low");
    });
  });

  describe("validateOutput()", () => {
    it("VALID when all items within bounds", () => {
      const context: ContextModel = {
        items: [
          { claim_id: "c1", category: "skills", sensitivity: "public", summary: "knows Python", confidence_band: "high" },
        ],
        passport_id: "p1",
        generated_at: "2024-01-01T00:00:00Z",
        policy_version: "v0.1.0",
      };
      const result = validateOutput(context, ["skills", "preferences"], "personal");
      expect(result.status).toBe("VALID");
    });

    it("INVALID when category not authorized", () => {
      const context: ContextModel = {
        items: [
          { claim_id: "c1", category: "emotional_patterns", sensitivity: "public", summary: "test", confidence_band: "low" },
        ],
        passport_id: "p1",
        generated_at: "2024-01-01T00:00:00Z",
        policy_version: "v0.1.0",
      };
      const result = validateOutput(context, ["skills"], "personal");
      expect(result.status).toBe("INVALID");
      if (result.status === "INVALID") {
        expect(result.violation).toContain("emotional_patterns");
      }
    });

    it("INVALID when sensitivity exceeds ceiling", () => {
      const context: ContextModel = {
        items: [
          { claim_id: "c1", category: "skills", sensitivity: "sensitive", summary: "test", confidence_band: "low" },
        ],
        passport_id: "p1",
        generated_at: "2024-01-01T00:00:00Z",
        policy_version: "v0.1.0",
      };
      const result = validateOutput(context, ["skills"], "personal");
      expect(result.status).toBe("INVALID");
      if (result.status === "INVALID") {
        expect(result.violation).toContain("sensitivity");
      }
    });

    it("VALID with empty items", () => {
      const context: ContextModel = {
        items: [],
        passport_id: "p1",
        generated_at: "2024-01-01T00:00:00Z",
        policy_version: "v0.1.0",
      };
      const result = validateOutput(context, ["skills"], "personal");
      expect(result.status).toBe("VALID");
    });

    it("binary output — never silently strips", () => {
      const context: ContextModel = {
        items: [
          { claim_id: "c1", category: "skills", sensitivity: "public", summary: "ok", confidence_band: "high" },
          { claim_id: "c2", category: "emotional_patterns", sensitivity: "sensitive", summary: "leak", confidence_band: "low" },
        ],
        passport_id: "p1",
        generated_at: "2024-01-01T00:00:00Z",
        policy_version: "v0.1.0",
      };
      const result = validateOutput(context, ["skills"], "personal");
      expect(result.status).toBe("INVALID");
    });
  });
});
