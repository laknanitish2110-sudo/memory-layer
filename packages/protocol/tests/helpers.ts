import type {
  Binding,
  BindingGrant,
  DataPolicy,
} from "../src/authorization/types.js";
import type {
  Claim,
  ClaimCategory,
  ClaimState,
  ClaimVersion,
  Evidence,
  EvidenceLineage,
  EvidenceTier,
  Observation,
  Sensitivity,
  UserMemoryEvent,
} from "../src/memory/types.js";
import type {
  ClaimStore,
  EvidenceStore,
  ObservationStore,
  UserMemoryEventStore,
  ClaimQuery,
} from "../src/memory/repository.js";
import type { IdGenerator } from "../src/reconciliation/write-pipeline.js";

let counter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${++counter}`;
}

export function resetIds(): void {
  counter = 0;
}

export function makeIdGenerator(): IdGenerator {
  return {
    observationId: () => nextId("obs"),
    evidenceId: () => nextId("ev"),
    claimId: () => nextId("cl"),
    claimVersionId: () => nextId("cv"),
  };
}

export function makeBinding(overrides: Partial<Binding> = {}): Binding {
  return {
    id: "binding_1",
    passport_id: "passport_1",
    app_principal_id: "app_1",
    status: "active",
    current_grant_id: "grant_1",
    revision: 1,
    created_at: "2024-01-01T00:00:00Z",
    suspended_at: null,
    revoked_at: null,
    suspension_type: null,
    ...overrides,
  };
}

export function makeGrant(overrides: Partial<BindingGrant> = {}): BindingGrant {
  return {
    id: "grant_1",
    binding_id: "binding_1",
    version: 1,
    capabilities: ["read_context", "read_claims", "write_claims"],
    data_policy: makeDataPolicy(),
    authorized_purposes: ["coding_assistance"],
    consent_record_id: "consent_1",
    consented_at: "2024-01-01T00:00:00Z",
    consent_method: "initial_auth",
    supersedes_grant_id: null,
    active: true,
    ...overrides,
  };
}

export function makeDataPolicy(
  overrides: Partial<DataPolicy> = {}
): DataPolicy {
  return {
    read: {
      categories: ["skills", "preferences", "projects"],
      sensitivity_ceiling: "personal",
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
    },
    ...overrides,
  };
}

export function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "cl_1",
    passport_id: "passport_1",
    subject: "user",
    predicate: "knows",
    value: "Python",
    qualifiers: {},
    category: "skills",
    tags: [],
    state: "OBSERVED",
    declared_state: null,
    observed_state: "OBSERVED",
    volatility: "stable",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    last_confirmed_at: null,
    expires_at: null,
    sensitivity: "public",
    sharing_policy: { type: "grant_controlled" },
    evidence_ids: ["ev_1"],
    purged_references: [],
    contradicted_by: [],
    current_version_id: "cv_1",
    deleted: false,
    deleted_at: null,
    ...overrides,
  };
}

export function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "ev_1",
    claim_id: "cl_1",
    observation_id: "obs_1",
    source_type: 4 as EvidenceTier,
    app_id: "app_1",
    experience_id: null,
    observed_at: "2024-01-01T00:00:00Z",
    raw_observation: "user demonstrated Python knowledge",
    extraction_method: "app_measured",
    first_party: true,
    lineage: {
      origin_app_id: "app_1",
      origin_experience_id: "",
      chain: ["app_1"],
    },
    status: "active",
    retracted_at: null,
    retraction_reason: null,
    provenance_status: "active",
    ...overrides,
  };
}

export function makeObservation(
  overrides: Partial<Omit<Observation, "id" | "outcome">> = {}
): Omit<Observation, "id" | "outcome"> {
  return {
    idempotency_key: `idem_${++counter}`,
    binding_id: "binding_1",
    experience_id: null,
    subject: "user",
    predicate: "knows",
    value: "Python",
    qualifiers: {},
    declared_sensitivity: "public",
    declared_category: "skills",
    extraction_method: "app_measured",
    raw_context: "user wrote a Python function",
    submitted_at: "2024-06-01T00:00:00Z",
    ...overrides,
  };
}

// --- In-memory stores ---

export class InMemoryClaimStore implements ClaimStore {
  private claims = new Map<string, Claim[]>();
  private versions = new Map<string, ClaimVersion[]>();

  async getClaim(passportId: string, claimId: string): Promise<Claim | null> {
    const list = this.claims.get(passportId) ?? [];
    return list.find((c) => c.id === claimId) ?? null;
  }

  async getClaims(passportId: string, query: ClaimQuery): Promise<Claim[]> {
    let list = this.claims.get(passportId) ?? [];
    if (!query.include_deleted) list = list.filter((c) => !c.deleted);
    if (query.categories) {
      const cats = new Set(query.categories);
      list = list.filter((c) => cats.has(c.category));
    }
    if (query.sensitivity_ceiling) {
      const order: Record<string, number> = {
        public: 0,
        personal: 1,
        sensitive: 2,
        restricted: 3,
      };
      const ceil = order[query.sensitivity_ceiling] ?? 3;
      list = list.filter((c) => (order[c.sensitivity] ?? 0) <= ceil);
    }
    if (query.states) {
      const states = new Set(query.states);
      list = list.filter((c) => states.has(c.state));
    }
    return list;
  }

  async createClaim(passportId: string, claim: Claim): Promise<void> {
    if (!this.claims.has(passportId)) this.claims.set(passportId, []);
    this.claims.get(passportId)!.push(claim);
  }

  async updateClaim(passportId: string, claim: Claim): Promise<void> {
    const list = this.claims.get(passportId) ?? [];
    const idx = list.findIndex((c) => c.id === claim.id);
    if (idx >= 0) list[idx] = claim;
  }

  async getClaimVersions(
    passportId: string,
    claimId: string
  ): Promise<ClaimVersion[]> {
    return (this.versions.get(passportId) ?? []).filter(
      (v) => v.claim_id === claimId
    );
  }

  async createClaimVersion(
    passportId: string,
    version: ClaimVersion
  ): Promise<void> {
    if (!this.versions.has(passportId)) this.versions.set(passportId, []);
    this.versions.get(passportId)!.push(version);
  }

  async findMatchingClaim(
    passportId: string,
    subject: string,
    predicate: string,
    qualifiers: Record<string, string>
  ): Promise<Claim | null> {
    const list = this.claims.get(passportId) ?? [];
    return (
      list.find(
        (c) =>
          !c.deleted &&
          c.subject === subject &&
          c.predicate === predicate &&
          JSON.stringify(c.qualifiers) === JSON.stringify(qualifiers)
      ) ?? null
    );
  }

  async countActiveClaimsByCategory(
    passportId: string,
    category: ClaimCategory
  ): Promise<number> {
    const list = this.claims.get(passportId) ?? [];
    return list.filter((c) => !c.deleted && c.category === category).length;
  }

  async countNewClaimsToday(
    passportId: string,
    category: ClaimCategory
  ): Promise<number> {
    return 0;
  }

  async getLastObservationTime(
    passportId: string,
    subject: string,
    predicate: string,
    value: string
  ): Promise<string | null> {
    return null;
  }
}

export class InMemoryEvidenceStore implements EvidenceStore {
  private evidence = new Map<string, Evidence[]>();

  async getEvidence(
    passportId: string,
    evidenceId: string
  ): Promise<Evidence | null> {
    return (
      (this.evidence.get(passportId) ?? []).find(
        (e) => e.id === evidenceId
      ) ?? null
    );
  }

  async getEvidenceForClaim(
    passportId: string,
    claimId: string,
    status?: "active" | "retracted"
  ): Promise<Evidence[]> {
    let list = (this.evidence.get(passportId) ?? []).filter(
      (e) => e.claim_id === claimId
    );
    if (status) list = list.filter((e) => e.status === status);
    return list;
  }

  async createEvidence(passportId: string, evidence: Evidence): Promise<void> {
    if (!this.evidence.has(passportId)) this.evidence.set(passportId, []);
    this.evidence.get(passportId)!.push(evidence);
  }

  async updateEvidence(passportId: string, evidence: Evidence): Promise<void> {
    const list = this.evidence.get(passportId) ?? [];
    const idx = list.findIndex((e) => e.id === evidence.id);
    if (idx >= 0) list[idx] = evidence;
  }
}

export class InMemoryObservationStore implements ObservationStore {
  private observations = new Map<string, Observation[]>();
  private byIdempotency = new Map<string, Observation>();

  async getObservation(
    passportId: string,
    observationId: string
  ): Promise<Observation | null> {
    return (
      (this.observations.get(passportId) ?? []).find(
        (o) => o.id === observationId
      ) ?? null
    );
  }

  async createObservation(
    passportId: string,
    observation: Observation
  ): Promise<void> {
    if (!this.observations.has(passportId))
      this.observations.set(passportId, []);
    this.observations.get(passportId)!.push(observation);
    this.byIdempotency.set(
      `${observation.binding_id}:${observation.idempotency_key}`,
      observation
    );
  }

  async updateObservation(
    passportId: string,
    observation: Observation
  ): Promise<void> {
    const list = this.observations.get(passportId) ?? [];
    const idx = list.findIndex((o) => o.id === observation.id);
    if (idx >= 0) list[idx] = observation;
  }

  async findByIdempotencyKey(
    bindingId: string,
    idempotencyKey: string
  ): Promise<Observation | null> {
    return this.byIdempotency.get(`${bindingId}:${idempotencyKey}`) ?? null;
  }
}
