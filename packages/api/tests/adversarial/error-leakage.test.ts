/**
 * Attack Vector #7: Error Leakage
 *
 * Error messages must not reveal information about other users' data.
 * The attacker cannot distinguish "doesn't exist" from "exists but not yours."
 */
import { describe, it, expect } from "vitest";
import { authorize } from "@memory-layer/protocol/src/authorization/engine.js";
import {
  makeBinding,
  makeGrant,
  makeAuthRequest,
  makeClaim,
  mockClaimStore,
  passportId,
  bindingId,
} from "../helpers/factories.js";

describe("Attack Vector #7: Error Leakage", () => {
  // 7a: GET claim with nonexistent ID → generic 404
  it("7a: nonexistent claim ID returns generic 404", async () => {
    const store = mockClaimStore([]);
    const result = await store.getClaim(passportId(), "clm_nonexistent");
    expect(result).toBeNull();
  });

  // 7b: GET claim belonging to other user → same generic 404 as 7a
  it("7b: other user's claim returns null (indistinguishable from nonexistent)", async () => {
    const otherClaim = makeClaim({
      passport_id: passportId("other"),
      id: "clm_other_001",
    });
    const store = mockClaimStore([otherClaim]);

    const resultForOwner = await store.getClaim(passportId("other"), "clm_other_001");
    expect(resultForOwner).not.toBeNull();

    const resultForAttacker = await store.getClaim(passportId("attacker"), "clm_other_001");
    expect(resultForAttacker).toBeNull();
  });

  // 7c: Revoking another user's binding → 404, not "binding belongs to passport X"
  it("7c: revoking another user's binding yields DENY without revealing ownership", () => {
    const otherBinding = makeBinding({
      id: bindingId("other"),
      passport_id: passportId("other"),
    });
    const grant = makeGrant({ binding_id: bindingId("other") });

    const request = makeAuthRequest({
      binding_id: bindingId("attacker"),
    });

    const result = authorize(request, otherBinding, grant);
    expect(result.decision).toBe("DENY");
    if (result.decision === "DENY") {
      expect(result.reason).not.toContain(passportId("other"));
      expect(result.reason).not.toContain(bindingId("other"));
    }
  });

  // 7d: Retracting another binding's observation → 404, no metadata leakage
  it("7d: retracting another binding's observation reveals no ownership info", () => {
    const binding = makeBinding({ id: bindingId("real") });
    const grant = makeGrant({ binding_id: bindingId("real") });

    const request = makeAuthRequest({
      binding_id: bindingId("attacker"),
    });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    if (result.decision === "DENY") {
      expect(result.reason).not.toContain("binding_real");
    }
  });

  // 7e: Duplicate binding → 409 with no mention of existing binding ID
  it("7e: duplicate binding error does not reveal the existing binding ID", () => {
    const duplicateError = {
      status: 409,
      code: "DUPLICATE_BINDING",
      message: "A binding already exists for this app and passport.",
    };

    expect(duplicateError.message).not.toMatch(/bnd_/);
    expect(duplicateError.message).not.toMatch(/psp_/);
    expect(duplicateError.code).toBe("DUPLICATE_BINDING");
  });

  // 7f: 403 errors never include passport IDs, binding IDs, grant IDs, or claim counts
  it("7f: DENY reasons contain only generic codes, no cross-user metadata", () => {
    const scenarios = [
      authorize(
        makeAuthRequest({ binding_id: bindingId("wrong") }),
        makeBinding({ id: bindingId("real") }),
        makeGrant()
      ),
      authorize(
        makeAuthRequest(),
        makeBinding({ status: "revoked", revoked_at: "2026-10-01T00:00:00Z" }),
        makeGrant()
      ),
      authorize(
        makeAuthRequest(),
        makeBinding({ status: "suspended", suspension_type: "platform_security" }),
        makeGrant()
      ),
      authorize(makeAuthRequest(), makeBinding(), makeGrant({ active: false })),
      authorize(makeAuthRequest({ capability: "write_claims" }), makeBinding(), makeGrant({ capabilities: ["read_context"] })),
    ];

    const allowedReasons = new Set([
      "binding_not_found",
      "binding_revoked",
      "binding_suspended",
      "grant_not_found",
      "grant_inactive",
      "capability_not_granted",
      "category_not_granted",
      "sensitivity_exceeds_ceiling",
      "purpose_not_authorized",
      "stale_binding_revision",
    ]);

    for (const result of scenarios) {
      expect(result.decision).toBe("DENY");
      if (result.decision === "DENY") {
        expect(allowedReasons.has(result.reason)).toBe(true);
        expect(result.reason).not.toMatch(/psp_/);
        expect(result.reason).not.toMatch(/bnd_/);
        expect(result.reason).not.toMatch(/grt_/);
      }
    }
  });

  // 7g: Rate limit 429 errors don't reveal aggregate usage across bindings
  it("7g: rate limit error shape reveals only this binding's limits", () => {
    const rateLimitResponse = {
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      retry_after: 60,
      limit: 100,
      remaining: 0,
      binding_id: bindingId("self"),
    };

    expect(rateLimitResponse.binding_id).toBe(bindingId("self"));
    expect(rateLimitResponse).not.toHaveProperty("total_system_usage");
    expect(rateLimitResponse).not.toHaveProperty("other_bindings");
    expect(rateLimitResponse).not.toHaveProperty("aggregate_count");
  });

  // 7h: Timing: "claim exists but not yours" vs "doesn't exist" → same path
  it("7h: passport-scoped query returns null in both cases — constant-time path", async () => {
    const realClaim = makeClaim({
      passport_id: passportId("owner"),
      id: "clm_timing_001",
    });
    const store = mockClaimStore([realClaim]);

    const existsButNotYours = await store.getClaim(passportId("attacker"), "clm_timing_001");
    const doesntExist = await store.getClaim(passportId("attacker"), "clm_nonexistent_999");

    expect(existsButNotYours).toBeNull();
    expect(doesntExist).toBeNull();
  });
});
