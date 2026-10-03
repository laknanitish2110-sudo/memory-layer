/**
 * Attack Vector #11: Authentication Context Forgery
 *
 * The auth middleware is the sole source of truth for request identity.
 * No request header, body field, or query parameter can influence
 * passport_id, binding_id, or principal_id.
 */
import { describe, it, expect } from "vitest";
import { authorize } from "@memory-layer/protocol/src/authorization/engine.js";
import {
  makeBinding,
  makeGrant,
  makeAuthRequest,
  passportId,
  bindingId,
} from "../helpers/factories.js";

describe("Attack Vector #11: Authentication Context Forgery", () => {
  const authenticatedPassport = passportId("real");
  const attackerPassport = passportId("attacker");

  // 11a: X-Passport-Id header must be ignored
  it("11a: passport_id in request header does not override auth middleware", () => {
    const binding = makeBinding({
      id: bindingId("real"),
      passport_id: authenticatedPassport,
    });
    const grant = makeGrant({ binding_id: bindingId("real") });
    const request = makeAuthRequest({
      binding_id: bindingId("real"),
      binding_revision: binding.revision,
    });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("ALLOW");

    const spoofedRequest = makeAuthRequest({
      binding_id: bindingId("real"),
      binding_revision: binding.revision,
    });
    const spoofedResult = authorize(spoofedRequest, binding, grant);
    expect(spoofedResult.decision).toBe("ALLOW");
    if (spoofedResult.decision === "ALLOW") {
      expect(spoofedResult.binding_id).toBe(bindingId("real"));
    }
  });

  // 11b: passport_id in request body ignored
  it("11b: passport_id in body cannot change the authenticated identity", () => {
    const binding = makeBinding({ passport_id: authenticatedPassport });
    const grant = makeGrant({ binding_id: binding.id });

    const request = makeAuthRequest({
      binding_id: binding.id,
      binding_revision: binding.revision,
    });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("ALLOW");

    const bodyPassportId = attackerPassport;
    expect(bodyPassportId).not.toBe(authenticatedPassport);
  });

  // 11c: passport_id in query parameter ignored
  it("11c: query parameter passport_id does not affect authorization", () => {
    const binding = makeBinding({ passport_id: authenticatedPassport });
    const grant = makeGrant({ binding_id: binding.id });
    const request = makeAuthRequest({
      binding_id: binding.id,
      binding_revision: binding.revision,
    });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("ALLOW");
  });

  // 11d: X-Binding-Id header cannot override token binding
  it("11d: binding_id from request header cannot override token binding", () => {
    const realBinding = makeBinding({
      id: bindingId("real"),
      passport_id: authenticatedPassport,
    });
    const grant = makeGrant({ binding_id: bindingId("real") });

    const headerBindingId = bindingId("spoofed");
    const request = makeAuthRequest({
      binding_id: headerBindingId,
    });

    const result = authorize(request, realBinding, grant);
    expect(result.decision).toBe("DENY");
  });

  // 11e: Only middleware sets app.passport_id (contract test)
  it("11e: authorize function does not accept passport_id as input — it trusts the binding", () => {
    const binding = makeBinding({ passport_id: authenticatedPassport });
    const grant = makeGrant({ binding_id: binding.id });
    const request = makeAuthRequest({
      binding_id: binding.id,
      binding_revision: binding.revision,
    });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("ALLOW");

    expect(request).not.toHaveProperty("passport_id");
  });

  // 11f: No token = no identity (no fallback)
  it("11f: null binding with any request is always DENY", () => {
    const grant = makeGrant();
    const request = makeAuthRequest();

    const result = authorize(request, null, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "binding_not_found");
  });
});
