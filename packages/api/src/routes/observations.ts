import type { Context } from "hono";
import type { AppContext, AppAuthContext } from "../context.js";
import { ApiError, mapKernelDenyToApiError, mapIngestionReasonToApiError } from "../errors/api-error.js";
import { authorize } from "@memory-layer/protocol/src/authorization/engine.js";
import { ingest, type IdGenerator } from "@memory-layer/protocol/src/reconciliation/write-pipeline.js";
import type { AuthorizationRequest } from "@memory-layer/protocol/src/authorization/types.js";
import type { ClaimCategory, Sensitivity } from "@memory-layer/protocol/src/memory/types.js";

const SERVER_DETERMINED_FIELDS = ["id", "binding_id", "outcome", "submitted_at"] as const;

export function makeObservationHandlers(ctx: AppContext) {
  return {
    create: async (c: Context) => {
      const auth = c.get("auth") as AppAuthContext;
      const requestId = c.get("requestId");

      const body = await c.req.json().catch(() => {
        throw new ApiError(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
      });

      for (const field of SERVER_DETERMINED_FIELDS) {
        if (field in body) {
          throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' is server-determined and must not be provided`, requestId);
        }
      }

      if (!body.idempotency_key || !body.subject || !body.predicate || !body.value) {
        throw new ApiError(400, "VALIDATION_ERROR", "Missing required fields: idempotency_key, subject, predicate, value", requestId);
      }
      if (!body.declared_category || !body.declared_sensitivity) {
        throw new ApiError(400, "VALIDATION_ERROR", "Missing required fields: declared_category, declared_sensitivity", requestId);
      }
      if (!body.extraction_method || !body.raw_context) {
        throw new ApiError(400, "VALIDATION_ERROR", "Missing required fields: extraction_method, raw_context", requestId);
      }

      const authRequest: AuthorizationRequest = {
        credential_id: `cred_${auth.bindingId}`,
        binding_id: auth.bindingId,
        binding_revision: auth.bindingRevision,
        capability: "write_claims",
        categories: [body.declared_category as ClaimCategory],
        max_sensitivity: body.declared_sensitivity as Sensitivity,
        purpose: body.purpose ?? null,
      };

      const decision = authorize(authRequest, auth.binding, auth.grant);
      if (decision.decision === "DENY") {
        throw mapKernelDenyToApiError(decision.reason, requestId);
      }

      const now = ctx.now();
      const ids: IdGenerator = {
        observationId: () => ctx.generateId("obs"),
        evidenceId: () => ctx.generateId("evi"),
        claimId: () => ctx.generateId("clm"),
        claimVersionId: () => ctx.generateId("ver"),
      };

      const observation = {
        idempotency_key: body.idempotency_key,
        binding_id: auth.bindingId,
        experience_id: body.experience_id ?? null,
        subject: body.subject,
        predicate: body.predicate,
        value: body.value,
        qualifiers: body.qualifiers ?? {},
        declared_sensitivity: body.declared_sensitivity as Sensitivity,
        declared_category: body.declared_category as ClaimCategory,
        extraction_method: body.extraction_method,
        raw_context: body.raw_context,
        submitted_at: now,
      };

      const result = await ingest(
        observation,
        {
          passportId: auth.passportId,
          binding: auth.binding,
          grant: auth.grant,
          appId: auth.binding.app_principal_id,
          now,
        },
        {
          observations: ctx.stores.observations,
          claims: ctx.stores.claims,
          evidence: ctx.stores.evidence,
        },
        ids,
        body.declared_sensitivity as Sensitivity
      );

      if (result.status === "rejected") {
        throw mapIngestionReasonToApiError(result.reason, requestId);
      }

      if (result.status === "quarantined") {
        return c.json({
          data: { observation_id: null, outcome: { status: "quarantined", reason: result.reason, requires_user_action: true } },
          meta: { request_id: requestId, policy_version: "v0.1.0" },
        }, 201);
      }

      if (result.status === "merged") {
        return c.json({
          data: { observation_id: result.observation.id, outcome: { status: "merged", existing_claim_id: result.claim.id, evidence_id: result.evidence.id } },
          meta: { request_id: requestId, policy_version: "v0.1.0" },
        }, 201);
      }

      return c.json({
        data: { observation_id: result.observation.id, outcome: { status: "accepted", evidence_id: result.evidence.id, claim_id: result.claim.id } },
        meta: { request_id: requestId, policy_version: "v0.1.0" },
      }, 201);
    },

    retract: async (c: Context) => {
      const auth = c.get("auth") as AppAuthContext;
      const requestId = c.get("requestId");
      const obsId = c.req.param("id");

      const authRequest: AuthorizationRequest = {
        credential_id: `cred_${auth.bindingId}`,
        binding_id: auth.bindingId,
        binding_revision: auth.bindingRevision,
        capability: "retract_own_observation",
        categories: [],
        max_sensitivity: "public",
        purpose: null,
      };

      const decision = authorize(authRequest, auth.binding, auth.grant);
      if (decision.decision === "DENY") {
        throw mapKernelDenyToApiError(decision.reason, requestId);
      }

      const observation = await ctx.stores.observations.getObservation(auth.passportId, obsId);
      if (!observation || observation.binding_id !== auth.bindingId) {
        throw new ApiError(404, "NOT_FOUND", "Observation not found", requestId);
      }

      return c.json({
        data: {
          observation_id: observation.id,
          evidence_id: observation.outcome && "evidence_id" in observation.outcome ? observation.outcome.evidence_id : null,
          evidence_status: "retracted",
        },
        meta: { request_id: requestId, policy_version: "v0.1.0" },
      });
    },
  };
}
