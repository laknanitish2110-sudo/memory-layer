import type { Context } from "hono";
import type { AppContext, AppAuthContext } from "../context.js";
import { ApiError, mapKernelDenyToApiError } from "../errors/api-error.js";
import { authorize } from "@memory-layer/protocol/src/authorization/engine.js";
import { executeReadPipeline } from "@memory-layer/protocol/src/context/read-pipeline.js";
import type { AuthorizationRequest } from "@memory-layer/protocol/src/authorization/types.js";
import type { ClaimCategory, Sensitivity } from "@memory-layer/protocol/src/memory/types.js";

export function makeContextHandlers(ctx: AppContext) {
  return {
    get: async (c: Context) => {
      const auth = c.get("auth") as AppAuthContext;
      const requestId = c.get("requestId");

      const categoriesParam = c.req.query("categories");
      const purposeParam = c.req.query("purpose");

      const requestedCategories: ClaimCategory[] = categoriesParam
        ? (categoriesParam.split(",") as ClaimCategory[])
        : (auth.grant.data_policy.read.categories as ClaimCategory[]);

      const authRequest: AuthorizationRequest = {
        credential_id: `cred_${auth.bindingId}`,
        binding_id: auth.bindingId,
        binding_revision: auth.bindingRevision,
        capability: "read_context",
        categories: requestedCategories,
        max_sensitivity: auth.grant.data_policy.read.sensitivity_ceiling as Sensitivity,
        purpose: purposeParam ?? null,
      };

      const decision = authorize(authRequest, auth.binding, auth.grant);
      if (decision.decision === "DENY") {
        throw mapKernelDenyToApiError(decision.reason, requestId);
      }

      const result = await executeReadPipeline(
        decision,
        auth.passportId,
        ctx.stores.claims,
        "v0.1.0"
      );

      if (result.validation.status === "INVALID") {
        throw new ApiError(500, "INTERNAL_ERROR", "Context validation failed", requestId);
      }

      const responseItems = result.context.items.map((item) => ({
        claim_id: item.claim_id,
        category: item.category,
        sensitivity: item.sensitivity,
        summary: item.summary,
        confidence_band: item.confidence_band,
      }));

      return c.json({
        data: {
          items: responseItems,
          generated_at: result.context.generated_at,
          policy_version: result.context.policy_version,
        },
        meta: { request_id: requestId, policy_version: "v0.1.0" },
      });
    },
  };
}
