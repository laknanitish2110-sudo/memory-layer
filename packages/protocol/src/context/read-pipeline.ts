import type { Claim, ClaimCategory, Sensitivity } from "../memory/types.js";
import type { AuthorizationDecision } from "../authorization/types.js";
import type { ClaimStore } from "../memory/repository.js";
import {
  filterClaimsByCategory,
  filterClaimsBySensitivity,
  filterClaimsBySharingPolicy,
} from "../authorization/engine.js";
import {
  synthesize,
  validateOutput,
  type ContextModel,
  type OutputValidationResult,
} from "./context-model.js";

export interface ReadPipelineResult {
  context: ContextModel;
  validation: OutputValidationResult;
  claims_served_count: number;
}

export async function executeReadPipeline(
  auth: Extract<AuthorizationDecision, { decision: "ALLOW" }>,
  passportId: string,
  claimStore: ClaimStore,
  policyVersion: string
): Promise<ReadPipelineResult> {
  const allClaims = await claimStore.getClaims(passportId, {
    categories: auth.effective_categories,
    sensitivity_ceiling: auth.effective_sensitivity_ceiling,
    include_deleted: false,
  });

  const byCat = filterClaimsByCategory(allClaims, auth.effective_categories);
  const bySens = filterClaimsBySensitivity(
    byCat,
    auth.effective_sensitivity_ceiling
  );
  const byPolicy = filterClaimsBySharingPolicy(
    bySens,
    auth.binding_id,
    auth.effective_sensitivity_ceiling
  );

  const items = synthesize(byPolicy);
  const now = new Date().toISOString();

  const context: ContextModel = {
    items,
    passport_id: passportId,
    generated_at: now,
    policy_version: policyVersion,
  };

  const validation = validateOutput(
    context,
    auth.effective_categories,
    auth.effective_sensitivity_ceiling
  );

  return {
    context,
    validation,
    claims_served_count: byPolicy.length,
  };
}
