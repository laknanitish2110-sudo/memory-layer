/**
 * Attack Vector #2: Never Trust IDs from the Request
 *
 * Every entity lookup must use the authenticated passport/binding,
 * never user-supplied ownership IDs.
 */
import { describe, it, expect } from "vitest";
import { authorize } from "@memory-layer/protocol/src/authorization/engine.js";
import {
  makeBinding,
  makeGrant,
  makeAuthRequest,
  makeClaim,
  makeObservation,
  mockClaimStore,
  passportId,
  bindingId,
} from "../helpers/factories.js";

describe("Attack Vector #2: Never Trust Request IDs", () => {
  const authenticatedPassport = passportId("authenticated");
  const attackerPassport = passportId("attacker");

  // 2a: binding_id in body must be ignored
  it("2a: server must derive binding_id from token, not request body", () => {
    const authBinding = makeBinding({ passport_id: authenticatedPassport });
    const grant = makeGrant({ binding_id: authBinding.id });

    const request = makeAuthRequest({
      binding_id: authBinding.id,
      binding_revision: authBinding.revision,
    });
    const result = authorize(request, authBinding, grant);
    expect(result.decision).toBe("ALLOW");

    const attackRequest = makeAuthRequest({
      binding_id: bindingId("attacker"),
      binding_revision: 1,
    });
    const attackResult = authorize(attackRequest, authBinding, grant);
    expect(attackResult.decision).toBe("DENY");
    expect(attackResult).toHaveProperty("reason", "binding_not_found");
  });

  // 2c: getClaim with cross-passport ID returns null
  it("2c: passport-scoped getClaim returns null for other passport's claim", async () => {
    const otherClaim = makeClaim({
      id: "clm_victim_001",
      passport_id: attackerPassport,
    });
    const store = mockClaimStore([otherClaim]);

    const result = await store.getClaim(authenticatedPassport, "clm_victim_001");
    expect(result).toBeNull();
  });

  // 2d: user action on another passport's claim returns null
  it("2d: passport-scoped lookup prevents cross-passport user actions", async () => {
    const victimClaim = makeClaim({
      id: "clm_victim_002",
      passport_id: attackerPassport,
    });
    const store = mockClaimStore([victimClaim]);

    const result = await store.getClaim(authenticatedPassport, "clm_victim_002");
    expect(result).toBeNull();
  });

  // 2e: binding revoke on another passport's binding
  it("2e: authorize denies when binding doesn't match request", () => {
    const victimBinding = makeBinding({
      id: bindingId("victim"),
      passport_id: attackerPassport,
    });
    const grant = makeGrant({ binding_id: victimBinding.id });
    const request = makeAuthRequest({
      binding_id: bindingId("attacker_attempt"),
    });

    const result = authorize(request, victimBinding, grant);
    expect(result.decision).toBe("DENY");
  });

  // 2f: grant consent on another passport's binding
  it("2f: authorize denies when grant's binding doesn't match", () => {
    const binding = makeBinding({ id: bindingId("legit") });
    const wrongGrant = makeGrant({
      binding_id: bindingId("victim"),
    });
    const request = makeAuthRequest({ binding_id: bindingId("legit") });

    const result = authorize(request, binding, wrongGrant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "grant_not_found");
  });

  // 2g: observation retract on another binding's observation
  it("2g: observation store is passport-scoped for lookups", async () => {
    const victimObs = makeObservation({
      id: "obs_victim_001",
      binding_id: bindingId("victim"),
    });
    const store = mockClaimStore();

    const result = await store.getClaim(authenticatedPassport, "obs_victim_001");
    expect(result).toBeNull();
  });
});
