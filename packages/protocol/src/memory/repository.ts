import type {
  Claim,
  ClaimCategory,
  ClaimState,
  ClaimVersion,
  Evidence,
  EvidenceStatus,
  Observation,
  Sensitivity,
  UserMemoryEvent,
} from "./types.js";

export interface ClaimQuery {
  categories?: ClaimCategory[];
  sensitivity_ceiling?: Sensitivity;
  states?: ClaimState[];
  subject?: string;
  predicate?: string;
  include_deleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface ClaimStore {
  getClaim(passportId: string, claimId: string): Promise<Claim | null>;
  getClaims(passportId: string, query: ClaimQuery): Promise<Claim[]>;
  createClaim(passportId: string, claim: Claim): Promise<void>;
  updateClaim(passportId: string, claim: Claim): Promise<void>;

  getClaimVersions(
    passportId: string,
    claimId: string
  ): Promise<ClaimVersion[]>;
  createClaimVersion(
    passportId: string,
    version: ClaimVersion
  ): Promise<void>;

  findMatchingClaim(
    passportId: string,
    subject: string,
    predicate: string,
    qualifiers: Record<string, string>
  ): Promise<Claim | null>;

  countActiveClaimsByCategory(
    passportId: string,
    category: ClaimCategory
  ): Promise<number>;

  countNewClaimsToday(
    passportId: string,
    category: ClaimCategory
  ): Promise<number>;

  getLastObservationTime(
    passportId: string,
    subject: string,
    predicate: string,
    value: string
  ): Promise<string | null>;
}

export interface EvidenceStore {
  getEvidence(passportId: string, evidenceId: string): Promise<Evidence | null>;
  getEvidenceForClaim(
    passportId: string,
    claimId: string,
    status?: EvidenceStatus
  ): Promise<Evidence[]>;
  createEvidence(passportId: string, evidence: Evidence): Promise<void>;
  updateEvidence(passportId: string, evidence: Evidence): Promise<void>;
}

export interface ObservationStore {
  getObservation(
    passportId: string,
    observationId: string
  ): Promise<Observation | null>;
  createObservation(
    passportId: string,
    observation: Observation
  ): Promise<void>;
  updateObservation(
    passportId: string,
    observation: Observation
  ): Promise<void>;
  findByIdempotencyKey(
    bindingId: string,
    idempotencyKey: string
  ): Promise<Observation | null>;
}

export interface UserMemoryEventStore {
  createEvent(passportId: string, event: UserMemoryEvent): Promise<void>;
  getEventsForClaim(
    passportId: string,
    claimId: string
  ): Promise<UserMemoryEvent[]>;
}
