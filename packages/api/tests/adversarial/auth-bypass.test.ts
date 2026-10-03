/**
 * Attack Vector #1: Authentication ≠ Authorization
 *
 * A valid JWT does not mean access is allowed. The kernel must deny
 * requests where binding/grant state has changed since token issuance.
 */
import { describe, it, expect } from "vitest";
import { authorize } from "@memory-layer/protocol/src/authorization/engine.js";
import {
  makeBinding,
  makeGrant,
  makeAuthRequest,
  bindingId,
  grantId,
} from "../helpers/factories.js";

describe("Attack Vector #1: Authentication ≠ Authorization", () => {
  // 1a: Valid token, binding suspended
  it("1a: denies when binding is suspended", () => {
    const binding = makeBinding({ status: "suspended", suspension_type: "user_paused" });
    const grant = makeGrant();
    const request = makeAuthRequest();

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "binding_suspended");
  });

  // 1b: Valid token, binding revoked
  it("1b: denies when binding is revoked", () => {
    const binding = makeBinding({ status: "revoked", revoked_at: "2026-10-01T00:30:00Z" });
    const grant = makeGrant();
    const request = makeAuthRequest();

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "binding_revoked");
  });

  // 1c: Valid token, grant inactive
  it("1c: denies when grant is inactive", () => {
    const binding = makeBinding();
    const grant = makeGrant({ active: false });
    const request = makeAuthRequest();

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "grant_inactive");
  });

  // 1d: Valid token, grant expired (periodic expiration check is API-layer responsibility)
  it("1d: denies when grant is not active (simulating expiration)", () => {
    const binding = makeBinding();
    const grant = makeGrant({ active: false });
    const request = makeAuthRequest();

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
  });

  // 1e: Valid token, stale binding revision
  it("1e: denies when binding revision is stale", () => {
    const binding = makeBinding({ revision: 5 });
    const grant = makeGrant();
    const request = makeAuthRequest({ binding_revision: 3 });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "stale_binding_revision");
  });

  // 1f: Valid token, capability not in grant
  it("1f: denies when capability is not granted", () => {
    const binding = makeBinding();
    const grant = makeGrant({ capabilities: ["read_context"] });
    const request = makeAuthRequest({ capability: "write_claims" });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "capability_not_granted");
  });

  // 1g: Valid token, category not in grant
  it("1g: denies when category is not in read policy", () => {
    const binding = makeBinding();
    const grant = makeGrant();
    const request = makeAuthRequest({
      capability: "read_context",
      categories: ["emotional_patterns"],
    });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "category_not_granted");
  });

  // 1h: Valid token, sensitivity above ceiling
  it("1h: denies when sensitivity exceeds ceiling", () => {
    const binding = makeBinding();
    const grant = makeGrant();
    const request = makeAuthRequest({
      capability: "read_context",
      max_sensitivity: "sensitive",
    });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "sensitivity_exceeds_ceiling");
  });

  // 1i: Valid token, purpose not authorized
  it("1i: denies when purpose is not in authorized purposes", () => {
    const binding = makeBinding();
    const grant = makeGrant({ authorized_purposes: ["coding_assistance"] });
    const request = makeAuthRequest({ purpose: "health_monitoring" });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "purpose_not_authorized");
  });
});
