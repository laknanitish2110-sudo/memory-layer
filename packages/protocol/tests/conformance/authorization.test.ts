import { describe, it, expect } from "vitest";
import { authorize, filterClaimsBySensitivity, filterClaimsByCategory, filterClaimsBySharingPolicy } from "../../src/authorization/engine.js";
import type { AuthorizationRequest } from "../../src/authorization/types.js";
import { makeBinding, makeGrant, makeClaim } from "../helpers.js";

describe("Authorization Engine", () => {
  const defaultRequest: AuthorizationRequest = {
    credential_id: "cred_1",
    binding_id: "binding_1",
    binding_revision: 1,
    capability: "read_claims",
    categories: ["skills"],
    max_sensitivity: "personal",
    purpose: null,
  };

  describe("binding checks", () => {
    it("DENY when binding not found", () => {
      const result = authorize(defaultRequest, null, makeGrant());
      expect(result).toEqual({ decision: "DENY", reason: "binding_not_found" });
    });

    it("DENY when binding ID mismatch", () => {
      const result = authorize(
        defaultRequest,
        makeBinding({ id: "wrong_binding" }),
        makeGrant()
      );
      expect(result).toEqual({ decision: "DENY", reason: "binding_not_found" });
    });

    it("DENY when binding is revoked", () => {
      const result = authorize(
        defaultRequest,
        makeBinding({ status: "revoked" }),
        makeGrant()
      );
      expect(result).toEqual({ decision: "DENY", reason: "binding_revoked" });
    });

    it("DENY when binding is suspended", () => {
      const result = authorize(
        defaultRequest,
        makeBinding({ status: "suspended" }),
        makeGrant()
      );
      expect(result).toEqual({ decision: "DENY", reason: "binding_suspended" });
    });

    it("DENY when binding revision is stale", () => {
      const result = authorize(
        { ...defaultRequest, binding_revision: 0 },
        makeBinding({ revision: 1 }),
        makeGrant()
      );
      expect(result).toEqual({ decision: "DENY", reason: "stale_binding_revision" });
    });

    it("ALLOW when binding revision matches", () => {
      const result = authorize(
        { ...defaultRequest, binding_revision: 5 },
        makeBinding({ revision: 5 }),
        makeGrant()
      );
      expect(result.decision).toBe("ALLOW");
    });

    it("ALLOW when request carries a higher revision than binding (future revision)", () => {
      const result = authorize(
        { ...defaultRequest, binding_revision: 10 },
        makeBinding({ revision: 5 }),
        makeGrant()
      );
      expect(result.decision).toBe("ALLOW");
    });
  });

  describe("grant checks", () => {
    it("DENY when grant is null", () => {
      const result = authorize(defaultRequest, makeBinding(), null);
      expect(result).toEqual({ decision: "DENY", reason: "grant_not_found" });
    });

    it("DENY when grant is inactive", () => {
      const result = authorize(
        defaultRequest,
        makeBinding(),
        makeGrant({ active: false })
      );
      expect(result).toEqual({ decision: "DENY", reason: "grant_inactive" });
    });

    it("DENY when grant belongs to different binding", () => {
      const result = authorize(
        defaultRequest,
        makeBinding(),
        makeGrant({ binding_id: "other_binding" })
      );
      expect(result).toEqual({ decision: "DENY", reason: "grant_not_found" });
    });
  });

  describe("capability checks", () => {
    it("DENY when capability not in grant", () => {
      const result = authorize(
        { ...defaultRequest, capability: "read_evidence" },
        makeBinding(),
        makeGrant({ capabilities: ["read_context", "read_claims"] })
      );
      expect(result).toEqual({ decision: "DENY", reason: "capability_not_granted" });
    });

    it("ALLOW when capability is in grant", () => {
      const result = authorize(defaultRequest, makeBinding(), makeGrant());
      expect(result.decision).toBe("ALLOW");
    });
  });

  describe("category checks", () => {
    it("DENY when category not in read policy", () => {
      const result = authorize(
        { ...defaultRequest, categories: ["emotional_patterns"] },
        makeBinding(),
        makeGrant()
      );
      expect(result).toEqual({ decision: "DENY", reason: "category_not_granted" });
    });

    it("ALLOW when all categories are in policy", () => {
      const result = authorize(
        { ...defaultRequest, categories: ["skills", "preferences"] },
        makeBinding(),
        makeGrant()
      );
      expect(result.decision).toBe("ALLOW");
    });
  });

  describe("sensitivity checks", () => {
    it("DENY when sensitivity exceeds ceiling", () => {
      const result = authorize(
        { ...defaultRequest, max_sensitivity: "sensitive" },
        makeBinding(),
        makeGrant()
      );
      expect(result).toEqual({ decision: "DENY", reason: "sensitivity_exceeds_ceiling" });
    });

    it("ALLOW when sensitivity within ceiling", () => {
      const result = authorize(
        { ...defaultRequest, max_sensitivity: "public" },
        makeBinding(),
        makeGrant()
      );
      expect(result.decision).toBe("ALLOW");
    });
  });

  describe("purpose checks", () => {
    it("DENY when purpose not authorized", () => {
      const result = authorize(
        { ...defaultRequest, purpose: "health_monitoring" },
        makeBinding(),
        makeGrant({ authorized_purposes: ["coding_assistance"] })
      );
      expect(result).toEqual({ decision: "DENY", reason: "purpose_not_authorized" });
    });

    it("ALLOW when purpose matches", () => {
      const result = authorize(
        { ...defaultRequest, purpose: "coding_assistance" },
        makeBinding(),
        makeGrant()
      );
      expect(result.decision).toBe("ALLOW");
    });

    it("ALLOW when no purpose in request", () => {
      const result = authorize(
        { ...defaultRequest, purpose: null },
        makeBinding(),
        makeGrant()
      );
      expect(result.decision).toBe("ALLOW");
    });
  });

  describe("ALLOW result shape", () => {
    it("returns correct metadata on ALLOW", () => {
      const result = authorize(defaultRequest, makeBinding(), makeGrant());
      expect(result).toEqual({
        decision: "ALLOW",
        binding_id: "binding_1",
        grant_id: "grant_1",
        grant_version: 1,
        effective_categories: ["skills"],
        effective_sensitivity_ceiling: "personal",
        binding_revision: 1,
        policy_version: "v0.1.0",
      });
    });
  });

  describe("claim filtering", () => {
    const claims = [
      makeClaim({ id: "c1", sensitivity: "public", category: "skills" }),
      makeClaim({ id: "c2", sensitivity: "personal", category: "skills" }),
      makeClaim({ id: "c3", sensitivity: "sensitive", category: "goals" }),
      makeClaim({ id: "c4", sensitivity: "restricted", category: "emotional_patterns" }),
    ];

    it("filters by sensitivity ceiling", () => {
      expect(filterClaimsBySensitivity(claims, "personal").map((c) => c.id)).toEqual([
        "c1",
        "c2",
      ]);
    });

    it("filters by category", () => {
      expect(filterClaimsByCategory(claims, ["skills"]).map((c) => c.id)).toEqual([
        "c1",
        "c2",
      ]);
    });

    it("filters by sharing policy — user_only excluded", () => {
      const withPolicy = [
        makeClaim({ id: "c1", sharing_policy: { type: "grant_controlled" } }),
        makeClaim({ id: "c2", sharing_policy: { type: "user_only" } }),
      ];
      const filtered = filterClaimsBySharingPolicy(withPolicy, "binding_1", "personal");
      expect(filtered.map((c) => c.id)).toEqual(["c1"]);
    });

    it("filters by sharing policy — explicit_only requires binding", () => {
      const withPolicy = [
        makeClaim({
          id: "c1",
          sharing_policy: {
            type: "explicit_only",
            approved_binding_ids: ["binding_1"],
          },
        }),
        makeClaim({
          id: "c2",
          sharing_policy: {
            type: "explicit_only",
            approved_binding_ids: ["binding_other"],
          },
        }),
      ];
      const filtered = filterClaimsBySharingPolicy(withPolicy, "binding_1", "personal");
      expect(filtered.map((c) => c.id)).toEqual(["c1"]);
    });
  });
});
