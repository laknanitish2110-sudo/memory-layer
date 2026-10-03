# Protocol Kernel Conformance Matrix

**Version:** M2.0 — Protocol Kernel v0.1 + Persistence Layer + Live DB Conformance + API Contract  
**Tests:** 183/183 unit + 35 live DB attack vectors + 81 API attack vectors (contract defined)  
**Status:** All invariants verified through M1.5. M2 API contract and threat model locked. See `packages/api/M2_CONFORMANCE.md` for API layer matrix.

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

## M1 — Database Enforcement

| Invariant | DB Enforcement | Migration | Test File | Status |
|-----------|---------------|-----------|-----------|--------|
| Passport isolation | RLS on all memory tables | `006_rls.sql` | `sql-invariants.test.ts` | M1 |
| Idempotency | `UNIQUE(binding_id, idempotency_key)` | `003_memory.sql` | `sql-invariants.test.ts` | M1 |
| Evidence immutability | `enforce_evidence_immutability()` trigger | `003_memory.sql` | `sql-invariants.test.ts` | M1 |
| ClaimVersion append-only | `prevent_version_mutation()` trigger | `003_memory.sql` | `sql-invariants.test.ts` | M1 |
| Binding revision atomicity | `check_binding_revision()` FOR UPDATE | `002_bindings.sql` | `sql-invariants.test.ts` | M1 |
| Token family CAS | `token_family_cas()` FOR UPDATE | `004_credentials.sql` | `token-store.test.ts` | M1 |
| Grant versioning | `prevent_grant_update()` trigger | `002_bindings.sql` | `sql-invariants.test.ts` | M1 |
| Cross-passport query prevention | RLS + passport-scoped adapter | `006_rls.sql` | `claim-store.test.ts` | M1 |
| Protocol namespace | `enforce_protocol_namespace()` trigger | `003_memory.sql` | `sql-invariants.test.ts` | M1 |

## M1 — Supabase Adapter

| Store | Implementation | Test File | Tests | Status |
|-------|---------------|-----------|-------|--------|
| ClaimStore | `claim-store.ts` | `claim-store.test.ts` | 12 | M1 |
| EvidenceStore | `evidence-store.ts` | `evidence-store.test.ts` | 6 | M1 |
| ObservationStore | `observation-store.ts` | `observation-store.test.ts` | 7 | M1 |
| BindingStore | `binding-store.ts` | `binding-store.test.ts` | 7 | M1 |
| GrantStore | `binding-store.ts` | `binding-store.test.ts` | 5 | M1 |
| TokenFamilyStore | `token-store.ts` | `token-store.test.ts` | 6 | M1 |
| AccessEventStore | `access-event-store.ts` | — | — | M1 |

## M1.5 — Live Postgres Conformance (35 attack vectors)

| Attack | Vectors | Target | Result | Migration |
|--------|---------|--------|--------|-----------|
| Passport isolation | 6 | RLS cross-passport read/write/update/delete | ALL PASS | `006_rls.sql`, `007_force_rls.sql` |
| Claim version immutability | 2 | UPDATE/DELETE on claim_versions | ALL PASS | `003_memory.sql` |
| Evidence immutability | 5 | Modify value columns, retraction, un-retraction | ALL PASS | `003_memory.sql` |
| Protocol namespace | 3 | `protocol.*` subject/predicate on observations + claims | ALL PASS | `003_memory.sql` |
| Observation idempotency | 2 | Duplicate (binding_id, idempotency_key), cross-binding reuse | ALL PASS | `003_memory.sql` |
| Token family CAS | 3 | Correct gen, stale gen (→ revoke), revoked family | ALL PASS | `004_credentials.sql` |
| Binding revision | 3 | Current/stale revision, FOR UPDATE verification | ALL PASS | `002_bindings.sql` |
| RLS execution contexts | 7 | anon, authenticated, service_role, postgres (scoped/unscoped) | ALL PASS | `007_force_rls.sql` |
| SECURITY DEFINER audit | 0 vulns | All 9 functions are SECURITY INVOKER | CLEAN | — |
| Defense-in-depth | 4 | Grant immutability, event immutability, CHECK constraints | ALL PASS | `002_bindings.sql`, `003_memory.sql` |

## M1.5 — Hardening

| Action | Migration | Status |
|--------|-----------|--------|
| FORCE ROW LEVEL SECURITY on all 8 memory tables | `007_force_rls.sql` | M1.5 |
| REVOKE ALL on memory + credential tables from `anon` | `007_force_rls.sql` | M1.5 |

## M2 — API Layer (Contract Defined)

| Attack Vector | Tests | Target | Status |
|---------------|-------|--------|--------|
| Authentication ≠ Authorization | 9 | Auth middleware + kernel authorize() | M2 |
| Never trust request IDs | 7 | Controller → kernel passport scoping | M2 |
| IDOR on every entity type | 8 | Passport-scoped repository lookups | M2 |
| Mass assignment | 9 | Request validation + server-determined fields | M2 |
| Capability confusion | 8 | Explicit capability → endpoint mapping | M2 |
| Filter-before-synthesis | 8 | Read pipeline + output validation | M2 |
| Error leakage | 8 | Error response sanitization | M2 |
| Rate limits | 8 | Multi-dimensional rate limiting | M2 |
| API replay | 8 | Idempotency + token rotation + revision | M2 |
| No kernel bypass | 8 | Static analysis + integration tests | M2 |

See `packages/api/API_CONTRACT.md` for endpoint specifications.  
See `packages/api/THREAT_MODEL.md` for attack vector details.  
See `packages/api/M2_CONFORMANCE.md` for full M2 matrix.

---

*When someone "simplifies" an authorization function, this matrix tells you which invariant they just endangered.*
