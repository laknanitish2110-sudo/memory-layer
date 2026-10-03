import { SENSITIVITY_ORDER, type Capability, type ClaimCategory, type Sensitivity } from "../memory/types.js";
import type {
  AuthorizationDecision,
  AuthorizationRequest,
  Binding,
  BindingGrant,
} from "./types.js";
import { isWithinCeiling } from "./sensitivity.js";

const POLICY_VERSION = "v0.1.0";

export function authorize(
  request: AuthorizationRequest,
  binding: Binding | null,
  grant: BindingGrant | null
): AuthorizationDecision {
  if (!binding) {
    return { decision: "DENY", reason: "binding_not_found" };
  }

  if (binding.id !== request.binding_id) {
    return { decision: "DENY", reason: "binding_not_found" };
  }

  if (binding.status === "revoked") {
    return { decision: "DENY", reason: "binding_revoked" };
  }

  if (binding.status === "suspended") {
    return { decision: "DENY", reason: "binding_suspended" };
  }

  if (request.binding_revision < binding.revision) {
    return { decision: "DENY", reason: "stale_binding_revision" };
  }

  if (!grant) {
    return { decision: "DENY", reason: "grant_not_found" };
  }

  if (!grant.active) {
    return { decision: "DENY", reason: "grant_inactive" };
  }

  if (grant.binding_id !== binding.id) {
    return { decision: "DENY", reason: "grant_not_found" };
  }

  if (!grant.capabilities.includes(request.capability)) {
    return { decision: "DENY", reason: "capability_not_granted" };
  }

  const policy = isReadCapability(request.capability)
    ? grant.data_policy.read
    : grant.data_policy.write;

  const effectiveCategories: ClaimCategory[] = [];
  for (const cat of request.categories) {
    if (!policy.categories.includes(cat)) {
      return { decision: "DENY", reason: "category_not_granted" };
    }
    effectiveCategories.push(cat);
  }

  if (!isWithinCeiling(request.max_sensitivity, policy.sensitivity_ceiling)) {
    return { decision: "DENY", reason: "sensitivity_exceeds_ceiling" };
  }

  if (
    request.purpose &&
    grant.authorized_purposes.length > 0 &&
    !grant.authorized_purposes.includes(request.purpose)
  ) {
    return { decision: "DENY", reason: "purpose_not_authorized" };
  }

  return {
    decision: "ALLOW",
    binding_id: binding.id,
    grant_id: grant.id,
    grant_version: grant.version,
    effective_categories: effectiveCategories,
    effective_sensitivity_ceiling: policy.sensitivity_ceiling,
    binding_revision: binding.revision,
    policy_version: POLICY_VERSION,
  };
}

function isReadCapability(cap: Capability): boolean {
  return (
    cap === "read_context" ||
    cap === "read_claims" ||
    cap === "read_versions" ||
    cap === "read_evidence" ||
    cap === "read_experiences"
  );
}

export function filterClaimsBySensitivity<
  T extends { sensitivity: Sensitivity }
>(claims: T[], ceiling: Sensitivity): T[] {
  const ceilingOrder = SENSITIVITY_ORDER[ceiling];
  return claims.filter((c) => SENSITIVITY_ORDER[c.sensitivity] <= ceilingOrder);
}

export function filterClaimsByCategory<
  T extends { category: ClaimCategory }
>(claims: T[], categories: ClaimCategory[]): T[] {
  const catSet = new Set(categories);
  return claims.filter((c) => catSet.has(c.category));
}

export function filterClaimsBySharingPolicy<
  T extends {
    sensitivity: Sensitivity;
    sharing_policy: { type: string; approved_binding_ids?: string[] };
  }
>(claims: T[], bindingId: string, sensitivityCeiling: Sensitivity): T[] {
  const ceilingOrder = SENSITIVITY_ORDER[sensitivityCeiling];
  return claims.filter((c) => {
    if (SENSITIVITY_ORDER[c.sensitivity] > ceilingOrder) return false;
    if (c.sharing_policy.type === "user_only") return false;
    if (c.sharing_policy.type === "explicit_only") {
      const approved = (c.sharing_policy as { approved_binding_ids: string[] })
        .approved_binding_ids;
      return approved.includes(bindingId);
    }
    return true;
  });
}
