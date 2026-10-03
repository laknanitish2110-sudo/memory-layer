import type {
  Claim,
  ClaimCategory,
  ClaimVersion,
  Evidence,
  EvidenceTier,
  Observation,
  ObservationOutcome,
  Sensitivity,
} from "../memory/types.js";
import type { Binding, BindingGrant, WritePolicy } from "../authorization/types.js";
import { classifySensitivity } from "../authorization/sensitivity.js";
import { isWithinCeiling } from "../authorization/sensitivity.js";
import { reconcile } from "./state-machine.js";
import type {
  ClaimStore,
  EvidenceStore,
  ObservationStore,
} from "../memory/repository.js";

const PROTOCOL_NAMESPACE_PREFIX = "protocol.";

export interface IngestionContext {
  passportId: string;
  binding: Binding;
  grant: BindingGrant;
  appId: string;
  now: string;
}

export type IngestionResult =
  | { status: "accepted"; observation: Observation; evidence: Evidence; claim: Claim; version: ClaimVersion }
  | { status: "merged"; observation: Observation; evidence: Evidence; claim: Claim }
  | { status: "rejected"; reason: string }
  | { status: "quarantined"; reason: string };

export interface IdGenerator {
  observationId(): string;
  evidenceId(): string;
  claimId(): string;
  claimVersionId(): string;
}

export async function ingest(
  observation: Omit<Observation, "id" | "outcome">,
  ctx: IngestionContext,
  stores: {
    observations: ObservationStore;
    claims: ClaimStore;
    evidence: EvidenceStore;
  },
  ids: IdGenerator,
  systemClassifiedSensitivity: Sensitivity
): Promise<IngestionResult> {
  // 1. Idempotency
  const existing = await stores.observations.findByIdempotencyKey(
    ctx.binding.id,
    observation.idempotency_key
  );
  if (existing) {
    if (existing.outcome) {
      return { status: "rejected", reason: "duplicate observation (idempotency_key)" };
    }
    return { status: "rejected", reason: "duplicate observation in flight" };
  }

  // 2. Protocol namespace
  if (
    observation.subject.startsWith(PROTOCOL_NAMESPACE_PREFIX) ||
    observation.predicate.startsWith(PROTOCOL_NAMESPACE_PREFIX)
  ) {
    return { status: "rejected", reason: "cannot write to protocol namespace" };
  }

  // 3. Capability check
  if (!ctx.grant.capabilities.includes("write_claims")) {
    return { status: "rejected", reason: "missing write_claims capability" };
  }

  // 4. Category check
  const writePolicy = ctx.grant.data_policy.write;
  if (!writePolicy.categories.includes(observation.declared_category)) {
    return { status: "rejected", reason: `category '${observation.declared_category}' not in write policy` };
  }

  // 5. Rate limit (deferred to caller — stores check)
  // 6. Semantic budget
  const activeCount = await stores.claims.countActiveClaimsByCategory(
    ctx.passportId,
    observation.declared_category
  );
  if (activeCount >= writePolicy.semantic_limits.max_active_claims_per_category) {
    return { status: "rejected", reason: "active claim limit reached for category" };
  }

  const todayCount = await stores.claims.countNewClaimsToday(
    ctx.passportId,
    observation.declared_category
  );
  if (todayCount >= writePolicy.semantic_limits.max_new_claims_per_category_per_day) {
    return { status: "rejected", reason: "daily new claim limit reached for category" };
  }

  const lastObsTime = await stores.claims.getLastObservationTime(
    ctx.passportId,
    observation.subject,
    observation.predicate,
    observation.value
  );
  if (lastObsTime) {
    const minIntervalMs =
      writePolicy.semantic_limits.min_interval_same_tuple_hours * 3600 * 1000;
    const elapsed =
      new Date(ctx.now).getTime() - new Date(lastObsTime).getTime();
    if (elapsed < minIntervalMs) {
      return { status: "rejected", reason: "same-tuple interval not met" };
    }
  }

  // 7. Evidence validation
  if (!observation.raw_context || !observation.extraction_method) {
    return { status: "rejected", reason: "evidence required: raw_context and extraction_method" };
  }

  // 8. Sensitivity classification (3-input, most-restrictive-wins)
  const finalSensitivity = classifySensitivity(
    observation.declared_sensitivity,
    systemClassifiedSensitivity,
    observation.declared_category
  );

  // 9. Quarantine if restricted
  if (finalSensitivity === "restricted") {
    const obsId = ids.observationId();
    const obs: Observation = {
      ...observation,
      id: obsId,
      outcome: { status: "quarantined", reason: "classified as restricted", requires_user_action: true },
    };
    await stores.observations.createObservation(ctx.passportId, obs);
    return { status: "quarantined", reason: "classified as restricted — awaiting user release" };
  }

  // 10. Ceiling check
  if (!isWithinCeiling(finalSensitivity, writePolicy.sensitivity_ceiling)) {
    return {
      status: "rejected",
      reason: `post-classification sensitivity '${finalSensitivity}' exceeds ceiling '${writePolicy.sensitivity_ceiling}'`,
    };
  }

  // 11. Self-referential check
  const isFirstParty = true; // structurally known: the submitting app
  const evidenceTier: EvidenceTier = mapExtractionToTier(
    observation.extraction_method,
    isFirstParty
  );

  // 12. Dedup / merge check
  const matchingClaim = await stores.claims.findMatchingClaim(
    ctx.passportId,
    observation.subject,
    observation.predicate,
    observation.qualifiers
  );

  const obsId = ids.observationId();
  const evidenceId = ids.evidenceId();

  const evidence: Evidence = {
    id: evidenceId,
    claim_id: matchingClaim?.id ?? "", // filled below
    observation_id: obsId,
    source_type: evidenceTier,
    app_id: ctx.appId,
    experience_id: observation.experience_id,
    observed_at: ctx.now,
    raw_observation: observation.raw_context,
    extraction_method: observation.extraction_method,
    first_party: isFirstParty,
    lineage: {
      origin_app_id: ctx.appId,
      origin_experience_id: observation.experience_id ?? "",
      chain: [ctx.appId],
    },
    status: "active",
    retracted_at: null,
    retraction_reason: null,
    provenance_status: "active",
  };

  if (matchingClaim) {
    evidence.claim_id = matchingClaim.id;
    await stores.evidence.createEvidence(ctx.passportId, evidence);

    const allEvidence = await stores.evidence.getEvidenceForClaim(
      ctx.passportId,
      matchingClaim.id,
      "active"
    );

    const result = reconcile({ claim: matchingClaim, activeEvidence: allEvidence });
    const updatedClaim: Claim = {
      ...matchingClaim,
      state: result.newState,
      observed_state: result.observedState,
      value: observation.value,
      updated_at: ctx.now,
      evidence_ids: [...matchingClaim.evidence_ids, evidenceId],
    };
    await stores.claims.updateClaim(ctx.passportId, updatedClaim);

    const obs: Observation = {
      ...observation,
      id: obsId,
      outcome: { status: "merged", existing_claim_id: matchingClaim.id, evidence_id: evidenceId },
    };
    await stores.observations.createObservation(ctx.passportId, obs);

    return { status: "merged", observation: obs, evidence, claim: updatedClaim };
  }

  // New claim
  const claimId = ids.claimId();
  const versionId = ids.claimVersionId();
  evidence.claim_id = claimId;

  const newClaim: Claim = {
    id: claimId,
    passport_id: ctx.passportId,
    subject: observation.subject,
    predicate: observation.predicate,
    value: observation.value,
    qualifiers: observation.qualifiers,
    category: observation.declared_category,
    tags: [],
    state: "OBSERVED",
    declared_state: null,
    observed_state: "OBSERVED",
    volatility: "stable",
    created_at: ctx.now,
    updated_at: ctx.now,
    last_confirmed_at: null,
    expires_at: null,
    sensitivity: finalSensitivity,
    sharing_policy: { type: "grant_controlled" as const },
    evidence_ids: [evidenceId],
    purged_references: [],
    contradicted_by: [],
    current_version_id: versionId,
    deleted: false,
    deleted_at: null,
  };

  const version: ClaimVersion = {
    id: versionId,
    claim_id: claimId,
    version_number: 1,
    previous_version_id: null,
    value: observation.value,
    qualifiers: observation.qualifiers,
    state: "OBSERVED",
    changed_by: ctx.appId,
    changed_at: ctx.now,
    change_reason: "initial observation",
    evidence_ids: [evidenceId],
  };

  await stores.evidence.createEvidence(ctx.passportId, evidence);
  await stores.claims.createClaim(ctx.passportId, newClaim);
  await stores.claims.createClaimVersion(ctx.passportId, version);

  const obs: Observation = {
    ...observation,
    id: obsId,
    outcome: { status: "accepted", evidence_id: evidenceId, claim_id: claimId },
  };
  await stores.observations.createObservation(ctx.passportId, obs);

  return { status: "accepted", observation: obs, evidence, claim: newClaim, version };
}

function mapExtractionToTier(
  method: string,
  firstParty: boolean
): EvidenceTier {
  if (method === "user_stated") return 2;
  if (method === "app_measured") return firstParty ? 5 : 4;
  return 5;
}
