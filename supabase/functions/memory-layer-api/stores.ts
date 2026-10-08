// Supabase persistence store implementations
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type {
  Claim, ClaimVersion, ClaimCategory, ClaimState, Sensitivity, Volatility, SharingPolicy,
  Observation, ObservationOutcome, Evidence, EvidenceLineage, EvidenceStatus, EvidenceTier, ProvenanceStatus,
  Binding, BindingStatus, BindingGrant, Capability, DataPolicy, ConsentMethod, SuspensionType,
  TokenFamily, UserMemoryEvent, UserMemoryAction,
  ClaimStore, EvidenceStore, ObservationStore, UserMemoryEventStore, TokenFamilyStore,
} from "./kernel.ts";
import { SENSITIVITY_ORDER } from "./kernel.ts";

type PersistenceClient = SupabaseClient;

function rowToClaim(row: Record<string, unknown>): Claim {
  return {
    id: row.id as string, passport_id: row.passport_id as string,
    subject: row.subject as string, predicate: row.predicate as string, value: row.value as string,
    qualifiers: (row.qualifiers as Record<string, string>) ?? {}, category: row.category as ClaimCategory,
    tags: (row.tags as string[]) ?? [], state: row.state as ClaimState,
    declared_state: (row.declared_state as ClaimState) ?? null, observed_state: (row.observed_state as ClaimState) ?? null,
    volatility: row.volatility as Volatility, created_at: row.created_at as string, updated_at: row.updated_at as string,
    last_confirmed_at: (row.last_confirmed_at as string) ?? null, expires_at: (row.expires_at as string) ?? null,
    sensitivity: row.sensitivity as Sensitivity,
    sharing_policy: (row.sharing_policy as SharingPolicy) ?? { type: "grant_controlled" },
    evidence_ids: [], purged_references: [], contradicted_by: [],
    current_version_id: row.current_version_id as string,
    deleted: row.deleted as boolean, deleted_at: (row.deleted_at as string) ?? null,
  };
}

function rowToVersion(row: Record<string, unknown>): ClaimVersion {
  return {
    id: row.id as string, claim_id: row.claim_id as string, version_number: row.version_number as number,
    previous_version_id: (row.previous_version_id as string) ?? null, value: row.value as string,
    qualifiers: (row.qualifiers as Record<string, string>) ?? {}, state: row.state as ClaimState,
    changed_by: row.changed_by as string, changed_at: row.changed_at as string,
    change_reason: row.change_reason as string, evidence_ids: (row.evidence_ids as string[]) ?? [],
  };
}

export class SupabaseClaimStore implements ClaimStore {
  constructor(private client: PersistenceClient) {}

  async getClaim(passportId: string, claimId: string): Promise<Claim | null> {
    const { data, error } = await this.client.from("claims").select("*").eq("id", claimId).eq("passport_id", passportId).maybeSingle();
    if (error) throw error;
    return data ? rowToClaim(data) : null;
  }

  async getClaims(passportId: string, query: { categories?: ClaimCategory[]; sensitivity_ceiling?: Sensitivity; include_deleted?: boolean; states?: ClaimState[]; subject?: string; predicate?: string; limit?: number; offset?: number }): Promise<Claim[]> {
    let q = this.client.from("claims").select("*").eq("passport_id", passportId);
    if (!query.include_deleted) q = q.eq("deleted", false);
    if (query.categories && query.categories.length > 0) q = q.in("category", query.categories);
    if (query.states && query.states.length > 0) q = q.in("state", query.states);
    if (query.subject) q = q.eq("subject", query.subject);
    if (query.predicate) q = q.eq("predicate", query.predicate);
    if (query.sensitivity_ceiling) {
      const levels = (["public", "personal", "sensitive", "restricted"] as Sensitivity[]).filter((s) => SENSITIVITY_ORDER[s] <= SENSITIVITY_ORDER[query.sensitivity_ceiling!]);
      q = q.in("sensitivity", levels);
    }
    if (query.limit) q = q.limit(query.limit);
    if (query.offset) q = q.range(query.offset, query.offset + (query.limit ?? 100) - 1);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(rowToClaim);
  }

  async createClaim(passportId: string, claim: Claim): Promise<void> {
    const { error } = await this.client.from("claims").insert({
      id: claim.id, passport_id: passportId, subject: claim.subject, predicate: claim.predicate,
      value: claim.value, qualifiers: claim.qualifiers, category: claim.category, tags: claim.tags,
      state: claim.state, declared_state: claim.declared_state, observed_state: claim.observed_state,
      volatility: claim.volatility, created_at: claim.created_at, updated_at: claim.updated_at,
      last_confirmed_at: claim.last_confirmed_at, expires_at: claim.expires_at,
      sensitivity: claim.sensitivity, sharing_policy: claim.sharing_policy,
      current_version_id: claim.current_version_id, deleted: claim.deleted, deleted_at: claim.deleted_at,
    });
    if (error) throw error;
  }

  async updateClaim(passportId: string, claim: Claim): Promise<void> {
    const { error } = await this.client.from("claims").update({
      value: claim.value, qualifiers: claim.qualifiers, state: claim.state,
      declared_state: claim.declared_state, observed_state: claim.observed_state,
      volatility: claim.volatility, updated_at: claim.updated_at,
      last_confirmed_at: claim.last_confirmed_at, expires_at: claim.expires_at,
      sensitivity: claim.sensitivity, sharing_policy: claim.sharing_policy,
      current_version_id: claim.current_version_id, deleted: claim.deleted, deleted_at: claim.deleted_at,
    }).eq("id", claim.id).eq("passport_id", passportId);
    if (error) throw error;
  }

  async getClaimVersions(passportId: string, claimId: string): Promise<ClaimVersion[]> {
    const claim = await this.getClaim(passportId, claimId);
    if (!claim) return [];
    const { data, error } = await this.client.from("claim_versions").select("*").eq("claim_id", claimId).order("version_number", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToVersion);
  }

  async createClaimVersion(_passportId: string, version: ClaimVersion): Promise<void> {
    const { error } = await this.client.from("claim_versions").insert({
      id: version.id, claim_id: version.claim_id, version_number: version.version_number,
      previous_version_id: version.previous_version_id, value: version.value,
      qualifiers: version.qualifiers, state: version.state, changed_by: version.changed_by,
      changed_at: version.changed_at, change_reason: version.change_reason, evidence_ids: version.evidence_ids,
    });
    if (error) throw error;
  }

  async findMatchingClaim(passportId: string, subject: string, predicate: string, _qualifiers: Record<string, string>): Promise<Claim | null> {
    const { data, error } = await this.client.from("claims").select("*").eq("passport_id", passportId).eq("subject", subject).eq("predicate", predicate).eq("deleted", false).maybeSingle();
    if (error) throw error;
    return data ? rowToClaim(data) : null;
  }

  async countActiveClaimsByCategory(passportId: string, category: ClaimCategory): Promise<number> {
    const { count, error } = await this.client.from("claims").select("*", { count: "exact", head: true }).eq("passport_id", passportId).eq("category", category).eq("deleted", false);
    if (error) throw error;
    return count ?? 0;
  }

  async countNewClaimsToday(passportId: string, category: ClaimCategory): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count, error } = await this.client.from("claims").select("*", { count: "exact", head: true }).eq("passport_id", passportId).eq("category", category).gte("created_at", today.toISOString());
    if (error) throw error;
    return count ?? 0;
  }

  async getLastObservationTime(passportId: string, subject: string, predicate: string, value: string): Promise<string | null> {
    const { data, error } = await this.client.from("observations").select("submitted_at, bindings!inner(passport_id)").eq("subject", subject).eq("predicate", predicate).eq("value", value).eq("bindings.passport_id", passportId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? (data.submitted_at as string) : null;
  }
}

function rowToObservation(row: Record<string, unknown>): Observation {
  return {
    id: row.id as string, idempotency_key: row.idempotency_key as string,
    binding_id: row.binding_id as string, experience_id: (row.experience_id as string) ?? null,
    subject: row.subject as string, predicate: row.predicate as string, value: row.value as string,
    qualifiers: (row.qualifiers as Record<string, string>) ?? {},
    declared_sensitivity: row.declared_sensitivity as Sensitivity,
    declared_category: row.declared_category as ClaimCategory,
    extraction_method: row.extraction_method as Observation["extraction_method"],
    raw_context: row.raw_context as string, submitted_at: row.submitted_at as string,
    outcome: (row.outcome as ObservationOutcome) ?? null,
  };
}

export class SupabaseObservationStore implements ObservationStore {
  constructor(private client: PersistenceClient) {}

  async getObservation(passportId: string, observationId: string): Promise<Observation | null> {
    const { data, error } = await this.client.from("observations").select("*, bindings!inner(passport_id)").eq("id", observationId).eq("bindings.passport_id", passportId).maybeSingle();
    if (error) throw error;
    return data ? rowToObservation(data) : null;
  }

  async createObservation(_passportId: string, observation: Observation): Promise<void> {
    const { error } = await this.client.from("observations").insert({
      id: observation.id, idempotency_key: observation.idempotency_key,
      binding_id: observation.binding_id, experience_id: observation.experience_id,
      subject: observation.subject, predicate: observation.predicate, value: observation.value,
      qualifiers: observation.qualifiers, declared_sensitivity: observation.declared_sensitivity,
      declared_category: observation.declared_category, extraction_method: observation.extraction_method,
      raw_context: observation.raw_context, submitted_at: observation.submitted_at, outcome: observation.outcome,
    });
    if (error) throw error;
  }

  async updateObservation(_passportId: string, observation: Observation): Promise<void> {
    const { error } = await this.client.from("observations").update({ outcome: observation.outcome }).eq("id", observation.id);
    if (error) throw error;
  }

  async findByIdempotencyKey(bindingId: string, idempotencyKey: string): Promise<Observation | null> {
    const { data, error } = await this.client.from("observations").select("*").eq("binding_id", bindingId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (error) throw error;
    return data ? rowToObservation(data) : null;
  }
}

function rowToEvidence(row: Record<string, unknown>): Evidence {
  return {
    id: row.id as string, claim_id: row.claim_id as string,
    observation_id: (row.observation_id as string) ?? null,
    source_type: row.source_type as EvidenceTier, app_id: row.app_id as string,
    experience_id: (row.experience_id as string) ?? null, observed_at: row.observed_at as string,
    raw_observation: row.raw_observation as string, extraction_method: row.extraction_method as string,
    first_party: row.first_party as boolean, lineage: row.lineage as EvidenceLineage,
    status: row.status as EvidenceStatus, retracted_at: (row.retracted_at as string) ?? null,
    retraction_reason: (row.retraction_reason as string) ?? null,
    provenance_status: row.provenance_status as ProvenanceStatus,
  };
}

export class SupabaseEvidenceStore implements EvidenceStore {
  constructor(private client: PersistenceClient) {}

  async getEvidence(passportId: string, evidenceId: string): Promise<Evidence | null> {
    const { data, error } = await this.client.from("evidence").select("*, claims!inner(passport_id)").eq("id", evidenceId).eq("claims.passport_id", passportId).maybeSingle();
    if (error) throw error;
    return data ? rowToEvidence(data) : null;
  }

  async getEvidenceForClaim(passportId: string, claimId: string, status?: EvidenceStatus): Promise<Evidence[]> {
    let q = this.client.from("evidence").select("*, claims!inner(passport_id)").eq("claim_id", claimId).eq("claims.passport_id", passportId);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(rowToEvidence);
  }

  async createEvidence(_passportId: string, evidence: Evidence): Promise<void> {
    const { error } = await this.client.from("evidence").insert({
      id: evidence.id, claim_id: evidence.claim_id, observation_id: evidence.observation_id,
      source_type: evidence.source_type, app_id: evidence.app_id, experience_id: evidence.experience_id,
      observed_at: evidence.observed_at, raw_observation: evidence.raw_observation,
      extraction_method: evidence.extraction_method, first_party: evidence.first_party,
      lineage: evidence.lineage, status: evidence.status, retracted_at: evidence.retracted_at,
      retraction_reason: evidence.retraction_reason, provenance_status: evidence.provenance_status,
    });
    if (error) throw error;
  }

  async updateEvidence(_passportId: string, evidence: Evidence): Promise<void> {
    const { error } = await this.client.from("evidence").update({
      status: evidence.status, retracted_at: evidence.retracted_at,
      retraction_reason: evidence.retraction_reason, provenance_status: evidence.provenance_status,
    }).eq("id", evidence.id);
    if (error) throw error;
  }
}

function rowToBinding(row: Record<string, unknown>): Binding {
  return {
    id: row.id as string, passport_id: row.passport_id as string,
    app_principal_id: row.app_principal_id as string, status: row.status as BindingStatus,
    current_grant_id: row.current_grant_id as string, revision: row.revision as number,
    created_at: row.created_at as string, suspended_at: (row.suspended_at as string) ?? null,
    revoked_at: (row.revoked_at as string) ?? null,
    suspension_type: (row.suspension_type as SuspensionType) ?? null,
  };
}

function rowToGrant(row: Record<string, unknown>): BindingGrant {
  return {
    id: row.id as string, binding_id: row.binding_id as string, version: row.version as number,
    capabilities: row.capabilities as Capability[], data_policy: row.data_policy as DataPolicy,
    authorized_purposes: (row.authorized_purposes as string[]) ?? [],
    consent_record_id: row.consent_record_id as string, consented_at: row.consented_at as string,
    consent_method: row.consent_method as ConsentMethod,
    supersedes_grant_id: (row.supersedes_grant_id as string) ?? null, active: row.active as boolean,
  };
}

export class SupabaseBindingStoreImpl {
  constructor(private client: PersistenceClient) {}

  async getBinding(bindingId: string): Promise<Binding | null> {
    const { data, error } = await this.client.from("bindings").select("*").eq("id", bindingId).maybeSingle();
    if (error) throw error;
    return data ? rowToBinding(data) : null;
  }

  async getBindingForPassportAndApp(passportId: string, appPrincipalId: string): Promise<Binding | null> {
    const { data, error } = await this.client.from("bindings").select("*").eq("passport_id", passportId).eq("app_principal_id", appPrincipalId).maybeSingle();
    if (error) throw error;
    return data ? rowToBinding(data) : null;
  }

  async createBinding(binding: Binding): Promise<void> {
    const { error } = await this.client.from("bindings").insert({
      id: binding.id, passport_id: binding.passport_id, app_principal_id: binding.app_principal_id,
      status: binding.status, current_grant_id: binding.current_grant_id, revision: binding.revision,
      created_at: binding.created_at, suspended_at: binding.suspended_at, revoked_at: binding.revoked_at,
      suspension_type: binding.suspension_type,
    });
    if (error) throw error;
  }

  async updateBinding(binding: Binding): Promise<void> {
    const { error } = await this.client.from("bindings").update({
      status: binding.status, current_grant_id: binding.current_grant_id,
      revision: binding.revision, suspended_at: binding.suspended_at,
      revoked_at: binding.revoked_at, suspension_type: binding.suspension_type,
    }).eq("id", binding.id);
    if (error) throw error;
  }
}

export class SupabaseGrantStoreImpl {
  constructor(private client: PersistenceClient) {}

  async getGrant(grantId: string): Promise<BindingGrant | null> {
    const { data, error } = await this.client.from("binding_grants").select("*").eq("id", grantId).maybeSingle();
    if (error) throw error;
    return data ? rowToGrant(data) : null;
  }

  async getGrantsForBinding(bindingId: string): Promise<BindingGrant[]> {
    const { data, error } = await this.client.from("binding_grants").select("*").eq("binding_id", bindingId).order("version", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToGrant);
  }

  async createGrant(grant: BindingGrant): Promise<void> {
    const { error } = await this.client.from("binding_grants").insert({
      id: grant.id, binding_id: grant.binding_id, version: grant.version,
      capabilities: grant.capabilities, data_policy: grant.data_policy,
      authorized_purposes: grant.authorized_purposes, consent_record_id: grant.consent_record_id,
      consented_at: grant.consented_at, consent_method: grant.consent_method,
      supersedes_grant_id: grant.supersedes_grant_id, active: grant.active,
    });
    if (error) throw error;
  }

  async deactivateGrant(grantId: string): Promise<void> {
    const { error } = await this.client.from("binding_grants").update({ active: false }).eq("id", grantId);
    if (error) throw error;
  }
}

function rowToFamily(row: Record<string, unknown>): TokenFamily {
  return {
    family_id: row.family_id as string, binding_id: row.binding_id as string,
    current_generation: row.current_generation as number, created_at: row.created_at as string,
    revoked_at: (row.revoked_at as string) ?? null,
  };
}

export class SupabaseTokenFamilyStoreImpl implements TokenFamilyStore {
  constructor(private client: PersistenceClient) {}

  async getFamily(familyId: string): Promise<TokenFamily | null> {
    const { data, error } = await this.client.from("token_families").select("*").eq("family_id", familyId).maybeSingle();
    if (error) throw error;
    return data ? rowToFamily(data) : null;
  }

  async compareAndSwapGeneration(familyId: string, expectedGeneration: number, _newGeneration: number): Promise<boolean> {
    const { data, error } = await this.client.rpc("token_family_cas", { p_family_id: familyId, p_expected_generation: expectedGeneration });
    if (error) throw error;
    return (data as number) > 0;
  }

  async revokeFamily(familyId: string, revokedAt: string): Promise<void> {
    const { error } = await this.client.from("token_families").update({ revoked_at: revokedAt }).eq("family_id", familyId);
    if (error) throw error;
  }
}

function rowToEvent(row: Record<string, unknown>): UserMemoryEvent {
  return {
    id: row.id as string, claim_id: row.claim_id as string, action: row.action as UserMemoryAction,
    previous_value: (row.previous_value as string) ?? null, new_value: (row.new_value as string) ?? null,
    previous_sensitivity: (row.previous_sensitivity as Sensitivity) ?? null,
    new_sensitivity: (row.new_sensitivity as Sensitivity) ?? null,
    performed_at: row.performed_at as string,
    creates_evidence_id: (row.creates_evidence_id as string) ?? null,
    creates_version_id: (row.creates_version_id as string) ?? null,
  };
}

export class SupabaseUserMemoryEventStoreImpl implements UserMemoryEventStore {
  constructor(private client: PersistenceClient) {}

  async createEvent(passportId: string, event: UserMemoryEvent): Promise<void> {
    const { error } = await this.client.from("user_memory_events").insert({
      id: event.id, passport_id: passportId, claim_id: event.claim_id, action: event.action,
      previous_value: event.previous_value, new_value: event.new_value,
      previous_sensitivity: event.previous_sensitivity, new_sensitivity: event.new_sensitivity,
      performed_at: event.performed_at, creates_evidence_id: event.creates_evidence_id,
      creates_version_id: event.creates_version_id,
    });
    if (error) throw error;
  }

  async getEventsForClaim(passportId: string, claimId: string): Promise<UserMemoryEvent[]> {
    const { data, error } = await this.client.from("user_memory_events").select("*").eq("claim_id", claimId).eq("passport_id", passportId).order("performed_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToEvent);
  }
}
