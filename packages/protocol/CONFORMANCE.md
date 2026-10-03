# Protocol Kernel Conformance Matrix

**Version:** M0 — Protocol Kernel v0.1  
**Tests:** 109/109  
**Status:** All invariants enforced in domain logic. Persistence enforcement pending (M1).

This matrix maps every locked protocol invariant to its implementation and test. If you change any function listed here, you must verify its tests still pass. If you add a new security-relevant dimension, it must appear in this matrix before merging.

## Protocol Invariants

| # | Invariant | Implementation | Test File | Key Tests | Status |
|---|-----------|---------------|-----------|-----------|--------|
| 1 | Apps never own passports | Repository contract requires `passport_id` on all queries | `authorization.test.ts` | passport isolation, binding checks | M0 |
| 2 | Apps never write protocol state | `write-pipeline.ts` — namespace check rejects `protocol.*` | `write-pipeline.test.ts`, `attacks.test.ts` | protocol namespace rejection | M0 |
| 3 | Apps submit observations, not truth | `write-pipeline.ts` — Observation → Evidence → Claim pipeline | `write-pipeline.test.ts` | evidence tier enforcement (apps get tier 4-5) | M0 |
| 4 | Evidence is immutable | `EvidenceStatus` = active \| retracted (no delete) | `reconciliation.test.ts` | retraction → reconciliation | M0 |
| 5 | Claims are user-owned | `UserMemoryAction` types (CONFIRM/CORRECT/OVERRIDE/DELETE/DISPUTE/RECLASSIFY) | — | Types enforce action vocabulary | M0 |
| 6 | Authorization before synthesis | `read-pipeline.ts` — synthesizer receives pre-filtered array only | `context.test.ts` | synthesize() is pure function on filtered input | M0 |
| 7 | Unauthorized claims never enter ContextModel | `context-model.ts` — `validateOutput()` binary check | `context.test.ts`, `attacks.test.ts` | INVALID on unauthorized category/sensitivity | M0 |
| 8 | Context rendering cannot expand authorization | `validateOutput()` returns VALID/INVALID, never rewrites | `context.test.ts`, `attacks.test.ts` | output guard never strips | M0 |
| 9 | Grant expansion requires consent | `expansion.ts` — `isExpansion()` checks all dimensions | `expansion.test.ts` | capability, category, sensitivity, purpose, expiration | M0 |
| 10 | Revocation invalidates stale binding revisions | `engine.ts` — revision comparison atomic with authorization | `authorization.test.ts`, `attacks.test.ts` | stale revision DENY | M0 |
| 11 | Cross-passport access requires explicit bridge | Repository contract — no cross-passport query path | `attacks.test.ts` | passport isolation | M0 |
| 12 | Every query is passport-scoped | `ClaimStore` interface requires `passportId` parameter | `repository.ts` (structural) | No `getAllClaims()` exists | M0 |
| 13 | Purge respects retention classes | `audit-log.ts` — `redactAccessEvent()` | — | Redaction preserves shell | M0 |
| 14 | Provenance survives purge | `PurgedProvenanceRecord` on Claim type | `reconciliation.test.ts` | retraction → re-reconciliation | M0 |

## Security Mechanisms

| Mechanism | Implementation | Test File | Key Tests | Status |
|-----------|---------------|-----------|-----------|--------|
| Observation idempotency | `write-pipeline.ts` — `UNIQUE(binding_id, idempotency_key)` | `write-pipeline.test.ts`, `attacks.test.ts` | duplicate rejection | M0 |
| Token reuse detection | `token-family.ts` — CAS `compareAndSwapGeneration()` | `credentials.test.ts` | reuse → family revocation | M0 |
| Sensitivity classification | `sensitivity.ts` — 3-input most-restrictive-wins | `sensitivity.test.ts`, `write-pipeline.test.ts` | category floor, quarantine on restricted | M0 |
| Semantic write limits | `write-pipeline.ts` — claims/category/day, tuple interval, active cap | `write-pipeline.test.ts` | active claim limit, daily limit | M0 |
| Purpose template enforcement | `purpose.ts` — `isGrantWithinPurpose()` deterministic ceiling | `attacks.test.ts` | purpose ceiling rejection | M0 |
| Sharing policy enforcement | `engine.ts` — `filterClaimsBySharingPolicy()` | `authorization.test.ts` | user_only excluded, explicit_only requires binding | M0 |
| Self-referential evidence | `write-pipeline.ts` — `first_party` flag, tier cap | `write-pipeline.test.ts` | first_party always true for submitting app | M0 |

## Pending (M1 — Persistence)

| Invariant | Required DB Enforcement | Status |
|-----------|------------------------|--------|
| Passport isolation | RLS policy on all memory tables | Pending |
| Idempotency | `UNIQUE(binding_id, idempotency_key)` constraint | Pending |
| Evidence immutability | No UPDATE on evidence value columns | Pending |
| ClaimVersion append-only | No UPDATE/DELETE on claim_versions | Pending |
| Binding revision atomicity | Atomic compare-and-increment in transaction | Pending |
| Token family CAS | Atomic compare-and-swap at DB level | Pending |
| Grant versioning | Append-only grants, no in-place mutation | Pending |
| Cross-passport query prevention | RLS + no cross-passport joins | Pending |
| Concurrent refresh token safety | Serializable isolation on token family | Pending |

---

*When someone "simplifies" an authorization function, this matrix tells you which invariant they just endangered.*
