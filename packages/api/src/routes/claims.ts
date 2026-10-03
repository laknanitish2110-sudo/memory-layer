import type { Context } from "hono";
import type { AppContext, AppAuthContext, UserAuthContext } from "../context.js";
import { ApiError, mapKernelDenyToApiError } from "../errors/api-error.js";
import { authorize, filterClaimsBySensitivity, filterClaimsBySharingPolicy } from "@memory-layer/protocol/src/authorization/engine.js";
import type { AuthorizationRequest } from "@memory-layer/protocol/src/authorization/types.js";
import type { ClaimCategory, Sensitivity, UserMemoryAction } from "@memory-layer/protocol/src/memory/types.js";

export function makeClaimHandlers(ctx: AppContext) {
  return {
    get: async (c: Context) => {
      const auth = c.get("auth") as AppAuthContext;
      const requestId = c.get("requestId");
      const claimId = c.req.param("id");

      const authRequest: AuthorizationRequest = {
        credential_id: `cred_${auth.bindingId}`,
        binding_id: auth.bindingId,
        binding_revision: auth.bindingRevision,
        capability: "read_claims",
        categories: auth.grant.data_policy.read.categories as ClaimCategory[],
        max_sensitivity: auth.grant.data_policy.read.sensitivity_ceiling as Sensitivity,
        purpose: null,
      };

      const decision = authorize(authRequest, auth.binding, auth.grant);
      if (decision.decision === "DENY") {
        throw mapKernelDenyToApiError(decision.reason, requestId);
      }

      const claim = await ctx.stores.claims.getClaim(auth.passportId, claimId);
      if (!claim) {
        throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);
      }

      if (!decision.effective_categories.includes(claim.category)) {
        throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);
      }

      const sensFiltered = filterClaimsBySensitivity([claim], decision.effective_sensitivity_ceiling);
      if (sensFiltered.length === 0) {
        throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);
      }

      const policyFiltered = filterClaimsBySharingPolicy([claim], auth.bindingId, decision.effective_sensitivity_ceiling);
      if (policyFiltered.length === 0) {
        throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);
      }

      return c.json({
        data: {
          id: claim.id,
          subject: claim.subject,
          predicate: claim.predicate,
          value: claim.value,
          qualifiers: claim.qualifiers,
          category: claim.category,
          state: claim.state,
          volatility: claim.volatility,
          sensitivity: claim.sensitivity,
          created_at: claim.created_at,
          updated_at: claim.updated_at,
          current_version_id: claim.current_version_id,
        },
        meta: { request_id: requestId, policy_version: "v0.1.0" },
      });
    },
  };
}

export function makeUserClaimHandlers(ctx: AppContext) {
  function handler(action: UserMemoryAction) {
    return async (c: Context) => {
      const auth = c.get("auth") as UserAuthContext;
      const requestId = c.get("requestId");
      const claimId = c.req.param("id");

      const claim = await ctx.stores.claims.getClaim(auth.passportId, claimId);
      if (!claim) {
        throw new ApiError(404, "NOT_FOUND", "Claim not found", requestId);
      }

      const body = await c.req.json().catch(() => ({}));
      const now = ctx.now();
      const eventId = ctx.generateId("evt");
      const evidenceId = action === "CONFIRM" || action === "CORRECT" ? ctx.generateId("evi") : null;
      const versionId = action === "CORRECT" ? ctx.generateId("ver") : null;

      let newState = claim.state;
      let newValue = claim.value;
      let newSensitivity = claim.sensitivity;

      switch (action) {
        case "CONFIRM": newState = "DECLARED"; break;
        case "CORRECT": newState = "DECLARED"; newValue = body.new_value ?? claim.value; break;
        case "OVERRIDE": newState = body.declared_state ?? "DECLARED"; break;
        case "DISPUTE": newState = "CONTESTED"; break;
        case "RECLASSIFY": newSensitivity = body.new_sensitivity ?? claim.sensitivity; break;
        case "DELETE": break;
      }

      const event = {
        id: eventId, claim_id: claimId, action,
        previous_value: action === "CORRECT" ? claim.value : null,
        new_value: action === "CORRECT" ? newValue : null,
        previous_sensitivity: action === "RECLASSIFY" ? claim.sensitivity : null,
        new_sensitivity: action === "RECLASSIFY" ? newSensitivity : null,
        performed_at: now, creates_evidence_id: evidenceId, creates_version_id: versionId,
      };
      await ctx.stores.events.createEvent(auth.passportId, event);

      if (action === "DELETE") {
        await ctx.stores.claims.updateClaim(auth.passportId, { ...claim, deleted: true, deleted_at: now, updated_at: now });
        return c.json({ data: { claim_id: claimId, deleted: true, deleted_at: now, event_id: eventId }, meta: { request_id: requestId, policy_version: "v0.1.0" } });
      }

      if (action === "RECLASSIFY") {
        await ctx.stores.claims.updateClaim(auth.passportId, { ...claim, sensitivity: newSensitivity, sharing_policy: body.new_sharing_policy ?? claim.sharing_policy, updated_at: now });
        return c.json({ data: { claim_id: claimId, previous_sensitivity: claim.sensitivity, new_sensitivity: newSensitivity, event_id: eventId }, meta: { request_id: requestId, policy_version: "v0.1.0" } });
      }

      await ctx.stores.claims.updateClaim(auth.passportId, { ...claim, state: newState, value: newValue, updated_at: now });

      const responseData: Record<string, unknown> = { claim_id: claimId, new_state: newState, event_id: eventId };
      if (evidenceId) responseData.evidence_id = evidenceId;
      if (versionId) responseData.version_id = versionId;
      if (action === "CORRECT") responseData.new_value = newValue;
      if (action === "OVERRIDE") responseData.previous_state = claim.state;

      return c.json({ data: responseData, meta: { request_id: requestId, policy_version: "v0.1.0" } });
    };
  }

  return {
    confirm: handler("CONFIRM"),
    correct: handler("CORRECT"),
    override: handler("OVERRIDE"),
    dispute: handler("DISPUTE"),
    reclassify: handler("RECLASSIFY"),
    delete: handler("DELETE"),
  };
}
