/**
 * Attack Vector #6: Context Endpoint — Filter Before Synthesis
 *
 * The context synthesizer must receive ONLY pre-filtered authorized claims.
 * Protocol Invariants #6, #7, #8.
 */
import { describe, it, expect } from "vitest";
import { executeReadPipeline } from "@memory-layer/protocol/src/context/read-pipeline.js";
import {
  synthesize,
  validateOutput,
} from "@memory-layer/protocol/src/context/context-model.js";
import type { AuthorizationDecision } from "@memory-layer/protocol/src/authorization/types.js";
import {
  makeClaim,
  mockClaimStore,
  passportId,
  bindingId,
} from "../helpers/factories.js";

function makeAllowDecision(
  overrides: Partial<Extract<AuthorizationDecision, { decision: "ALLOW" }>> = {}
): Extract<AuthorizationDecision, { decision: "ALLOW" }> {
  return {
    decision: "ALLOW",
    binding_id: bindingId(),
    grant_id: "grt_test_a",
    grant_version: 1,
    effective_categories: ["skills"],
    effective_sensitivity_ceiling: "personal",
    binding_revision: 1,
    policy_version: "v0.1.0",
    ...overrides,
  };
}

describe("Attack Vector #6: Context Filter-Before-Synthesis", () => {
  const pid = passportId();

  // 6a: Only authorized categories in context
  it("6a: context contains only claims from authorized categories", async () => {
    const skillsClaim = makeClaim({ passport_id: pid, category: "skills", sensitivity: "public" });
    const emotionalClaim = makeClaim({
      passport_id: pid,
      category: "emotional_patterns",
      sensitivity: "sensitive",
    });
    const store = mockClaimStore([skillsClaim, emotionalClaim]);
    const auth = makeAllowDecision({ effective_categories: ["skills"] });

    const result = await executeReadPipeline(auth, pid, store, "v0.1.0");

    for (const item of result.context.items) {
      expect(item.category).toBe("skills");
    }
    expect(result.context.items.length).toBeLessThanOrEqual(1);
  });

  // 6b: Sensitivity ceiling enforced
  it("6b: no claims above sensitivity ceiling in context", async () => {
    const publicClaim = makeClaim({ passport_id: pid, category: "skills", sensitivity: "public" });
    const sensitiveClaim = makeClaim({
      passport_id: pid,
      category: "skills",
      sensitivity: "sensitive",
    });
    const store = mockClaimStore([publicClaim, sensitiveClaim]);
    const auth = makeAllowDecision({ effective_sensitivity_ceiling: "personal" });

    const result = await executeReadPipeline(auth, pid, store, "v0.1.0");

    for (const item of result.context.items) {
      expect(["public", "personal"]).toContain(item.sensitivity);
    }
  });

  // 6c: user_only sharing policy excluded
  it("6c: claims with user_only sharing policy excluded from context", async () => {
    const userOnlyClaim = makeClaim({
      passport_id: pid,
      category: "skills",
      sensitivity: "public",
      sharing_policy: { type: "user_only" },
    });
    const store = mockClaimStore([userOnlyClaim]);
    const auth = makeAllowDecision();

    const result = await executeReadPipeline(auth, pid, store, "v0.1.0");

    expect(result.context.items).toHaveLength(0);
  });

  // 6d: explicit_only without approval excluded
  it("6d: explicit_only claims excluded when binding not in approved list", async () => {
    const explicitClaim = makeClaim({
      passport_id: pid,
      category: "skills",
      sensitivity: "public",
      sharing_policy: {
        type: "explicit_only",
        approved_binding_ids: ["bnd_other_app"],
      },
    });
    const store = mockClaimStore([explicitClaim]);
    const auth = makeAllowDecision();

    const result = await executeReadPipeline(auth, pid, store, "v0.1.0");

    expect(result.context.items).toHaveLength(0);
  });

  // 6e: explicit_only with approval included
  it("6e: explicit_only claims included when binding is in approved list", async () => {
    const bid = bindingId();
    const explicitClaim = makeClaim({
      passport_id: pid,
      category: "skills",
      sensitivity: "public",
      sharing_policy: {
        type: "explicit_only",
        approved_binding_ids: [bid],
      },
    });
    const store = mockClaimStore([explicitClaim]);
    const auth = makeAllowDecision({ binding_id: bid });

    const result = await executeReadPipeline(auth, pid, store, "v0.1.0");

    expect(result.context.items.length).toBeGreaterThanOrEqual(1);
  });

  // 6f: Deleted claims excluded
  it("6f: deleted claims excluded from context", async () => {
    const deletedClaim = makeClaim({
      passport_id: pid,
      category: "skills",
      sensitivity: "public",
      deleted: true,
      deleted_at: "2026-10-01T00:00:00Z",
    });
    const store = mockClaimStore([deletedClaim]);
    const auth = makeAllowDecision();

    const result = await executeReadPipeline(auth, pid, store, "v0.1.0");

    expect(result.context.items).toHaveLength(0);
  });

  // 6g: EXPIRED claims excluded
  it("6g: EXPIRED claims excluded from synthesized context", () => {
    const expiredClaim = makeClaim({
      passport_id: pid,
      category: "skills",
      sensitivity: "public",
      state: "EXPIRED",
    });

    const items = synthesize([expiredClaim]);
    expect(items).toHaveLength(0);
  });

  // 6h: Output validation is binary
  it("6h: validateOutput returns INVALID for unauthorized category, never strips", () => {
    const context = {
      items: [
        {
          claim_id: "clm_001",
          category: "emotional_patterns" as const,
          sensitivity: "sensitive" as const,
          summary: "user feels stressed",
          confidence_band: "medium" as const,
        },
      ],
      passport_id: pid,
      generated_at: new Date().toISOString(),
      policy_version: "v0.1.0",
    };

    const validation = validateOutput(context, ["skills"], "personal");
    expect(validation.status).toBe("INVALID");
    expect(validation).toHaveProperty("violation");
  });
});
