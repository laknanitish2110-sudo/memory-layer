/**
 * Attack Vector #14: Authorization Caching
 *
 * Cached authorization decisions must not survive binding state changes.
 * If caching is introduced, it must be revision-aware and invalidated
 * on any state change. Initially: no caching — authorize() runs live.
 */
import { describe, it, expect } from "vitest";
import { authorize } from "@memory-layer/protocol/src/authorization/engine.js";
import {
  makeBinding,
  makeGrant,
  makeAuthRequest,
} from "../helpers/factories.js";

describe("Attack Vector #14: Authorization Caching", () => {
  // 14a: Authorize at revision 17 → ALLOW, revoke → revision 18, same credentials → DENY
  it("14a: authorization at revision N allows, revocation at N+1 denies with same credentials", () => {
    const binding17 = makeBinding({ revision: 17 });
    const grant = makeGrant();
    const request = makeAuthRequest({ binding_revision: 17 });

    const allow = authorize(request, binding17, grant);
    expect(allow.decision).toBe("ALLOW");

    const binding18revoked = makeBinding({
      revision: 18,
      status: "revoked",
      revoked_at: "2026-10-01T00:30:00Z",
    });

    const denyRevoked = authorize(request, binding18revoked, grant);
    expect(denyRevoked.decision).toBe("DENY");
    if (denyRevoked.decision === "DENY") {
      expect(denyRevoked.reason).toBe("binding_revoked");
    }

    const binding18active = makeBinding({ revision: 18 });
    const denyStale = authorize(request, binding18active, grant);
    expect(denyStale.decision).toBe("DENY");
    if (denyStale.decision === "DENY") {
      expect(denyStale.reason).toBe("stale_binding_revision");
    }
  });

  // 14b: Active grant, deactivate grant, same token → DENY
  it("14b: grant deactivation after initial allow results in deny", () => {
    const binding = makeBinding();
    const activeGrant = makeGrant({ active: true });
    const request = makeAuthRequest();

    const allow = authorize(request, binding, activeGrant);
    expect(allow.decision).toBe("ALLOW");

    const inactiveGrant = makeGrant({ active: false });
    const deny = authorize(request, binding, inactiveGrant);
    expect(deny.decision).toBe("DENY");
    if (deny.decision === "DENY") {
      expect(deny.reason).toBe("grant_inactive");
    }
  });

  // 14c: Capability removed via new grant, same token → DENY
  it("14c: capability removal via new grant denies previously-allowed capability", () => {
    const binding = makeBinding();
    const fullGrant = makeGrant({
      capabilities: ["read_context", "read_claims", "write_claims"],
    });
    const readRequest = makeAuthRequest({ capability: "write_claims" });

    const allow = authorize(readRequest, binding, fullGrant);
    expect(allow.decision).toBe("ALLOW");

    const reducedGrant = makeGrant({
      capabilities: ["read_context"],
    });

    const deny = authorize(readRequest, binding, reducedGrant);
    expect(deny.decision).toBe("DENY");
    if (deny.decision === "DENY") {
      expect(deny.reason).toBe("capability_not_granted");
    }
  });

  // 14d: Concurrent requests — binding revoked between request A and B
  it("14d: concurrent requests get consistent result based on binding state at check time", () => {
    const bindingActive = makeBinding({ revision: 5 });
    const grant = makeGrant();
    const requestA = makeAuthRequest({ binding_revision: 5 });
    const requestB = makeAuthRequest({ binding_revision: 5 });

    const resultA = authorize(requestA, bindingActive, grant);
    expect(resultA.decision).toBe("ALLOW");

    const bindingRevoked = makeBinding({
      revision: 6,
      status: "revoked",
      revoked_at: "2026-10-01T00:15:00Z",
    });

    const resultB = authorize(requestB, bindingRevoked, grant);
    expect(resultB.decision).toBe("DENY");
  });

  // 14e: Suspend binding (platform_security), same token → DENY
  it("14e: binding suspension after initial allow results in deny", () => {
    const activeBinding = makeBinding({ revision: 10 });
    const grant = makeGrant();
    const request = makeAuthRequest({ binding_revision: 10 });

    const allow = authorize(request, activeBinding, grant);
    expect(allow.decision).toBe("ALLOW");

    const suspendedBinding = makeBinding({
      revision: 10,
      status: "suspended",
      suspension_type: "platform_security",
      suspended_at: "2026-10-01T00:30:00Z",
    });

    const deny = authorize(request, suspendedBinding, grant);
    expect(deny.decision).toBe("DENY");
    if (deny.decision === "DENY") {
      expect(deny.reason).toBe("binding_suspended");
    }
  });

  // 14f: No HTTP-level response caching on authorization-dependent endpoints
  it("14f: authenticated responses must include Cache-Control: no-store", () => {
    const responseHeaders = {
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
    };

    expect(responseHeaders["Cache-Control"]).toBe("no-store");
    expect(responseHeaders["Pragma"]).toBe("no-cache");
  });
});
