# M2 Threat Model — API Layer Attack Vectors

**Status:** LOCKED — Defines the adversarial test surface for M2.  
**Architecture:** HTTP → Authentication → Request Validation → Protocol Kernel → Repository → Postgres  
**Precondition:** M0 kernel (109 tests) + M1 persistence (74 tests) + M1.5 live Postgres (35 attack vectors) — all verified.  
**M2 asks:** Can an attacker reach around the kernel's rules through the network boundary?

---

## Attack Vector #1: Authentication ≠ Authorization

**Threat:** A valid JWT does not mean access is allowed. The API layer must enforce that authentication (valid token) is necessary but not sufficient — authorization (binding active, grant valid, capability granted, category in scope, sensitivity within ceiling, purpose authorized, revision current) is a separate check.

### Test Cases

| ID | Test | Expected |
|----|------|----------|
| 1a | Valid token, binding status = `suspended` | 403 `BINDING_SUSPENDED` |
| 1b | Valid token, binding status = `revoked` | 403 `BINDING_REVOKED` |
| 1c | Valid token, grant `active = false` | 403 `GRANT_EXPIRED` |
| 1d | Valid token, grant expired (periodic expiration) | 403 `GRANT_EXPIRED` |
| 1e | Valid token, stale binding revision (revocation happened after token issued) | 403 `STALE_BINDING_REVISION` |
| 1f | Valid token, capability not in grant (e.g., `write_claims` not granted, POST to `/observations`) | 403 `CAPABILITY_NOT_GRANTED` |
| 1g | Valid token, category not in grant's read policy (e.g., `emotional_patterns` not granted) | 404 (not 403 — no metadata leakage) |
| 1h | Valid token, sensitivity above grant ceiling (e.g., `sensitive` claim with `personal` ceiling) | 404 (filtered out, never visible) |
| 1i | Valid token, purpose not in authorized purposes | 403 `PURPOSE_NOT_AUTHORIZED` |

**Invariant tested:** The kernel `authorize()` function is called on every request. No endpoint bypasses it.

---

## Attack Vector #2: Never Trust IDs from the Request

**Threat:** An attacker sends another passport's ID in the request body, attempting to read or write their data.

### Test Cases

| ID | Test | Expected |
|----|------|----------|
| 2a | POST `/observations` with `binding_id` in body set to another user's binding | Server ignores body `binding_id`, uses authenticated binding |
| 2b | POST `/observations` with `passport_id` in body | Server ignores, derives from authenticated binding |
| 2c | GET `/claims/:id` where `:id` belongs to another passport | 404 (passport-scoped lookup returns null) |
| 2d | POST `/claims/:id/confirm` where `:id` belongs to another passport | 404 |
| 2e | POST `/bindings/:id/revoke` where `:id` belongs to another passport | 404 |
| 2f | POST `/grants/:id/consent` where grant belongs to another passport's binding | 404 |
| 2g | POST `/observations/:id/retract` where observation belongs to another binding | 404 |

**Invariant tested:** Every entity lookup uses the authenticated passport/binding, never user-supplied ownership. `getClaim(authenticatedPassportId, claimId)`, not `getClaim(claimId)`.

---

## Attack Vector #3: IDOR on Every Entity ID Type

**Threat:** Insecure Direct Object Reference — attacker enumerates or guesses entity IDs to access other users' resources.

### Test Cases

| ID | Entity | Test | Expected |
|----|--------|------|----------|
| 3a | Claim | GET `/claims/<other-user-claim-id>` | 404 |
| 3b | Observation | POST `/observations/<other-binding-obs-id>/retract` | 404 |
| 3c | Binding | POST `/bindings/<other-user-binding-id>/revoke` | 404 |
| 3d | Grant | POST `/grants/<other-user-grant-id>/consent` | 404 |
| 3e | Grant | POST `/grants/<other-user-grant-id>/revoke` | 404 |
| 3f | Binding | POST `/bindings/<other-user-binding-id>/grants` | 404 |
| 3g | Evidence | (future) GET evidence belonging to another passport's claim | 404 |
| 3h | ClaimVersion | (future) GET versions of another passport's claim | 404 |

**Key:** All IDOR returns are `404`, never `403`. The attacker learns nothing about whether the entity exists for another user.

**Invariant tested:** Protocol Invariant #12 — every permissioned query is passport-scoped.

---

## Attack Vector #4: Mass Assignment

**Threat:** Attacker sends server-determined fields in the request body, hoping the API will use them instead of computing them.

### Test Cases

| ID | Endpoint | Injected Field | Expected |
|----|----------|---------------|----------|
| 4a | POST `/observations` | `"id": "attacker_id"` | Server ignores, generates own ID |
| 4b | POST `/observations` | `"binding_id": "other_binding"` | Server ignores, uses authenticated binding |
| 4c | POST `/observations` | `"outcome": {"status": "accepted"}` | Server ignores, pipeline determines outcome |
| 4d | POST `/observations` | `"submitted_at": "2020-01-01T..."` | Server ignores, uses server clock |
| 4e | POST `/bindings` | `"status": "active", "revision": 999` | Server ignores, sets initial status/revision |
| 4f | POST `/bindings` | `"id": "attacker_binding_id"` | Server ignores, generates own ID |
| 4g | POST `/observations` | `"first_party": false` | Server ignores, structurally determines first_party |
| 4h | POST `/observations` | extra field `"evidence_tier": 1` | Server ignores, tier determined by extraction_method |
| 4i | POST `/observations` | `"sensitivity": "public"` (trying to bypass classification) | Server classifies using three-input most-restrictive-wins |

**Invariant tested:** Server-determined fields (see API_CONTRACT.md) are never accepted from client input.

---

## Attack Vector #5: Capability Confusion

**Threat:** An attacker uses a valid credential to access an endpoint their grant doesn't cover, or uses a capability for something it wasn't designed for.

### Test Cases

| ID | Test | Expected |
|----|------|----------|
| 5a | App with `read_context` only attempts GET `/claims/:id` | 403 `CAPABILITY_NOT_GRANTED` |
| 5b | App with `read_claims` only attempts POST `/observations` | 403 `CAPABILITY_NOT_GRANTED` |
| 5c | App with `write_claims` but without `retract_own_observation` attempts retraction | 403 `CAPABILITY_NOT_GRANTED` |
| 5d | App without `request_elevation` attempts POST `/bindings/:id/grants` | 403 `CAPABILITY_NOT_GRANTED` |
| 5e | App with `read_claims` for `skills` attempts to read a `personal_context` claim | 404 (category filter) |
| 5f | App with `write_claims` for `skills` attempts to write `emotional_patterns` observation | 403 `CATEGORY_NOT_GRANTED` |
| 5g | App with sensitivity ceiling `personal` submits observation that classifies as `sensitive` | 403 `SENSITIVITY_EXCEEDS_CEILING` |
| 5h | App attempts to exceed purpose template ceiling (e.g., `coding_assistance` app requests `emotional_patterns`) | 403 `PURPOSE_NOT_AUTHORIZED` |

**Invariant tested:** Capability mapping is explicit. No implicit capability inheritance.

---

## Attack Vector #6: Context Endpoint — Filter Before Synthesis

**Threat:** The context synthesizer sees unauthorized claims, leaking information through the synthesized summary.

### Test Cases

| ID | Test | Expected |
|----|------|----------|
| 6a | App with `read_context` for `skills` only — verify synthesized context contains NO claims from other categories | Context items all have `category: "skills"` |
| 6b | App with sensitivity ceiling `personal` — verify no `sensitive` or `restricted` claims appear | All items have sensitivity ≤ `personal` |
| 6c | Claim with `sharing_policy: { type: "user_only" }` — verify excluded from context | Claim absent from context items |
| 6d | Claim with `sharing_policy: { type: "explicit_only" }` and binding NOT in approved list | Claim absent from context items |
| 6e | Claim with `sharing_policy: { type: "explicit_only" }` and binding IS in approved list | Claim present |
| 6f | Deleted claim — verify excluded from context | Claim absent |
| 6g | EXPIRED claim — verify excluded from context | Claim absent |
| 6h | Output validation returns INVALID — verify response is degraded, not silently stripped | API returns degraded response or error, never a silently modified context |

**Invariant tested:** Protocol Invariants #6 (authorization before synthesis), #7 (unauthorized claims never enter ContextModel), #8 (context rendering cannot expand authorization).

---

## Attack Vector #7: Error Leakage

**Threat:** Error messages reveal information about other users' data, enabling enumeration or metadata inference.

### Test Cases

| ID | Test | Expected |
|----|------|----------|
| 7a | GET `/claims/<nonexistent-id>` | 404 with generic message |
| 7b | GET `/claims/<other-user-claim-id>` | 404 with same generic message as 7a (indistinguishable) |
| 7c | POST `/bindings/:id/revoke` on another user's binding | 404 (not "binding belongs to passport X") |
| 7d | POST `/observations/:id/retract` on another binding's observation | 404 (not "observation belongs to binding Y") |
| 7e | POST `/bindings` with app already bound to this passport | 409 `DUPLICATE_BINDING` (no mention of existing binding ID) |
| 7f | 403 errors never include: passport IDs, binding IDs, grant IDs, claim counts, or any cross-user metadata | All 403 responses contain only generic reason codes |
| 7g | Rate limit 429 errors don't reveal aggregate usage across bindings | Rate limit response only shows this binding's limits |
| 7h | Timing attack: response time for "claim exists but not yours" vs "claim doesn't exist" | Both paths execute in constant time (passport-scoped query returns null in both cases) |

**Invariant tested:** The attacker cannot distinguish "doesn't exist" from "exists but not yours."

---

## Attack Vector #8: Rate Limits

**Threat:** Attacker overwhelms the system or exhausts another user's quota.

### Test Cases

| ID | Dimension | Test | Expected |
|----|-----------|------|----------|
| 8a | IP | N+1 requests from same IP within window | 429 on request N+1, `Retry-After` header |
| 8b | Binding | Exceed grant's `max_observations_per_hour` | 429 |
| 8c | Binding | Exceed grant's `max_observations_per_day` | 429 |
| 8d | Semantic | Exceed `max_new_claims_per_category_per_day` | 422 `SEMANTIC_LIMIT` |
| 8e | Semantic | Submit same tuple within `min_interval_same_tuple_hours` | 422 `SEMANTIC_LIMIT` |
| 8f | Semantic | Exceed `max_active_claims_per_category` | 422 `SEMANTIC_LIMIT` |
| 8g | Credential | Rapid-fire requests from same token family | 429 per credential |
| 8h | Cross-binding | Attacker's rate limit does NOT affect victim's quota | Victim's requests succeed normally |

**Invariant tested:** Rate limits are per-binding, not shared. One binding's abuse cannot deny service to another.

---

## Attack Vector #9: API Replay

**Threat:** Attacker captures and replays a valid API request to duplicate its effect.

### Test Cases

| ID | Test | Expected |
|----|------|----------|
| 9a | Replay POST `/observations` with same `Idempotency-Key` + same payload | 200/201 with cached response (idempotent — no duplicate observation) |
| 9b | Replay POST `/observations` with same `Idempotency-Key` + different payload | 409 `IDEMPOTENCY_CONFLICT` (deterministic failure) |
| 9c | Replay POST `/observations` with same `idempotency_key` in body + same binding | 409 `DUPLICATE_OBSERVATION` (DB unique constraint) |
| 9d | Replay POST `/observations` with same `idempotency_key` + different binding | Allowed (idempotency keys are per-binding) |
| 9e | Replay POST `/tokens/refresh` with previously-used refresh token | 401 `TOKEN_REUSE_DETECTED`, family revoked |
| 9f | Replay any POST after binding revocation | 403 `BINDING_REVOKED` (revision check) |
| 9g | Replay any POST after token expiry | 401 `TOKEN_EXPIRED` |
| 9h | Idempotency key reuse after 24-hour expiry | Treated as new request (key expired) |

**Invariant tested:** No request replay can create duplicate state. Token rotation prevents credential replay.

---

## Attack Vector #10: API Must Not Bypass the Kernel

**Threat:** An API endpoint controller directly mutates the database, bypassing the kernel's authorization, validation, and reconciliation logic.

### Test Cases

| ID | Test | Expected |
|----|------|----------|
| 10a | Every POST `/observations` flows through kernel `ingest()` | Controller calls `ingest()`, not `claimStore.createClaim()` directly |
| 10b | Every GET `/context` flows through kernel `executeReadPipeline()` | Controller calls `executeReadPipeline()`, not `claimStore.getClaims()` directly |
| 10c | Every GET `/claims/:id` applies kernel `authorize()` before `getClaim()` | Authorization check precedes data fetch |
| 10d | Every user action endpoint creates `UserMemoryEvent` via kernel functions | Controller does not directly INSERT into user_memory_events |
| 10e | Every token refresh flows through kernel `refreshTokenFamily()` | Controller calls `refreshTokenFamily()`, not `tokenStore.compareAndSwapGeneration()` directly |
| 10f | No controller imports `ClaimStore`, `EvidenceStore`, `ObservationStore` directly | Static analysis: controllers import kernel functions only |
| 10g | Every mutation that touches claims runs reconciliation | No claim state change without `reconcile()` call |
| 10h | Database session `app.passport_id` is set by middleware, never by controllers | Static analysis: only auth middleware calls `SET app.passport_id` |

**Verification method:** Combination of integration tests (10a–10e, 10g) and static analysis (10f, 10h). The kernel is not just called — it is the ONLY path.

---

## Cross-Cutting Invariants

These span multiple attack vectors and must hold everywhere:

| # | Invariant | Vectors | Verification |
|---|-----------|---------|--------------|
| C1 | Passport isolation at every layer | 2, 3, 7 | Every entity lookup is passport-scoped |
| C2 | No alternate mutation path | 10 | Static analysis + integration tests |
| C3 | Error responses are information-free | 3, 7 | All IDOR → 404, all auth failures → generic codes |
| C4 | Server-determined fields are immutable to clients | 4 | Every POST endpoint ignores controlled fields |
| C5 | Capability × DataPolicy is the permission | 1, 5, 6 | `authorize()` checks both dimensions |
| C6 | Idempotency is deterministic | 9 | Same key + same payload = same result; same key + different payload = 409 |
| C7 | Rate limits are isolated per binding | 8 | No cross-binding interference |

---

## Conformance Matrix Preview

| Attack Vector | Test Count | Target | Status |
|---------------|------------|--------|--------|
| #1 Authentication ≠ Authorization | 9 | Auth middleware + kernel authorize() | M2 |
| #2 Never Trust Request IDs | 7 | Controller → kernel passport scoping | M2 |
| #3 IDOR on Every Entity | 8 | Passport-scoped repository lookups | M2 |
| #4 Mass Assignment | 9 | Request validation + server-determined fields | M2 |
| #5 Capability Confusion | 8 | Explicit capability → endpoint mapping | M2 |
| #6 Context Filter-Before-Synthesis | 8 | Read pipeline + output validation | M2 |
| #7 Error Leakage | 8 | Error response sanitization | M2 |
| #8 Rate Limits | 8 | Multi-dimensional rate limiting | M2 |
| #9 API Replay | 8 | Idempotency + token rotation + revision | M2 |
| #10 No Kernel Bypass | 8 | Static analysis + integration tests | M2 |
| **Total** | **81** | | |

---

## Test Architecture

```
tests/
├── adversarial/           # Attack vector tests (this document)
│   ├── auth-bypass.test.ts        # Vector #1
│   ├── id-trust.test.ts           # Vector #2
│   ├── idor.test.ts               # Vector #3
│   ├── mass-assignment.test.ts    # Vector #4
│   ├── capability.test.ts         # Vector #5
│   ├── context-filter.test.ts     # Vector #6
│   ├── error-leakage.test.ts      # Vector #7
│   ├── rate-limits.test.ts        # Vector #8
│   ├── replay.test.ts             # Vector #9
│   └── kernel-bypass.test.ts      # Vector #10
│
└── integration/           # Happy-path functional tests
    ├── passport.test.ts
    ├── binding.test.ts
    ├── grant.test.ts
    ├── observation.test.ts
    ├── context.test.ts
    ├── user-actions.test.ts
    └── token-lifecycle.test.ts
```

---

*M0 proved the kernel is sound. M1 proved the database enforces it. M1.5 proved the enforcement survives live attack. M2 proves the network boundary cannot reach around any of it.*
