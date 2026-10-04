// Protocol kernel types, authorization, reconciliation, context, token family

export type ISO8601 = string;
export type Sensitivity = "public" | "personal" | "sensitive" | "restricted";
export const SENSITIVITY_ORDER: Record<Sensitivity, number> = { public: 0, personal: 1, sensitive: 2, restricted: 3 };
export type SharingPolicy = { type: "grant_controlled" } | { type: "explicit_only"; approved_binding_ids: string[] } | { type: "user_only" };
export type Volatility = "stable" | "slow_changing" | "dynamic" | "ephemeral";
export type ClaimCategory = "skills" | "preferences" | "goals" | "projects" | "behavioral_patterns" | "emotional_patterns" | "personal_context";
export const CATEGORY_SENSITIVITY_FLOORS: Record<ClaimCategory, Sensitivity> = { skills: "public", preferences: "public", goals: "personal", projects: "personal", behavioral_patterns: "personal", emotional_patterns: "sensitive", personal_context: "personal" };
export type ClaimState = "DECLARED" | "SUPPORTED" | "OBSERVED" | "CONTESTED" | "UNKNOWN" | "UNSUPPORTED" | "STALE" | "EXPIRED";
export type EvidenceStatus = "active" | "retracted";
export type ProvenanceStatus = "active" | "retracted" | "purged";
export type EvidenceTier = 1 | 2 | 3 | 4 | 5;
export type ObservationOutcome = { status: "accepted"; evidence_id: string; claim_id: string } | { status: "rejected"; reason: string } | { status: "quarantined"; reason: string; requires_user_action: true } | { status: "merged"; existing_claim_id: string; evidence_id: string };

export interface Observation { id: string; idempotency_key: string; binding_id: string; experience_id: string | null; subject: string; predicate: string; value: string; qualifiers: Record<string, string>; declared_sensitivity: Sensitivity; declared_category: ClaimCategory; extraction_method: "user_stated" | "app_measured" | "model_inferred"; raw_context: string; submitted_at: ISO8601; outcome: ObservationOutcome | null; }
export interface EvidenceLineage { origin_app_id: string; origin_experience_id: string; chain: string[]; }
export interface Evidence { id: string; claim_id: string; observation_id: string | null; source_type: EvidenceTier; app_id: string; experience_id: string | null; observed_at: ISO8601; raw_observation: string; extraction_method: string; first_party: boolean; lineage: EvidenceLineage; status: EvidenceStatus; retracted_at: ISO8601 | null; retraction_reason: string | null; provenance_status: ProvenanceStatus; }
export interface Claim { id: string; passport_id: string; subject: string; predicate: string; value: string; qualifiers: Record<string, string>; category: ClaimCategory; tags: string[]; state: ClaimState; declared_state: ClaimState | null; observed_state: ClaimState | null; volatility: Volatility; created_at: ISO8601; updated_at: ISO8601; last_confirmed_at: ISO8601 | null; expires_at: ISO8601 | null; sensitivity: Sensitivity; sharing_policy: SharingPolicy; evidence_ids: string[]; purged_references: Array<{ original_evidence_id: string; purged_at: ISO8601; provenance_status: "PURGED" }>; contradicted_by: string[]; current_version_id: string; deleted: boolean; deleted_at: ISO8601 | null; }
export interface ClaimVersion { id: string; claim_id: string; version_number: number; previous_version_id: string | null; value: string; qualifiers: Record<string, string>; state: ClaimState; changed_by: string; changed_at: ISO8601; change_reason: string; evidence_ids: string[]; }
export type UserMemoryAction = "CONFIRM" | "CORRECT" | "OVERRIDE" | "DELETE" | "RECLASSIFY" | "DISPUTE";
export interface UserMemoryEvent { id: string; claim_id: string; action: UserMemoryAction; previous_value: string | null; new_value: string | null; previous_sensitivity: Sensitivity | null; new_sensitivity: Sensitivity | null; performed_at: ISO8601; creates_evidence_id: string | null; creates_version_id: string | null; }
export type Capability = "read_context" | "read_claims" | "read_versions" | "read_evidence" | "write_claims" | "update_own_claims" | "retract_own_observation" | "write_experiences" | "read_experiences" | "request_elevation";

export type BindingStatus = "active" | "suspended" | "revoked";
export type SuspensionType = "user_paused" | "platform_rate_violation" | "platform_security" | "platform_abuse" | "ownership_transfer";
export interface Binding { id: string; passport_id: string; app_principal_id: string; status: BindingStatus; current_grant_id: string; revision: number; created_at: ISO8601; suspended_at: ISO8601 | null; revoked_at: ISO8601 | null; suspension_type: SuspensionType | null; }
export type ConsentMethod = "initial_auth" | "upgrade_prompt" | "downgrade_silent" | "reauthorization";
export interface ReadPolicy { categories: ClaimCategory[]; sensitivity_ceiling: Sensitivity; }
export interface WriteRateLimit { max_observations_per_hour: number; max_observations_per_day: number; max_per_request: number; }
export interface SemanticWriteLimits { max_new_claims_per_category_per_day: number; min_interval_same_tuple_hours: number; max_active_claims_per_category: number; }
export interface WritePolicy { categories: ClaimCategory[]; sensitivity_ceiling: Sensitivity; rate_limit: WriteRateLimit; semantic_limits: SemanticWriteLimits; evidence_required: true; }
export interface DataPolicy { read: ReadPolicy; write: WritePolicy; }
export interface BindingGrant { id: string; binding_id: string; version: number; capabilities: Capability[]; data_policy: DataPolicy; authorized_purposes: string[]; consent_record_id: string; consented_at: ISO8601; consent_method: ConsentMethod; supersedes_grant_id: string | null; active: boolean; }
export interface AuthorizationRequest { credential_id: string; binding_id: string; binding_revision: number; capability: Capability; categories: ClaimCategory[]; max_sensitivity: Sensitivity; purpose: string | null; }
export type AuthorizationDenyReason = "binding_not_found" | "binding_suspended" | "binding_revoked" | "stale_binding_revision" | "grant_not_found" | "grant_inactive" | "grant_expired" | "capability_not_granted" | "category_not_granted" | "sensitivity_exceeds_ceiling" | "purpose_not_authorized" | "credential_invalid" | "credential_expired" | "restricted_claim_not_approved";
export type AuthorizationDecision = { decision: "ALLOW"; binding_id: string; grant_id: string; grant_version: number; effective_categories: ClaimCategory[]; effective_sensitivity_ceiling: Sensitivity; binding_revision: number; policy_version: string; } | { decision: "DENY"; reason: AuthorizationDenyReason; };

export function isWithinCeiling(sensitivity: Sensitivity, ceiling: Sensitivity): boolean { return SENSITIVITY_ORDER[sensitivity] <= SENSITIVITY_ORDER[ceiling]; }
export function mostRestrictive(...levels: Sensitivity[]): Sensitivity { let highest: Sensitivity = "public"; for (const level of levels) { if (SENSITIVITY_ORDER[level] > SENSITIVITY_ORDER[highest]) highest = level; } return highest; }
export function classifySensitivity(appDeclared: Sensitivity, systemClassified: Sensitivity, category: ClaimCategory): Sensitivity { return mostRestrictive(appDeclared, systemClassified, CATEGORY_SENSITIVITY_FLOORS[category]); }

const POLICY_VERSION = "v0.1.0";
export function authorize(request: AuthorizationRequest, binding: Binding | null, grant: BindingGrant | null): AuthorizationDecision {
  if (!binding) return { decision: "DENY", reason: "binding_not_found" };
  if (binding.id !== request.binding_id) return { decision: "DENY", reason: "binding_not_found" };
  if (binding.status === "revoked") return { decision: "DENY", reason: "binding_revoked" };
  if (binding.status === "suspended") return { decision: "DENY", reason: "binding_suspended" };
  if (request.binding_revision < binding.revision) return { decision: "DENY", reason: "stale_binding_revision" };
  if (!grant) return { decision: "DENY", reason: "grant_not_found" };
  if (!grant.active) return { decision: "DENY", reason: "grant_inactive" };
  if (grant.binding_id !== binding.id) return { decision: "DENY", reason: "grant_not_found" };
  if (!grant.capabilities.includes(request.capability)) return { decision: "DENY", reason: "capability_not_granted" };
  const isRead = request.capability === "read_context" || request.capability === "read_claims" || request.capability === "read_versions" || request.capability === "read_evidence" || request.capability === "read_experiences";
  const policy = isRead ? grant.data_policy.read : grant.data_policy.write;
  const effectiveCategories: ClaimCategory[] = [];
  for (const cat of request.categories) { if (!policy.categories.includes(cat)) return { decision: "DENY", reason: "category_not_granted" }; effectiveCategories.push(cat); }
  if (!isWithinCeiling(request.max_sensitivity, policy.sensitivity_ceiling)) return { decision: "DENY", reason: "sensitivity_exceeds_ceiling" };
  if (request.purpose && grant.authorized_purposes.length > 0 && !grant.authorized_purposes.includes(request.purpose)) return { decision: "DENY", reason: "purpose_not_authorized" };
  return { decision: "ALLOW", binding_id: binding.id, grant_id: grant.id, grant_version: grant.version, effective_categories: effectiveCategories, effective_sensitivity_ceiling: policy.sensitivity_ceiling, binding_revision: binding.revision, policy_version: POLICY_VERSION };
}

export function filterClaimsBySensitivity<T extends { sensitivity: Sensitivity }>(claims: T[], ceiling: Sensitivity): T[] { return claims.filter((c) => SENSITIVITY_ORDER[c.sensitivity] <= SENSITIVITY_ORDER[ceiling]); }
export function filterClaimsByCategory<T extends { category: ClaimCategory }>(claims: T[], categories: ClaimCategory[]): T[] { const s = new Set(categories); return claims.filter((c) => s.has(c.category)); }
export function filterClaimsBySharingPolicy<T extends { sensitivity: Sensitivity; sharing_policy: { type: string; approved_binding_ids?: string[] } }>(claims: T[], bindingId: string, sensitivityCeiling: Sensitivity): T[] {
  const co = SENSITIVITY_ORDER[sensitivityCeiling];
  return claims.filter((c) => { if (SENSITIVITY_ORDER[c.sensitivity] > co) return false; if (c.sharing_policy.type === "user_only") return false; if (c.sharing_policy.type === "explicit_only") { return (c.sharing_policy as { approved_binding_ids: string[] }).approved_binding_ids.includes(bindingId); } return true; });
}

export interface ReconciliationResult { newState: ClaimState; observedState: ClaimState; reason: string; }
export function reconcile(input: { claim: Claim; activeEvidence: Evidence[] }): ReconciliationResult {
  const { claim, activeEvidence } = input;
  if (activeEvidence.length === 0) return { newState: claim.declared_state ?? "UNSUPPORTED", observedState: "UNSUPPORTED", reason: "no active evidence" };
  let bestTier: EvidenceTier = 5;
  for (const e of activeEvidence) { if (e.source_type < bestTier) bestTier = e.source_type; }
  const tuples = new Map<string, Set<string>>();
  for (const e of activeEvidence) { if (e.status !== "active") continue; const key = e.claim_id; if (!tuples.has(key)) tuples.set(key, new Set()); tuples.get(key)!.add(e.raw_observation); }
  let hasContradiction = false;
  for (const values of tuples.values()) { if (values.size > 1) { hasContradiction = true; break; } }
  if (hasContradiction) return { newState: claim.declared_state ?? "CONTESTED", observedState: "CONTESTED", reason: "conflicting evidence, no resolution" };
  if (bestTier <= 2) return { newState: "DECLARED", observedState: "DECLARED", reason: `user evidence (tier ${bestTier})` };
  const origins = new Set<string>();
  for (const e of activeEvidence) { if (e.status === "active") origins.add(e.lineage.origin_app_id); }
  if (origins.size >= 3) return { newState: claim.declared_state ?? "SUPPORTED", observedState: "SUPPORTED", reason: `multi-app consensus (${origins.size} independent lineages)` };
  if (activeEvidence.length > 1) return { newState: claim.declared_state ?? "OBSERVED", observedState: "OBSERVED", reason: `${activeEvidence.length} evidence records from dependent sources` };
  return { newState: claim.declared_state ?? "OBSERVED", observedState: "OBSERVED", reason: "single observation" };
}

const PROTOCOL_NAMESPACE_PREFIX = "protocol.";
export interface IngestionContext { passportId: string; binding: Binding; grant: BindingGrant; appId: string; now: string; }
export type IngestionResult = { status: "accepted"; observation: Observation; evidence: Evidence; claim: Claim; version: ClaimVersion } | { status: "merged"; observation: Observation; evidence: Evidence; claim: Claim } | { status: "rejected"; reason: string } | { status: "quarantined"; reason: string };
export interface IdGenerator { observationId(): string; evidenceId(): string; claimId(): string; claimVersionId(): string; }
export interface ClaimStore { getClaim(passportId: string, claimId: string): Promise<Claim | null>; getClaims(passportId: string, query: { categories?: ClaimCategory[]; sensitivity_ceiling?: Sensitivity; include_deleted?: boolean; states?: ClaimState[]; subject?: string; predicate?: string; limit?: number; offset?: number }): Promise<Claim[]>; createClaim(passportId: string, claim: Claim): Promise<void>; updateClaim(passportId: string, claim: Claim): Promise<void>; getClaimVersions(passportId: string, claimId: string): Promise<ClaimVersion[]>; createClaimVersion(passportId: string, version: ClaimVersion): Promise<void>; findMatchingClaim(passportId: string, subject: string, predicate: string, qualifiers: Record<string, string>): Promise<Claim | null>; countActiveClaimsByCategory(passportId: string, category: ClaimCategory): Promise<number>; countNewClaimsToday(passportId: string, category: ClaimCategory): Promise<number>; getLastObservationTime(passportId: string, subject: string, predicate: string, value: string): Promise<string | null>; }
export interface EvidenceStore { getEvidence(passportId: string, evidenceId: string): Promise<Evidence | null>; getEvidenceForClaim(passportId: string, claimId: string, status?: EvidenceStatus): Promise<Evidence[]>; createEvidence(passportId: string, evidence: Evidence): Promise<void>; updateEvidence(passportId: string, evidence: Evidence): Promise<void>; }
export interface ObservationStore { getObservation(passportId: string, observationId: string): Promise<Observation | null>; createObservation(passportId: string, observation: Observation): Promise<void>; updateObservation(passportId: string, observation: Observation): Promise<void>; findByIdempotencyKey(bindingId: string, idempotencyKey: string): Promise<Observation | null>; }
export interface UserMemoryEventStore { createEvent(passportId: string, event: UserMemoryEvent): Promise<void>; getEventsForClaim(passportId: string, claimId: string): Promise<UserMemoryEvent[]>; }

function mapExtractionToTier(method: string, firstParty: boolean): EvidenceTier { if (method === "user_stated") return 2; if (method === "app_measured") return firstParty ? 5 : 4; return 5; }

export async function ingest(observation: Omit<Observation, "id" | "outcome">, ctx: IngestionContext, stores: { observations: ObservationStore; claims: ClaimStore; evidence: EvidenceStore }, ids: IdGenerator, systemClassifiedSensitivity: Sensitivity): Promise<IngestionResult> {
  const existing = await stores.observations.findByIdempotencyKey(ctx.binding.id, observation.idempotency_key);
  if (existing) return { status: "rejected", reason: existing.outcome ? "duplicate observation (idempotency_key)" : "duplicate observation in flight" };
  if (observation.subject.startsWith(PROTOCOL_NAMESPACE_PREFIX) || observation.predicate.startsWith(PROTOCOL_NAMESPACE_PREFIX)) return { status: "rejected", reason: "cannot write to protocol namespace" };
  if (!ctx.grant.capabilities.includes("write_claims")) return { status: "rejected", reason: "missing write_claims capability" };
  const writePolicy = ctx.grant.data_policy.write;
  if (!writePolicy.categories.includes(observation.declared_category)) return { status: "rejected", reason: `category '${observation.declared_category}' not in write policy` };
  const activeCount = await stores.claims.countActiveClaimsByCategory(ctx.passportId, observation.declared_category);
  if (activeCount >= writePolicy.semantic_limits.max_active_claims_per_category) return { status: "rejected", reason: "active claim limit reached for category" };
  const todayCount = await stores.claims.countNewClaimsToday(ctx.passportId, observation.declared_category);
  if (todayCount >= writePolicy.semantic_limits.max_new_claims_per_category_per_day) return { status: "rejected", reason: "daily new claim limit reached for category" };
  const lastObsTime = await stores.claims.getLastObservationTime(ctx.passportId, observation.subject, observation.predicate, observation.value);
  if (lastObsTime) { const minIntervalMs = writePolicy.semantic_limits.min_interval_same_tuple_hours * 3600 * 1000; if (new Date(ctx.now).getTime() - new Date(lastObsTime).getTime() < minIntervalMs) return { status: "rejected", reason: "same-tuple interval not met" }; }
  if (!observation.raw_context || !observation.extraction_method) return { status: "rejected", reason: "evidence required: raw_context and extraction_method" };
  const finalSensitivity = classifySensitivity(observation.declared_sensitivity, systemClassifiedSensitivity, observation.declared_category);
  if (finalSensitivity === "restricted") { const obsId = ids.observationId(); const obs: Observation = { ...observation, id: obsId, outcome: { status: "quarantined", reason: "classified as restricted", requires_user_action: true } }; await stores.observations.createObservation(ctx.passportId, obs); return { status: "quarantined", reason: "classified as restricted — awaiting user release" }; }
  if (!isWithinCeiling(finalSensitivity, writePolicy.sensitivity_ceiling)) return { status: "rejected", reason: `post-classification sensitivity '${finalSensitivity}' exceeds ceiling '${writePolicy.sensitivity_ceiling}'` };
  const evidenceTier: EvidenceTier = mapExtractionToTier(observation.extraction_method, true);
  const matchingClaim = await stores.claims.findMatchingClaim(ctx.passportId, observation.subject, observation.predicate, observation.qualifiers);
  const obsId = ids.observationId(); const evidenceId = ids.evidenceId();
  const evidence: Evidence = { id: evidenceId, claim_id: matchingClaim?.id ?? "", observation_id: obsId, source_type: evidenceTier, app_id: ctx.appId, experience_id: observation.experience_id, observed_at: ctx.now, raw_observation: observation.raw_context, extraction_method: observation.extraction_method, first_party: true, lineage: { origin_app_id: ctx.appId, origin_experience_id: observation.experience_id ?? "", chain: [ctx.appId] }, status: "active", retracted_at: null, retraction_reason: null, provenance_status: "active" };
  if (matchingClaim) {
    evidence.claim_id = matchingClaim.id; await stores.evidence.createEvidence(ctx.passportId, evidence);
    const allEvidence = await stores.evidence.getEvidenceForClaim(ctx.passportId, matchingClaim.id, "active");
    const result = reconcile({ claim: matchingClaim, activeEvidence: allEvidence });
    const updatedClaim: Claim = { ...matchingClaim, state: result.newState, observed_state: result.observedState, value: observation.value, updated_at: ctx.now, evidence_ids: [...matchingClaim.evidence_ids, evidenceId] };
    await stores.claims.updateClaim(ctx.passportId, updatedClaim);
    const obs: Observation = { ...observation, id: obsId, outcome: { status: "merged", existing_claim_id: matchingClaim.id, evidence_id: evidenceId } };
    await stores.observations.createObservation(ctx.passportId, obs);
    return { status: "merged", observation: obs, evidence, claim: updatedClaim };
  }
  const claimId = ids.claimId(); const versionId = ids.claimVersionId(); evidence.claim_id = claimId;
  const newClaim: Claim = { id: claimId, passport_id: ctx.passportId, subject: observation.subject, predicate: observation.predicate, value: observation.value, qualifiers: observation.qualifiers, category: observation.declared_category, tags: [], state: "OBSERVED", declared_state: null, observed_state: "OBSERVED", volatility: "stable", created_at: ctx.now, updated_at: ctx.now, last_confirmed_at: null, expires_at: null, sensitivity: finalSensitivity, sharing_policy: { type: "grant_controlled" as const }, evidence_ids: [evidenceId], purged_references: [], contradicted_by: [], current_version_id: versionId, deleted: false, deleted_at: null };
  const version: ClaimVersion = { id: versionId, claim_id: claimId, version_number: 1, previous_version_id: null, value: observation.value, qualifiers: observation.qualifiers, state: "OBSERVED", changed_by: ctx.appId, changed_at: ctx.now, change_reason: "initial observation", evidence_ids: [evidenceId] };
  await stores.evidence.createEvidence(ctx.passportId, evidence); await stores.claims.createClaim(ctx.passportId, newClaim); await stores.claims.createClaimVersion(ctx.passportId, version);
  const obs: Observation = { ...observation, id: obsId, outcome: { status: "accepted", evidence_id: evidenceId, claim_id: claimId } };
  await stores.observations.createObservation(ctx.passportId, obs);
  return { status: "accepted", observation: obs, evidence, claim: newClaim, version };
}

export interface ContextItem { claim_id: string; category: ClaimCategory; sensitivity: Sensitivity; summary: string; confidence_band: "high" | "medium" | "low"; }
export interface ContextModel { items: ContextItem[]; passport_id: string; generated_at: string; policy_version: string; }
export type OutputValidationResult = { status: "VALID" } | { status: "INVALID"; violation: string };

function stateToConfidence(state: ClaimState): "high" | "medium" | "low" { switch (state) { case "DECLARED": case "SUPPORTED": return "high"; case "OBSERVED": return "medium"; default: return "low"; } }
function synthesize(authorizedClaims: Claim[]): ContextItem[] { return authorizedClaims.filter((c) => !c.deleted && c.state !== "EXPIRED").map((c) => ({ claim_id: c.id, category: c.category, sensitivity: c.sensitivity, summary: `${c.subject} ${c.predicate} ${c.value}`, confidence_band: stateToConfidence(c.state) })); }
function validateOutput(context: ContextModel, authorizedCategories: ClaimCategory[], sensitivityCeiling: Sensitivity): OutputValidationResult { const catSet = new Set(authorizedCategories); const co = SENSITIVITY_ORDER[sensitivityCeiling]; for (const item of context.items) { if (!catSet.has(item.category)) return { status: "INVALID", violation: `category '${item.category}' not authorized` }; if (SENSITIVITY_ORDER[item.sensitivity] > co) return { status: "INVALID", violation: `sensitivity '${item.sensitivity}' exceeds ceiling '${sensitivityCeiling}'` }; } return { status: "VALID" }; }

export async function executeReadPipeline(auth: Extract<AuthorizationDecision, { decision: "ALLOW" }>, passportId: string, claimStore: ClaimStore, policyVersion: string): Promise<{ context: ContextModel; validation: OutputValidationResult; claims_served_count: number }> {
  const allClaims = await claimStore.getClaims(passportId, { categories: auth.effective_categories, sensitivity_ceiling: auth.effective_sensitivity_ceiling, include_deleted: false });
  const byCat = filterClaimsByCategory(allClaims, auth.effective_categories);
  const bySens = filterClaimsBySensitivity(byCat, auth.effective_sensitivity_ceiling);
  const byPolicy = filterClaimsBySharingPolicy(bySens, auth.binding_id, auth.effective_sensitivity_ceiling);
  const items = synthesize(byPolicy);
  const now = new Date().toISOString();
  const context: ContextModel = { items, passport_id: passportId, generated_at: now, policy_version: policyVersion };
  const validation = validateOutput(context, auth.effective_categories, auth.effective_sensitivity_ceiling);
  return { context, validation, claims_served_count: byPolicy.length };
}

export interface TokenFamily { family_id: string; binding_id: string; current_generation: number; created_at: ISO8601; revoked_at: ISO8601 | null; }
export interface RefreshToken { token_hash: string; family_id: string; generation: number; issued_at: ISO8601; expires_at: ISO8601; }
export interface AccessToken { token_hash: string; family_id: string; binding_id: string; issued_at: ISO8601; expires_at: ISO8601; }
export type TokenRefreshResult = { status: "rotated"; access_token: AccessToken; refresh_token: RefreshToken; new_generation: number; } | { status: "reuse_detected"; family_id: string; presented_generation: number; current_generation: number; };
export interface TokenFamilyStore { getFamily(familyId: string): Promise<TokenFamily | null>; compareAndSwapGeneration(familyId: string, expectedGeneration: number, newGeneration: number): Promise<boolean>; revokeFamily(familyId: string, revokedAt: string): Promise<void>; }
export interface TokenIssuer { issueAccessToken(familyId: string, bindingId: string): AccessToken; issueRefreshToken(familyId: string, generation: number): RefreshToken; }

export async function refreshTokenFamily(store: TokenFamilyStore, issuer: TokenIssuer, familyId: string, presentedGeneration: number, now: string): Promise<TokenRefreshResult> {
  const family = await store.getFamily(familyId);
  if (!family) return { status: "reuse_detected", family_id: familyId, presented_generation: presentedGeneration, current_generation: -1 };
  if (family.revoked_at !== null) return { status: "reuse_detected", family_id: familyId, presented_generation: presentedGeneration, current_generation: family.current_generation };
  if (presentedGeneration !== family.current_generation) { await store.revokeFamily(familyId, now); return { status: "reuse_detected", family_id: familyId, presented_generation: presentedGeneration, current_generation: family.current_generation }; }
  const newGeneration = presentedGeneration + 1;
  const swapped = await store.compareAndSwapGeneration(familyId, presentedGeneration, newGeneration);
  if (!swapped) { await store.revokeFamily(familyId, now); return { status: "reuse_detected", family_id: familyId, presented_generation: presentedGeneration, current_generation: presentedGeneration }; }
  return { status: "rotated", access_token: issuer.issueAccessToken(familyId, family.binding_id), refresh_token: issuer.issueRefreshToken(familyId, newGeneration), new_generation: newGeneration };
}

export type ApiErrorCode = "VALIDATION_ERROR" | "IDEMPOTENCY_CONFLICT" | "TOKEN_EXPIRED" | "TOKEN_INVALID" | "TOKEN_REUSE_DETECTED" | "BINDING_SUSPENDED" | "BINDING_REVOKED" | "CAPABILITY_NOT_GRANTED" | "CATEGORY_NOT_GRANTED" | "SENSITIVITY_EXCEEDS_CEILING" | "PURPOSE_NOT_AUTHORIZED" | "STALE_BINDING_REVISION" | "GRANT_EXPIRED" | "NOT_FOUND" | "DUPLICATE_OBSERVATION" | "PROTOCOL_NAMESPACE" | "QUARANTINED" | "SEMANTIC_LIMIT" | "RATE_LIMITED" | "METHOD_NOT_ALLOWED" | "INTERNAL_ERROR";
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: ApiErrorCode, message: string, public readonly requestId?: string) { super(message); this.name = "ApiError"; }
  toJSON() { return { error: { code: this.code, message: this.message, request_id: this.requestId ?? null } }; }
}
export function mapKernelDenyToApiError(reason: string, requestId: string): ApiError {
  switch (reason) {
    case "binding_not_found": return new ApiError(404, "NOT_FOUND", "Binding not found", requestId);
    case "binding_revoked": return new ApiError(403, "BINDING_REVOKED", "Binding has been revoked", requestId);
    case "binding_suspended": return new ApiError(403, "BINDING_SUSPENDED", "Binding is suspended", requestId);
    case "stale_binding_revision": return new ApiError(403, "STALE_BINDING_REVISION", "Binding revision is stale", requestId);
    case "grant_not_found": return new ApiError(404, "NOT_FOUND", "Grant not found", requestId);
    case "grant_inactive": case "grant_expired": return new ApiError(403, "GRANT_EXPIRED", "Grant requires reauthorization", requestId);
    case "capability_not_granted": return new ApiError(403, "CAPABILITY_NOT_GRANTED", "Missing required capability", requestId);
    case "category_not_granted": return new ApiError(403, "CATEGORY_NOT_GRANTED", "Category outside grant", requestId);
    case "sensitivity_exceeds_ceiling": return new ApiError(403, "SENSITIVITY_EXCEEDS_CEILING", "Sensitivity above binding ceiling", requestId);
    case "purpose_not_authorized": return new ApiError(403, "PURPOSE_NOT_AUTHORIZED", "Purpose template violation", requestId);
    case "credential_invalid": return new ApiError(401, "TOKEN_INVALID", "Invalid credentials", requestId);
    case "credential_expired": return new ApiError(401, "TOKEN_EXPIRED", "Credentials expired", requestId);
    default: return new ApiError(403, "CAPABILITY_NOT_GRANTED", "Authorization denied", requestId);
  }
}
export function mapIngestionReasonToApiError(reason: string, requestId: string): ApiError {
  if (reason.includes("idempotency_key") || reason.includes("duplicate")) return new ApiError(409, "DUPLICATE_OBSERVATION", reason, requestId);
  if (reason.includes("protocol namespace")) return new ApiError(422, "PROTOCOL_NAMESPACE", reason, requestId);
  if (reason.includes("capability")) return new ApiError(403, "CAPABILITY_NOT_GRANTED", reason, requestId);
  if (reason.includes("category")) return new ApiError(403, "CATEGORY_NOT_GRANTED", reason, requestId);
  if (reason.includes("sensitivity") && reason.includes("ceiling")) return new ApiError(403, "SENSITIVITY_EXCEEDS_CEILING", reason, requestId);
  if (reason.includes("limit") || reason.includes("interval")) return new ApiError(422, "SEMANTIC_LIMIT", reason, requestId);
  if (reason.includes("evidence required")) return new ApiError(400, "VALIDATION_ERROR", reason, requestId);
  return new ApiError(422, "VALIDATION_ERROR", reason, requestId);
}

export interface AppAuthContext { type: "app"; passportId: string; bindingId: string; grantId: string; bindingRevision: number; binding: Binding; grant: BindingGrant; }
export interface UserAuthContext { type: "user"; passportId: string; accountId: string; }
export interface ApiBindingStore { getBinding(id: string): Promise<Binding | null>; getBindingByPassportAndApp(pid: string, appId: string): Promise<Binding | null>; createBinding(b: Binding): Promise<void>; updateBinding(b: Binding): Promise<void>; }
export interface ApiGrantStore { getGrant(id: string): Promise<BindingGrant | null>; getActiveGrantForBinding(bindingId: string): Promise<BindingGrant | null>; createGrant(g: BindingGrant): Promise<void>; updateGrant(g: BindingGrant): Promise<void>; }
export interface Stores { claims: ClaimStore; evidence: EvidenceStore; observations: ObservationStore; events: UserMemoryEventStore; bindings: ApiBindingStore; grants: ApiGrantStore; tokenFamilies: TokenFamilyStore; }
export interface AppContext { stores: Stores; tokenIssuer: TokenIssuer; generateId: (prefix: string) => string; now: () => string; }
export interface TokenClaims { binding_id: string; family_id: string; passport_id: string; generation: number; issued_at: string; expires_at: string; }
export interface TokenValidator { validateAppToken(token: string): TokenClaims | null; validateUserToken(token: string): { passport_id: string; account_id: string } | null; }
export interface RefreshTokenDecoder { decode(token: string): { family_id: string; generation: number } | null; }
