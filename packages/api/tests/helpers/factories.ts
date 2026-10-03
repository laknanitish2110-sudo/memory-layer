import type {
  Binding,
  BindingGrant,
  AuthorizationRequest,
  AuthorizationDecision,
  DataPolicy,
} from "@memory-layer/protocol/src/authorization/types.js";
import type {
  Claim,
  ClaimCategory,
  Evidence,
  Observation,
  Sensitivity,
  Capability,
  ClaimVersion,
  UserMemoryEvent,
  AccessEvent,
} from "@memory-layer/protocol/src/memory/types.js";
import type { ClaimStore, EvidenceStore, ObservationStore, UserMemoryEventStore } from "@memory-layer/protocol/src/memory/repository.js";

// --- Identity Factories ---

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${String(++idCounter).padStart(6, "0")}`;
}

export function resetIdCounter(): void {
  idCounter = 0;
}

export function passportId(suffix = "a"): string {
  return `psp_test_${suffix}`;
}

export function bindingId(suffix = "a"): string {
  return `bnd_test_${suffix}`;
}

export function grantId(suffix = "a"): string {
  return `grt_test_${suffix}`;
}

export function appId(suffix = "a"): string {
  return `app_test_${suffix}`;
}

export function familyId(suffix = "a"): string {
  return `fam_test_${suffix}`;
}

// --- Entity Factories ---

export function makeBinding(overrides: Partial<Binding> = {}): Binding {
  return {
    id: bindingId(),
    passport_id: passportId(),
    app_principal_id: appId(),
    status: "active",
    current_grant_id: grantId(),
    revision: 1,
    created_at: "2026-10-01T00:00:00Z",
    suspended_at: null,
    revoked_at: null,
    suspension_type: null,
    ...overrides,
  };
}

export function makeDataPolicy(overrides: Partial<DataPolicy> = {}): DataPolicy {
  return {
    read: {
      categories: ["skills", "preferences", "projects"],
      sensitivity_ceiling: "personal",
      ...overrides.read,
    },
    write: {
      categories: ["skills"],
      sensitivity_ceiling: "personal",
      rate_limit: {
        max_observations_per_hour: 100,
        max_observations_per_day: 1000,
        max_per_request: 10,
      },
      semantic_limits: {
        max_new_claims_per_category_per_day: 50,
        min_interval_same_tuple_hours: 1,
        max_active_claims_per_category: 500,
      },
      evidence_required: true,
      ...overrides.write,
    },
  };
}

export function makeGrant(overrides: Partial<BindingGrant> = {}): BindingGrant {
  return {
    id: grantId(),
    binding_id: bindingId(),
    version: 1,
    capabilities: ["read_context", "read_claims", "write_claims", "retract_own_observation"],
    data_policy: makeDataPolicy(),
    authorized_purposes: ["coding_assistance"],
    consent_record_id: "cns_test_001",
    consented_at: "2026-10-01T00:00:00Z",
    consent_method: "initial_auth",
    supersedes_grant_id: null,
    active: true,
    ...overrides,
  };
}

export function makeAuthRequest(overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest {
  return {
    credential_id: "cred_test_001",
    binding_id: bindingId(),
    binding_revision: 1,
    capability: "read_context",
    categories: ["skills"],
    max_sensitivity: "personal",
    purpose: "coding_assistance",
    ...overrides,
  };
}

export function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: nextId("clm"),
    passport_id: passportId(),
    subject: "user",
    predicate: "knows",
    value: "Python",
    qualifiers: {},
    category: "skills",
    tags: [],
    state: "SUPPORTED",
    declared_state: null,
    observed_state: "SUPPORTED",
    volatility: "stable",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    last_confirmed_at: null,
    expires_at: null,
    sensitivity: "public",
    sharing_policy: { type: "grant_controlled" },
    evidence_ids: ["evi_test_001"],
    purged_references: [],
    contradicted_by: [],
    current_version_id: "ver_test_001",
    deleted: false,
    deleted_at: null,
    ...overrides,
  };
}

export function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: nextId("obs"),
    idempotency_key: nextId("idem"),
    binding_id: bindingId(),
    experience_id: null,
    subject: "user",
    predicate: "knows",
    value: "Python",
    qualifiers: {},
    declared_sensitivity: "public",
    declared_category: "skills",
    extraction_method: "user_stated",
    raw_context: "User said: 'I know Python'",
    submitted_at: "2026-10-01T00:00:00Z",
    outcome: null,
    ...overrides,
  };
}

export function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: nextId("evi"),
    claim_id: "clm_test_001",
    observation_id: "obs_test_001",
    source_type: 4,
    app_id: appId(),
    experience_id: null,
    observed_at: "2026-10-01T00:00:00Z",
    raw_observation: "User said: 'I know Python'",
    extraction_method: "user_stated",
    first_party: true,
    lineage: { origin_app_id: appId(), origin_experience_id: "exp_001", chain: [] },
    status: "active",
    retracted_at: null,
    retraction_reason: null,
    provenance_status: "active",
    ...overrides,
  };
}

// --- Mock Token ---

export interface MockTokenClaims {
  binding_id: string;
  family_id: string;
  passport_id: string;
  generation: number;
  issued_at: string;
  expires_at: string;
}

export function makeTokenClaims(overrides: Partial<MockTokenClaims> = {}): MockTokenClaims {
  return {
    binding_id: bindingId(),
    family_id: familyId(),
    passport_id: passportId(),
    generation: 0,
    issued_at: "2026-10-01T00:00:00Z",
    expires_at: "2026-10-01T01:00:00Z",
    ...overrides,
  };
}

// --- Mock Request/Response Helpers ---

export interface MockRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

export interface MockResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export function makeAppRequest(
  method: string,
  path: string,
  options: {
    body?: unknown;
    query?: Record<string, string>;
    token?: MockTokenClaims;
    extraHeaders?: Record<string, string>;
  } = {}
): MockRequest {
  return {
    method,
    path,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${encodeToken(options.token ?? makeTokenClaims())}`,
      ...options.extraHeaders,
    },
    body: options.body,
    query: options.query,
  };
}

export function makeUserRequest(
  method: string,
  path: string,
  options: {
    body?: unknown;
    passportId?: string;
    extraHeaders?: Record<string, string>;
  } = {}
): MockRequest {
  return {
    method,
    path,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer user_session_${options.passportId ?? passportId()}`,
      ...options.extraHeaders,
    },
    body: options.body,
  };
}

function encodeToken(claims: MockTokenClaims): string {
  return `app_token_${claims.binding_id}_${claims.family_id}_gen${claims.generation}`;
}

// --- Mock Store Factories ---

export function mockClaimStore(claims: Claim[] = []): ClaimStore {
  const claimMap = new Map(claims.map((c) => [`${c.passport_id}:${c.id}`, c]));
  return {
    getClaim: async (pid: string, cid: string) => claimMap.get(`${pid}:${cid}`) ?? null,
    getClaims: async (pid: string, query) => {
      return claims.filter((c) => {
        if (c.passport_id !== pid) return false;
        if (query.categories && !query.categories.includes(c.category)) return false;
        if (query.sensitivity_ceiling) {
          const order: Record<string, number> = { public: 0, personal: 1, sensitive: 2, restricted: 3 };
          if (order[c.sensitivity] > order[query.sensitivity_ceiling]) return false;
        }
        if (!query.include_deleted && c.deleted) return false;
        return true;
      });
    },
    createClaim: async () => {},
    updateClaim: async () => {},
    getClaimVersions: async () => [],
    createClaimVersion: async () => {},
    findMatchingClaim: async () => null,
    countActiveClaimsByCategory: async () => 0,
    countNewClaimsToday: async () => 0,
    getLastObservationTime: async () => null,
  };
}

export function mockObservationStore(observations: Observation[] = []): ObservationStore {
  const keyMap = new Map(observations.map((o) => [`${o.binding_id}:${o.idempotency_key}`, o]));
  return {
    getObservation: async (pid: string, oid: string) => {
      const found = observations.find((o) => o.id === oid);
      if (!found) return null;
      return found;
    },
    createObservation: async () => {},
    updateObservation: async () => {},
    findByIdempotencyKey: async (bid: string, key: string) => keyMap.get(`${bid}:${key}`) ?? null,
  };
}

export function mockEvidenceStore(evidence: Evidence[] = []): EvidenceStore {
  const eviMap = new Map(evidence.map((e) => [e.id, e]));
  return {
    getEvidence: async (pid: string, eid: string) => eviMap.get(eid) ?? null,
    getEvidenceForClaim: async (pid: string, cid: string) =>
      evidence.filter((e) => e.claim_id === cid && e.status === "active"),
    createEvidence: async () => {},
    updateEvidence: async () => {},
  };
}
