/**
 * Attack Vector #12: Token/Binding Mismatch
 *
 * A valid token must be denied when:
 * - Token references Binding A but data belongs to Binding B
 * - Binding was revoked after token issuance
 * - Grant expired after token issuance
 * - Binding was suspended after token issuance
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

describe("Attack Vector #12: Token/Binding Mismatch", () => {
  // 12a: Token for Binding A, request targets Binding B resources
  it("12a: token for binding A cannot access binding B resources", () => {
    const bindingA = makeBinding({ id: bindingId("a") });
    const grantA = makeGrant({ binding_id: bindingId("a") });

    const requestWithWrongBinding = makeAuthRequest({
      binding_id: bindingId("b"),
    });

    const result = authorize(requestWithWrongBinding, bindingA, grantA);
    expect(result.decision).toBe("DENY");
  });

  // 12b: Token valid, binding revoked
  it("12b: valid token denied when binding is revoked", () => {
    const binding = makeBinding({
      status: "revoked",
      revoked_at: "2026-10-01T00:30:00Z",
    });
    const grant = makeGrant();
    const request = makeAuthRequest();

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "binding_revoked");
  });

  // 12c: Token valid, grant expired
  it("12c: valid token denied when grant is inactive (expired)", () => {
    const binding = makeBinding();
    const grant = makeGrant({ active: false });
    const request = makeAuthRequest();

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "grant_inactive");
  });

  // 12d: Token valid, binding suspended
  it("12d: valid token denied when binding is suspended", () => {
    const binding = makeBinding({
      status: "suspended",
      suspension_type: "platform_security",
    });
    const grant = makeGrant();
    const request = makeAuthRequest();

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "binding_suspended");
  });

  // 12e: Grant superseded (new grant deactivated old one)
  it("12e: valid token denied when grant was superseded by newer grant", () => {
    const binding = makeBinding();
    const oldGrant = makeGrant({
      id: grantId("old"),
      active: false,
      supersedes_grant_id: null,
    });
    const request = makeAuthRequest();

    const result = authorize(request, binding, oldGrant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "grant_inactive");
  });

  // 12f: Token's family revoked
  it("12f: token with revoked family should fail (null grant simulates)", () => {
    const binding = makeBinding();
    const request = makeAuthRequest();

    const result = authorize(request, binding, null);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "grant_not_found");
  });

  // 12g: Binding revision advanced (revocation cycle)
  it("12g: token at revision N denied when binding advanced to N+1", () => {
    const binding = makeBinding({ revision: 18 });
    const grant = makeGrant();
    const request = makeAuthRequest({ binding_revision: 17 });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "stale_binding_revision");
  });
});
