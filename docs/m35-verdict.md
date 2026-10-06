# M3.5 — External Developer Test: VERDICT

**Date:** 2026-10-06
**Deployed version:** v10 (edge function memory-layer-api, ACTIVE)

## Result: CONDITIONAL PASS

All P0/P1 bugs from the first stranger test round have been fixed and
verified. One new low-severity finding emerged.

## Previously Identified Bugs — All Fixed

| Finding | Severity | v9/v10 Fix | Rerun Verification |
|---------|----------|------------|-------------------|
| `learning_goals` → 500 | P0 | v9 FIXED | Test 14: 400 PASS |
| Non-string refresh_token → 500 | P0 | v9 FIXED | Tests 9-12: 400 PASS |
| Fake UUID refresh_token → 500 | P0 | v10 FIXED | Test 6: 401 PASS |
| Internal method names leaked | P1 | v9 FIXED | Error messages generic |
| Endpoint mismatches | P0 | README rewritten | All endpoints correct |
| Claims always CONTESTED | UX | v10 FIXED | Claims show OBSERVED |

## New Finding (Rerun)

### P2: GET / returns 404 (cosmetic)

- **Test 1:** `GET $API_URL/` → HTTP 404 "404 Not Found"
- **Expected:** HTTP 200 with service info JSON
- **Impact:** Low. The `/health` endpoint works correctly (200).
  External developers don't need GET / — they use /health for
  health checks and /v1/* for all API operations.
- **Root cause:** Likely Hono basePath routing quirk with Supabase
  Edge Functions. The route IS defined in code (line 190) but
  doesn't match when accessed through Supabase's URL scheme.
- **README:** Currently documents GET / as available. Should be
  corrected or the route should be fixed.

## Security Mechanisms — All Verified

| Mechanism | Test | Result |
|-----------|------|--------|
| Token reuse detection | Test 24 | PASS — 401 TOKEN_REUSE_DETECTED |
| Family-wide revocation | Alice family | CONFIRMED revoked |
| Data isolation | Tests 22-23 | PASS — Charlie sees no Bob data |
| Type validation | Tests 9-12, 16-17 | ALL PASS — 400 on bad types |
| Category validation | Test 14 | PASS — 400 on invalid category |
| Sensitivity validation | Test 15 | PASS — 400 on invalid sensitivity |
| Fake UUID rejection | Test 6 | PASS — 401 TOKEN_INVALID |

## Full Test Matrix (24 tests)

| # | Test | Expected | Actual | Status |
|---|------|----------|--------|--------|
| 1 | GET / | 200 | 404 | FAIL (P2) |
| 2 | GET /health | 200 | 200 | PASS |
| 3 | Alice token refresh | 200 | N/A | BLOCKED (test ordering) |
| 4 | Bob token refresh | 200 | 200 | PASS |
| 5 | Charlie token refresh | 200 | 200 | PASS |
| 6 | Fake UUID refresh | 401 | 401 | PASS |
| 7 | Zero UUID refresh | 401 | 401 | PASS |
| 8 | Malformed token string | 401 | 401 | PASS |
| 9 | Integer refresh_token | 400 | 400 | PASS |
| 10 | Boolean refresh_token | 400 | 400 | PASS |
| 11 | Empty string refresh_token | 400 | 400 | PASS |
| 12 | Missing refresh_token | 400 | 400 | PASS |
| 13 | Valid observation | 201 | 201 | PASS |
| 14 | Invalid category | 400 | 400 | PASS |
| 15 | Invalid sensitivity | 400 | 400 | PASS |
| 16 | Missing required field | 400 | 400 | PASS |
| 17 | Integer field value | 400 | 400 | PASS |
| 18 | GET /v1/context | 200 | 200 | PASS |
| 19 | GET /v1/claims/:id | 200 | 200 | PASS |
| 20 | GET /v1/bindings | 200 | 200 | PASS |
| 21 | POST retract | 200 | 200 | PASS |
| 22 | Data isolation (Charlie) | 200 | 200 | PASS |
| 23 | Data isolation (Bob) | 200 | 200 | PASS |
| 24 | Token reuse detection | 401 | 401 | PASS |

## Recommendation

Fix the GET / route (P2) and remove it from the README if the
Supabase/Hono routing quirk can't be resolved. Then M3.5 is FULLY PASSED.

No P0 or P1 issues remain. The API is ready for external developers.
