# M2 Conformance Matrix — API Layer

**Version:** M2.0 — API Contract + Threat Model  
**Tests:** 115 adversarial + integration (pending implementation)  
**Status:** Contract defined. Implementation pending.  
**Preconditions:** M0 (109 tests) ✅ | M1 (74 tests) ✅ | M1.5 (35 live DB attacks) ✅

This matrix maps every M2 security requirement to its planned test. No endpoint ships without every row verified.

---

## Security Boundary

```
HTTP Request
    │
    ▼
┌──────────────────┐
│ Rate Limiter     │  IP + principal + binding + endpoint + credential
└──────┬───────────┘
       │
┌──────▼───────────┐
│ Token Validator  │  Signature, expiry, structure
└──────┬───────────┘
       │
┌──────▼───────────┐
│ Auth Middleware   │  Extract binding_id → lookup binding → set passport_id
└──────┬───────────┘
       │
┌──────▼───────────┐
│ Request Validator │  Schema validation + mass assignment protection
└──────┬───────────┘
       │
┌──────▼───────────┐
│ Controller       │  HTTP → kernel function call (thin translation only)
└──────┬───────────┘
       │
┌──────▼───────────┐
│ Protocol Kernel  │  authorize() → ingest()/readPipeline()/reconcile()
└──────┬───────────┘
       │
┌──────▼───────────┐
│ Repository       │  Passport-scoped data access
└──────┬───────────┘
       │
┌──────▼───────────┐
│ Postgres + RLS   │  Database-level enforcement (M1/M1.5 verified)
└──────────────────┘
```

---

## Acceptance Criteria

### Functional

| # | Requirement | Endpoint(s) | Test File |
|---|-------------|-------------|-----------|
| F1 | Auth: token validation + binding lookup | All | `auth-bypass.test.ts` |
| F2 | Passport: create + list | POST/GET `/passports` | `passport.test.ts` |
| F3 | Binding: create + view + revoke | POST/GET `/bindings`, POST `/bindings/:id/revoke` | `binding.test.ts` |
| F4 | Grant: request + consent + revoke | POST `/bindings/:id/grants`, POST `/grants/:id/*` | `grant.test.ts` |
| F5 | Observation: submit + retract | POST `/observations`, POST `/observations/:id/retract` | `observation.test.ts` |
| F6 | Context: read pipeline | GET `/context` | `context.test.ts` |
| F7 | User actions: confirm/correct/override/dispute/reclassify/delete | POST `/claims/:id/*` | `user-actions.test.ts` |
| F8 | Revocation: binding + grant + credential cascade | POST `/bindings/:id/revoke` | `binding.test.ts` |
| F9 | Token lifecycle: refresh + rotation + reuse detection | POST `/tokens/refresh` | `token-lifecycle.test.ts` |

### Security (Attack Vectors)

| # | Attack Vector | Tests | Test File | Status |
|---|---------------|-------|-----------|--------|
| S1 | Authentication ≠ Authorization | 9 | `auth-bypass.test.ts` | M2 |
| S2 | Never trust request IDs | 7 | `id-trust.test.ts` | M2 |
| S3 | IDOR on every entity type | 8 | `idor.test.ts` | M2 |
| S4 | Mass assignment | 9 | `mass-assignment.test.ts` | M2 |
| S5 | Capability confusion | 8 | `capability.test.ts` | M2 |
| S6 | Filter-before-synthesis | 8 | `context-filter.test.ts` | M2 |
| S7 | Error leakage | 8 | `error-leakage.test.ts` | M2 |
| S8 | Rate limits | 8 | `rate-limits.test.ts` | M2 |
| S9 | API replay | 8 | `replay.test.ts` | M2 |
| S10 | No kernel bypass | 8 | `kernel-bypass.test.ts` | M2 |
| S11 | Auth context forgery | 6 | `context-forgery.test.ts` | M2 |
| S12 | Token/binding mismatch | 7 | `token-mismatch.test.ts` | M2 |
| S13 | Parser attacks | 8 | `parser-attacks.test.ts` | M2 |
| S14 | Authorization caching | 6 | `auth-caching.test.ts` | M2 |
| S15 | Error path bypass | 7 | `error-path-bypass.test.ts` | M2 |

### Architecture

| # | Requirement | Verification |
|---|-------------|-------------|
| A1 | HTTP → Kernel → Repository → DB (no alternate mutation path) | Static analysis + `kernel-bypass.test.ts` |
| A2 | Controllers import kernel functions, not stores | Static analysis |
| A3 | Auth middleware is the only code that sets `app.passport_id` | Static analysis + `context-forgery.test.ts` |
| A4 | Every entity lookup is passport-scoped | Code review + IDOR tests |
| A5 | Error responses never contain cross-user metadata | `error-leakage.test.ts` |
| A6 | No stale authorization survives state changes | `auth-caching.test.ts` |
| A7 | Error/recovery paths perform zero domain mutations | `error-path-bypass.test.ts` |
| A8 | Request parser rejects adversarial payloads | `parser-attacks.test.ts` |

---

## Protocol Invariant Coverage (M0 → M2)

| # | Invariant | M0 | M1 | M1.5 | M2 |
|---|-----------|----|----|------|----|
| 1 | Apps never own passports | ✅ | ✅ | ✅ | S2, S3, S11 |
| 2 | Apps never write protocol state | ✅ | ✅ | ✅ | S4, S10, S15 |
| 3 | Apps submit observations, not truth | ✅ | — | — | S4, S10, S13 |
| 4 | Evidence is immutable | ✅ | ✅ | ✅ | S10, S15 |
| 5 | Claims are user-owned | ✅ | — | — | F7 |
| 6 | Authorization before synthesis | ✅ | — | — | S6 |
| 7 | Unauthorized claims never enter ContextModel | ✅ | — | — | S6 |
| 8 | Context rendering cannot expand authorization | ✅ | — | — | S6 |
| 9 | Grant expansion requires consent | ✅ | — | — | F4 |
| 10 | Revocation invalidates stale binding revisions | ✅ | ✅ | ✅ | S1, S9, S12, S14 |
| 11 | Cross-passport access requires explicit bridge | ✅ | ✅ | ✅ | S3, S11 |
| 12 | Every query is passport-scoped | ✅ | ✅ | ✅ | S2, S3, S11, A4 |
| 13 | Purge respects retention classes | ✅ | — | — | (M3) |
| 14 | Provenance survives purge | ✅ | — | — | (M3) |

---

## Milestone Tracker

| Milestone | Tests | Status |
|-----------|-------|--------|
| M0 — Protocol Kernel | 109 unit | ✅ Locked |
| M1 — Persistence Layer | 74 mock | ✅ Locked |
| M1.5 — Live Postgres | 35 live DB | ✅ Locked |
| M2 — API Layer | 115 adversarial + integration | 🚧 Contract defined |
| M3 — Purge + Data Lifecycle | TBD | ⬜ Not started |

---

*When someone adds a "convenience endpoint" that skips the kernel, this matrix tells you which attack vectors they just reopened.*
