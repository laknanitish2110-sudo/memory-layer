# M3.7 — Security Preflight: VERDICT

**Date:** 2026-10-08
**Deployed version:** v11 (edge function memory-layer-api, ACTIVE)
**Script:** `scripts/preflight-security.ts` (45 vectors, 8 phases)

## Result: FULLY PASSED — 45/45

All 45 security vectors pass against the live v11 deployment.
The API is hardened for external developer credentials.

## Pre-Preflight Fixes (Database-Level, 2026-10-06)

Before the HTTP-level preflight could run, a database-level audit via
Supabase MCP discovered and fixed critical vulnerabilities:

| Finding | Severity | Fix |
|---------|----------|-----|
| `cleanup_test_data()` — SECURITY DEFINER callable by anon. Could TRUNCATE ALL tables via PostgREST. | **P0 CRITICAL** | REVOKE EXECUTE from anon, authenticated, PUBLIC |
| `provision_testers()` — could create arbitrary credentials via anon | P1 | REVOKE EXECUTE from anon, authenticated, PUBLIC |
| `revoke_all_credentials(uuid)` — DoS: wipe any user's tokens via anon | P1 | REVOKE EXECUTE from anon, authenticated, PUBLIC |
| `test_cv_delete_attack()` — test function exposed to anon | P2 | REVOKE EXECUTE from anon, authenticated, PUBLIC |
| `token_family_cas(uuid, integer)` — CAS operation exposed to anon | P2 | REVOKE EXECUTE from anon, authenticated, PUBLIC |
| RLS enabled on only 2/23 tables | P1 | Enabled RLS on all 23 public tables |

All fixes verified: `service_role` retains access; `anon` and `authenticated` have zero access.

## Phase Results (Live HTTP + PostgREST, 2026-10-08)

### Phase 0: Token Refresh Bootstrap (2/2 PASS)
- Alice token refresh → 1-hour access token
- Bob token refresh → 1-hour access token

### Phase 1: API-Level Cross-Passport Isolation (7/7 PASS)
- Alice can observe()
- Alice reads her own context
- Bob cannot see Alice's claims via context
- Bob cannot read Alice's claim by ID
- Fabricated credential rejected (401)
- Missing auth header → 401
- Malformed auth (Basic) → 401

### Phase 2: Grant / Capability Enforcement (3/3 PASS)
- Write to unauthorized category rejected
- Restricted sensitivity write rejected
- Server-determined field injection blocked

### Phase 3: Direct Supabase Access — Anon Key (11/11 PASS)
- Cannot read: claims, observations, evidence, bindings, token_families, accounts, passports, claim_versions, binding_grants
- Cannot INSERT claims
- Cannot call current_passport_id()

### Phase 4: Revocation Enforcement (4/4 PASS)
- Temp credential works before revocation
- Revoked credential cannot read context
- Revoked credential cannot observe
- Active binding with deactivated grant rejected

### Phase 5: Enumeration Resistance (3/3 PASS)
- Binding endpoint returns only own binding
- App token cannot enumerate passports
- Guessed claim ID returns 404

### Phase 6: Request Validation (4/4 PASS)
- Non-JSON content type rejected
- Missing required fields → 400
- Expired token rejected
- Context endpoint responds correctly

### Phase 7: Cross-Credential Write Isolation (3/3 PASS)
- Bob can observe()
- Alice cannot see Bob's claims
- Bob cannot see Alice's claims

### Phase 8: Direct PostgREST Mutation Attacks (8/8 PASS)
- Cannot UPDATE claims
- Cannot DELETE claims
- Cannot INSERT claim_versions (append-only preserved)
- Cannot UPDATE binding_grants (privilege escalation blocked)
- Cannot INSERT bindings (identity forgery blocked)
- Cannot read user_memory_events
- Cannot read refresh_tokens
- Cannot read access_tokens

## Security Posture Summary

| Layer | Status |
|-------|--------|
| Edge function auth (token parse + verify) | PASS |
| Passport isolation (cross-user data leak) | PASS |
| Grant enforcement (category + sensitivity ceiling) | PASS |
| Revocation (binding + grant deactivation) | PASS |
| PostgREST read attacks (anon key) | PASS — zero SELECT on all 23 tables |
| PostgREST write attacks (anon key) | PASS — zero INSERT/UPDATE/DELETE on all 23 tables |
| RPC function exposure | PASS — all dangerous functions locked to service_role |
| RLS defense-in-depth | PASS — enabled on all 23 tables |
| Enumeration resistance | PASS — no passport/binding enumeration |
| Request validation | PASS — type checking, expiry, content-type |
| Supabase Auth users | 0 (no authenticated JWTs in the wild) |

## Result Summary

**45/45 tests PASS.** All P0, P1, and P2 findings fixed prior to run.
M3.7 Security Preflight is FULLY PASSED.

## Milestone Ledger

```
M0-M3.4    All locked, 523 tests ALL GREEN
M3.5       External Developer Test   FULLY PASSED (v11, 24/24)
M3.7       Security Preflight        FULLY PASSED (v11, 45/45)
```
