/**
 * Attack Vector #5: Capability Confusion
 *
 * Each endpoint requires an explicit capability. No implicit inheritance.
 * read_context does NOT imply read_claims. write_claims does NOT imply retract.
 */
import { describe, it, expect } from "vitest";
import { authorize } from "@memory-layer/protocol/src/authorization/engine.js";
import {
  makeBinding,
  makeGrant,
  makeAuthRequest,
  makeDataPolicy,
} from "../helpers/factories.js";

describe("Attack Vector #5: Capability Confusion", () => {
  // 5a: read_context only → cannot read individual claims
  it("5a: read_context does not grant read_claims", () => {
    const binding = makeBinding();
    const grant = makeGrant({ capabilities: ["read_context"] });
    const request = makeAuthRequest({ capability: "read_claims" });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "capability_not_granted");
  });

  // 5b: read_claims only → cannot write observations
  it("5b: read_claims does not grant write_claims", () => {
    const binding = makeBinding();
    const grant = makeGrant({ capabilities: ["read_claims"] });
    const request = makeAuthRequest({ capability: "write_claims" });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "capability_not_granted");
  });

  // 5c: write_claims → cannot retract
  it("5c: write_claims does not grant retract_own_observation", () => {
    const binding = makeBinding();
    const grant = makeGrant({ capabilities: ["write_claims"] });
    const request = makeAuthRequest({ capability: "retract_own_observation" });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "capability_not_granted");
  });

  // 5d: no request_elevation → cannot request grant expansion
  it("5d: missing request_elevation denies grant expansion requests", () => {
    const binding = makeBinding();
    const grant = makeGrant({
      capabilities: ["read_context", "write_claims"],
    });
    const request = makeAuthRequest({ capability: "request_elevation" });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "capability_not_granted");
  });

  // 5e: read_claims for skills → cannot read personal_context claims
  it("5e: category filter prevents reading outside granted categories", () => {
    const binding = makeBinding();
    const grant = makeGrant({
      capabilities: ["read_claims"],
      data_policy: makeDataPolicy({
        read: { categories: ["skills"], sensitivity_ceiling: "personal" },
      }),
    });
    const request = makeAuthRequest({
      capability: "read_claims",
      categories: ["personal_context"],
    });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "category_not_granted");
  });

  // 5f: write_claims for skills → cannot write emotional_patterns
  it("5f: write category filter prevents writing outside granted categories", () => {
    const binding = makeBinding();
    const grant = makeGrant({
      capabilities: ["write_claims"],
      data_policy: makeDataPolicy({
        write: {
          categories: ["skills"],
          sensitivity_ceiling: "personal",
          rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 },
          semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 },
          evidence_required: true,
        },
      }),
    });
    const request = makeAuthRequest({
      capability: "write_claims",
      categories: ["emotional_patterns"],
    });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "category_not_granted");
  });

  // 5g: sensitivity ceiling enforcement
  it("5g: sensitivity above ceiling denied", () => {
    const binding = makeBinding();
    const grant = makeGrant({
      capabilities: ["read_claims"],
      data_policy: makeDataPolicy({
        read: { categories: ["skills"], sensitivity_ceiling: "personal" },
      }),
    });
    const request = makeAuthRequest({
      capability: "read_claims",
      categories: ["skills"],
      max_sensitivity: "sensitive",
    });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "sensitivity_exceeds_ceiling");
  });

  // 5h: purpose template ceiling
  it("5h: purpose not in authorized purposes denied", () => {
    const binding = makeBinding();
    const grant = makeGrant({
      capabilities: ["read_context"],
      authorized_purposes: ["coding_assistance"],
    });
    const request = makeAuthRequest({
      capability: "read_context",
      purpose: "health_monitoring",
    });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "purpose_not_authorized");
  });
});
