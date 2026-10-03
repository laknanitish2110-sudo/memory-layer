import type {
  ISO8601,
  Capability,
  ClaimCategory,
  Sensitivity,
} from "../memory/types.js";

// --- Binding ---

export type BindingStatus = "active" | "suspended" | "revoked";

export type SuspensionType =
  | "user_paused"
  | "platform_rate_violation"
  | "platform_security"
  | "platform_abuse"
  | "ownership_transfer";

export interface Binding {
  id: string;
  passport_id: string;
  app_principal_id: string;
  status: BindingStatus;
  current_grant_id: string;
  revision: number;
  created_at: ISO8601;
  suspended_at: ISO8601 | null;
  revoked_at: ISO8601 | null;
  suspension_type: SuspensionType | null;
}

// --- Grant ---

export type ConsentMethod =
  | "initial_auth"
  | "upgrade_prompt"
  | "downgrade_silent"
  | "reauthorization";

export interface BindingGrant {
  id: string;
  binding_id: string;
  version: number;
  capabilities: Capability[];
  data_policy: DataPolicy;
  authorized_purposes: string[];
  consent_record_id: string;
  consented_at: ISO8601;
  consent_method: ConsentMethod;
  supersedes_grant_id: string | null;
  active: boolean;
}

// --- Data Policy ---

export interface WriteRateLimit {
  max_observations_per_hour: number;
  max_observations_per_day: number;
  max_per_request: number;
}

export interface SemanticWriteLimits {
  max_new_claims_per_category_per_day: number;
  min_interval_same_tuple_hours: number;
  max_active_claims_per_category: number;
}

export interface ReadPolicy {
  categories: ClaimCategory[];
  sensitivity_ceiling: Sensitivity;
}

export interface WritePolicy {
  categories: ClaimCategory[];
  sensitivity_ceiling: Sensitivity;
  rate_limit: WriteRateLimit;
  semantic_limits: SemanticWriteLimits;
  evidence_required: true;
}

export interface DataPolicy {
  read: ReadPolicy;
  write: WritePolicy;
}

// --- Expiration ---

export type ExpirationRule =
  | { type: "until_revoked" }
  | { type: "periodic"; interval_days: number }
  | { type: "one_time" };

// --- Purpose Templates ---

export interface PurposeTemplate {
  id: string;
  name: string;
  description: string;
  max_capabilities: Capability[];
  max_read_categories: ClaimCategory[];
  max_write_categories: ClaimCategory[];
  max_sensitivity: Sensitivity;
}

// --- Restricted Claim Approval ---

export type RestrictedApprovalGranularity =
  | {
      type: "claim_version";
      claim_id: string;
      claim_version_id: string;
      expires_at: null;
    }
  | {
      type: "claim_lineage";
      claim_id: string;
      expires_at: ISO8601;
    }
  | {
      type: "category";
      category: ClaimCategory;
      sensitivity: "restricted";
      expires_at: ISO8601;
    };

// --- Consent ---

export interface GrantDelta {
  added_capabilities: Capability[];
  removed_capabilities: Capability[];
  added_read_categories: ClaimCategory[];
  removed_read_categories: ClaimCategory[];
  added_write_categories: ClaimCategory[];
  removed_write_categories: ClaimCategory[];
  read_sensitivity_change: { from: Sensitivity; to: Sensitivity } | null;
  write_sensitivity_change: { from: Sensitivity; to: Sensitivity } | null;
  added_purposes: string[];
  removed_purposes: string[];
  expiration_changes:
    | { capability: Capability; from: ExpirationRule; to: ExpirationRule }[]
    | null;
  restricted_approval_changes: RestrictedApprovalGranularity[] | null;
}

export interface ConsentPresentation {
  capabilities_displayed: Capability[];
  categories_displayed: ClaimCategory[];
  purposes_displayed: string[];
}

export interface ConsentRecord {
  id: string;
  binding_id: string;
  grant_id: string;
  grant_version: number;
  consented_at: ISO8601;
  consent_type: "initial" | "expansion" | "reduction" | "reauthorization";
  capabilities_granted: Capability[];
  data_policy_granted: DataPolicy;
  delta_from_previous: GrantDelta | null;
  presented_to_user: ConsentPresentation;
}

// --- Authorization Request/Result ---

export interface AuthorizationRequest {
  credential_id: string;
  binding_id: string;
  binding_revision: number;
  capability: Capability;
  categories: ClaimCategory[];
  max_sensitivity: Sensitivity;
  purpose: string | null;
}

export type AuthorizationDecision =
  | {
      decision: "ALLOW";
      binding_id: string;
      grant_id: string;
      grant_version: number;
      effective_categories: ClaimCategory[];
      effective_sensitivity_ceiling: Sensitivity;
      binding_revision: number;
      policy_version: string;
    }
  | {
      decision: "DENY";
      reason: AuthorizationDenyReason;
    };

export type AuthorizationDenyReason =
  | "binding_not_found"
  | "binding_suspended"
  | "binding_revoked"
  | "stale_binding_revision"
  | "grant_not_found"
  | "grant_inactive"
  | "grant_expired"
  | "capability_not_granted"
  | "category_not_granted"
  | "sensitivity_exceeds_ceiling"
  | "purpose_not_authorized"
  | "credential_invalid"
  | "credential_expired"
  | "restricted_claim_not_approved";
