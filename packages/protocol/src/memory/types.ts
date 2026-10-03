export type ISO8601 = string;

// --- Enums & Scalars ---

export type Sensitivity = "public" | "personal" | "sensitive" | "restricted";

export const SENSITIVITY_ORDER: Record<Sensitivity, number> = {
  public: 0,
  personal: 1,
  sensitive: 2,
  restricted: 3,
};

export type SharingPolicy =
  | { type: "grant_controlled" }
  | { type: "explicit_only"; approved_binding_ids: string[] }
  | { type: "user_only" };

export type Volatility = "stable" | "slow_changing" | "dynamic" | "ephemeral";

export type ClaimCategory =
  | "skills"
  | "preferences"
  | "goals"
  | "projects"
  | "behavioral_patterns"
  | "emotional_patterns"
  | "personal_context";

export const ALL_CATEGORIES: ClaimCategory[] = [
  "skills",
  "preferences",
  "goals",
  "projects",
  "behavioral_patterns",
  "emotional_patterns",
  "personal_context",
];

export const CATEGORY_SENSITIVITY_FLOORS: Record<ClaimCategory, Sensitivity> = {
  skills: "public",
  preferences: "public",
  goals: "personal",
  projects: "personal",
  behavioral_patterns: "personal",
  emotional_patterns: "sensitive",
  personal_context: "personal",
};

export type ClaimState =
  | "DECLARED"
  | "SUPPORTED"
  | "OBSERVED"
  | "CONTESTED"
  | "UNKNOWN"
  | "UNSUPPORTED"
  | "STALE"
  | "EXPIRED";

export type EvidenceStatus = "active" | "retracted";
export type ProvenanceStatus = "active" | "retracted" | "purged";

export type EvidenceTier = 1 | 2 | 3 | 4 | 5;

export const EVIDENCE_TIER_NAMES: Record<EvidenceTier, string> = {
  1: "User Correction",
  2: "User Statement",
  3: "Multi-App Consensus",
  4: "Single App Assertion",
  5: "Model Inference",
};

// --- Core Entities ---

export interface Experience {
  id: string;
  passport_id: string;
  app_id: string;
  binding_id: string;
  started_at: ISO8601;
  ended_at: ISO8601 | null;
  duration_seconds: number;
  context: Record<string, unknown>;
  summary: string;
  tags: string[];
}

export type ObservationOutcome =
  | { status: "accepted"; evidence_id: string; claim_id: string }
  | { status: "rejected"; reason: string }
  | { status: "quarantined"; reason: string; requires_user_action: true }
  | { status: "merged"; existing_claim_id: string; evidence_id: string };

export interface Observation {
  id: string;
  idempotency_key: string;
  binding_id: string;
  experience_id: string | null;
  subject: string;
  predicate: string;
  value: string;
  qualifiers: Record<string, string>;
  declared_sensitivity: Sensitivity;
  declared_category: ClaimCategory;
  extraction_method: "user_stated" | "app_measured" | "model_inferred";
  raw_context: string;
  submitted_at: ISO8601;
  outcome: ObservationOutcome | null;
}

export interface EvidenceLineage {
  origin_app_id: string;
  origin_experience_id: string;
  chain: string[];
}

export interface Evidence {
  id: string;
  claim_id: string;
  observation_id: string | null;
  source_type: EvidenceTier;
  app_id: string;
  experience_id: string | null;
  observed_at: ISO8601;
  raw_observation: string;
  extraction_method: string;
  first_party: boolean;
  lineage: EvidenceLineage;
  status: EvidenceStatus;
  retracted_at: ISO8601 | null;
  retraction_reason: string | null;
  provenance_status: ProvenanceStatus;
}

export interface PurgedProvenanceRecord {
  original_evidence_id: string;
  purged_at: ISO8601;
  provenance_status: "PURGED";
}

export interface Claim {
  id: string;
  passport_id: string;
  subject: string;
  predicate: string;
  value: string;
  qualifiers: Record<string, string>;
  category: ClaimCategory;
  tags: string[];
  state: ClaimState;
  declared_state: ClaimState | null;
  observed_state: ClaimState | null;
  volatility: Volatility;
  created_at: ISO8601;
  updated_at: ISO8601;
  last_confirmed_at: ISO8601 | null;
  expires_at: ISO8601 | null;
  sensitivity: Sensitivity;
  sharing_policy: SharingPolicy;
  evidence_ids: string[];
  purged_references: PurgedProvenanceRecord[];
  contradicted_by: string[];
  current_version_id: string;
  deleted: boolean;
  deleted_at: ISO8601 | null;
}

export interface ClaimVersion {
  id: string;
  claim_id: string;
  version_number: number;
  previous_version_id: string | null;
  value: string;
  qualifiers: Record<string, string>;
  state: ClaimState;
  changed_by: string;
  changed_at: ISO8601;
  change_reason: string;
  evidence_ids: string[];
}

export type UserMemoryAction =
  | "CONFIRM"
  | "CORRECT"
  | "OVERRIDE"
  | "DELETE"
  | "RECLASSIFY"
  | "DISPUTE";

export interface UserMemoryEvent {
  id: string;
  claim_id: string;
  action: UserMemoryAction;
  previous_value: string | null;
  new_value: string | null;
  previous_sensitivity: Sensitivity | null;
  new_sensitivity: Sensitivity | null;
  performed_at: ISO8601;
  creates_evidence_id: string | null;
  creates_version_id: string | null;
}

export interface AccessEvent {
  id: string;
  binding_id: string;
  grant_id: string;
  credential_id: string;
  capability_used: Capability;
  categories_accessed: ClaimCategory[];
  claims_served: string[];
  claims_served_count: number;
  sensitivity_levels_touched: Sensitivity[];
  accessed_at: ISO8601;
  request_context: string | null;
  policy_version: string;
  grant_version: number;
  binding_revision: number;
}

// --- Capabilities ---

export type Capability =
  | "read_context"
  | "read_claims"
  | "read_versions"
  | "read_evidence"
  | "write_claims"
  | "update_own_claims"
  | "retract_own_observation"
  | "write_experiences"
  | "read_experiences"
  | "request_elevation";

export const READ_CAPABILITIES: Capability[] = [
  "read_context",
  "read_claims",
  "read_versions",
  "read_evidence",
];

export const WRITE_CAPABILITIES: Capability[] = [
  "write_claims",
  "update_own_claims",
  "retract_own_observation",
];

// --- App Reliability ---

export interface AppReliability {
  app_id: string;
  claims_created: number;
  claims_confirmed: number;
  claims_corrected: number;
  correction_rate: number;
  sample_size: number;
  observation_window: { start: ISO8601; end: ISO8601 };
}
