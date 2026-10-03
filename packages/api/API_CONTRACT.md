# Memory Passport API Contract v0.2

**Status:** LOCKED — Defines the external surface for M2.  
**Architecture:** HTTP → Authentication → Request Validation → Protocol Kernel → Repository → Postgres  
**Principle:** The API is a thin translation layer. It does not authorize, reconcile, classify, or store. The kernel does.

---

## Authentication

Every request carries an `Authorization: Bearer <access_token>` header. The API layer:

1. Validates the token (signature, expiry, structure)
2. Extracts `binding_id` and `family_id` from the token claims
3. Looks up the binding → extracts `passport_id`
4. Sets `app.passport_id` on the database session (the RLS security boundary)
5. Passes `{ passportId, bindingId, grantId, bindingRevision }` to the kernel

**The API never trusts IDs from the request body for authorization.** Every entity lookup uses the authenticated `passport_id`, never a user-supplied passport ID.

### User Authentication (User Action Endpoints)

User action endpoints (`POST /v1/claims/:id/*`) require a user session token, not an app access token. The user authenticates directly with Memory Layer, not through an app binding.

### Rate Limiting

Every request is rate-limited on multiple dimensions:

| Dimension | Scope | Purpose |
|-----------|-------|---------|
| IP | Per source IP | DDoS mitigation |
| Principal | Per authenticated identity | Abuse prevention |
| Binding | Per app-passport binding | Grant-level enforcement |
| Endpoint | Per route | Write amplification prevention |
| Credential | Per token family | Token abuse detection |

Rate limit headers on every response:
```
X-RateLimit-Limit: <max>
X-RateLimit-Remaining: <remaining>
X-RateLimit-Reset: <unix_timestamp>
Retry-After: <seconds>          (on 429 only)
```

### Idempotency

All `POST` endpoints that create resources accept `Idempotency-Key: <client-generated-uuid>` header.

**Rules:**
- Same key + same payload = return cached response (200/201)
- Same key + different payload = `409 Conflict` (deterministic failure, not silent override)
- Keys expire after 24 hours
- Keys are scoped to the authenticated binding

---

## Common Response Envelope

### Success
```json
{
  "data": { ... },
  "meta": {
    "request_id": "req_...",
    "policy_version": "v0.1.0"
  }
}
```

### Error
```json
{
  "error": {
    "code": "BINDING_REVOKED",
    "message": "Human-readable description",
    "request_id": "req_..."
  }
}
```

**Error leakage rule:** Errors never reveal cross-user metadata. A claim that belongs to another passport returns `404`, not `403 — this claim belongs to passport X`. Authorization failures on missing entities always return `404`.

### Error Codes

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Malformed request body |
| 400 | `IDEMPOTENCY_CONFLICT` | Same key, different payload |
| 401 | `TOKEN_EXPIRED` | Access token expired |
| 401 | `TOKEN_INVALID` | Token signature/format invalid |
| 401 | `TOKEN_REUSE_DETECTED` | Refresh token reuse → family revoked |
| 403 | `BINDING_SUSPENDED` | Binding suspended (type in response) |
| 403 | `BINDING_REVOKED` | Binding permanently revoked |
| 403 | `CAPABILITY_NOT_GRANTED` | Missing required capability |
| 403 | `CATEGORY_NOT_GRANTED` | Category outside grant |
| 403 | `SENSITIVITY_EXCEEDS_CEILING` | Sensitivity above binding ceiling |
| 403 | `PURPOSE_NOT_AUTHORIZED` | Purpose template violation |
| 403 | `STALE_BINDING_REVISION` | Binding revision mismatch |
| 403 | `GRANT_EXPIRED` | Grant requires reauthorization |
| 404 | `NOT_FOUND` | Entity not found (or not owned by this passport) |
| 409 | `DUPLICATE_OBSERVATION` | Idempotency key already used for this binding |
| 422 | `PROTOCOL_NAMESPACE` | Attempted write to `protocol.*` namespace |
| 422 | `QUARANTINED` | Classified as restricted → quarantine |
| 422 | `SEMANTIC_LIMIT` | Semantic write limit exceeded |
| 429 | `RATE_LIMITED` | Rate limit exceeded |

---

## Endpoints

### 1. Identity

#### `POST /v1/passports`

Create a new passport for the authenticated account.

- **Auth:** User session token (not app binding)
- **Capability:** None (user operation)
- **Idempotency:** Yes

**Request:**
```json
{
  "name": "Work AI",
  "is_ephemeral": false
}
```

**Response (201):**
```json
{
  "data": {
    "id": "psp_...",
    "account_id": "acct_...",
    "name": "Work AI",
    "created_at": "2026-10-03T...",
    "is_ephemeral": false,
    "binding_ids": [],
    "bridge_ids": []
  }
}
```

**Server-determined:** `id`, `account_id`, `created_at`, `binding_ids`, `bridge_ids`.

---

#### `GET /v1/passports`

List passports for the authenticated account.

- **Auth:** User session token
- **Capability:** None (user operation)

**Response (200):**
```json
{
  "data": [
    {
      "id": "psp_...",
      "name": "Work AI",
      "created_at": "2026-10-03T...",
      "is_ephemeral": false,
      "binding_count": 3
    }
  ]
}
```

---

### 2. Bindings

#### `POST /v1/bindings`

Create a binding between an app and a passport. This is the "connect" action.

- **Auth:** User session token + app principal verification
- **Capability:** None (consent ceremony — creates the binding that will hold capabilities)
- **Idempotency:** Yes

**Request:**
```json
{
  "passport_id": "psp_...",
  "app_principal_id": "app_...",
  "purposes": ["coding_assistance"],
  "requested_capabilities": ["read_context", "read_claims", "write_claims"],
  "requested_read_categories": ["skills", "preferences", "projects"],
  "requested_write_categories": ["skills"],
  "requested_read_sensitivity_ceiling": "personal",
  "requested_write_sensitivity_ceiling": "personal"
}
```

**Validation (server-side, before consent):**
1. `passport_id` belongs to authenticated account
2. `app_principal_id` exists and is active
3. No existing active binding for this passport + app pair
4. Requested capabilities fit within purpose template ceilings (`isGrantWithinPurpose`)
5. Requested categories fit within purpose template ceilings
6. Requested sensitivity fits within purpose template max
7. No app can request `sensitivity_ceiling: restricted`

**Response (201):**
```json
{
  "data": {
    "binding": {
      "id": "bnd_...",
      "passport_id": "psp_...",
      "app_principal_id": "app_...",
      "status": "active",
      "revision": 1,
      "created_at": "2026-10-03T..."
    },
    "grant": {
      "id": "grt_...",
      "version": 1,
      "capabilities": ["read_context", "read_claims", "write_claims"],
      "data_policy": { ... },
      "active": true
    },
    "token_family": {
      "family_id": "fam_...",
      "refresh_token": "<opaque>",
      "access_token": "<opaque>",
      "access_token_expires_at": "2026-10-03T..."
    }
  }
}
```

**Server-determined:** `binding.id`, `binding.status`, `binding.revision`, `binding.created_at`, `grant.id`, `grant.version`, `grant.consent_record_id`, `grant.consented_at`, `grant.active`, `data_policy.write.rate_limit` (from verification status), `data_policy.write.semantic_limits` (from verification status), `data_policy.write.evidence_required` (always true), token family, tokens.

---

#### `GET /v1/bindings`

List bindings for the authenticated passport.

- **Auth:** App access token
- **Capability:** None (apps see their own binding only)

**Response (200):**
```json
{
  "data": {
    "id": "bnd_...",
    "status": "active",
    "revision": 3,
    "current_grant_id": "grt_...",
    "created_at": "2026-10-03T..."
  }
}
```

**Note:** An app can only see its own binding. This endpoint returns the single binding for the authenticated app + passport pair, not a list. Users see all bindings via the user dashboard (separate auth).

---

#### `POST /v1/bindings/:id/revoke`

Revoke a binding. User operation only.

- **Auth:** User session token
- **Capability:** None (user operation)

**Request:** Empty body.

**Server-side actions:**
1. Verify binding belongs to authenticated passport
2. Set `status = "revoked"`, increment `revision`
3. Invalidate all credentials for this binding
4. Log AccessEvent

**Response (200):**
```json
{
  "data": {
    "id": "bnd_...",
    "status": "revoked",
    "revision": 4,
    "revoked_at": "2026-10-03T..."
  }
}
```

---

### 3. Grants

#### `POST /v1/bindings/:id/grants`

Request a new grant (permission change) on an existing binding.

- **Auth:** App access token (requests expansion) or User session token (user-initiated change)
- **Capability:** `request_elevation` (if app-initiated expansion)
- **Idempotency:** Yes

**Request:**
```json
{
  "requested_capabilities": ["read_context", "read_claims", "read_versions", "write_claims"],
  "requested_read_categories": ["skills", "preferences", "projects", "goals"],
  "requested_write_categories": ["skills"],
  "requested_read_sensitivity_ceiling": "personal",
  "requested_write_sensitivity_ceiling": "personal",
  "purposes": ["coding_assistance"]
}
```

**Server-side:**
1. Verify binding belongs to authenticated passport
2. Compute `GrantDelta` against current active grant
3. If `isExpansion(delta) === true`:
   - App-initiated: return `202 Accepted` with pending consent (user must approve)
   - User-initiated: create new grant immediately
4. If `isExpansion(delta) === false`: silent downgrade, create new grant
5. Validate against purpose template ceilings
6. Deactivate previous grant, create new grant, increment binding revision

**Response (201) — immediate (downgrade or user-initiated):**
```json
{
  "data": {
    "grant": {
      "id": "grt_...",
      "version": 2,
      "capabilities": [...],
      "data_policy": { ... },
      "active": true
    },
    "delta": {
      "removed_capabilities": ["read_versions"],
      "added_capabilities": []
    }
  }
}
```

**Response (202) — pending consent (app-initiated expansion):**
```json
{
  "data": {
    "consent_required": true,
    "delta": {
      "added_capabilities": ["read_versions"],
      "added_read_categories": ["goals"]
    }
  }
}
```

---

#### `POST /v1/grants/:id/consent`

User consents to a pending grant expansion.

- **Auth:** User session token
- **Capability:** None (user operation)

**Request:**
```json
{
  "approved": true
}
```

**Response (200):**
```json
{
  "data": {
    "grant": {
      "id": "grt_...",
      "version": 2,
      "active": true
    },
    "consent_record": {
      "id": "cns_...",
      "consent_type": "expansion"
    }
  }
}
```

---

#### `POST /v1/grants/:id/revoke`

Revoke a specific grant (downgrade to no permissions without revoking the binding).

- **Auth:** User session token
- **Capability:** None (user operation)

**Request:** Empty body.

**Response (200):**
```json
{
  "data": {
    "grant_id": "grt_...",
    "active": false,
    "binding_revision": 5
  }
}
```

---

### 4. Memory (App Operations)

#### `POST /v1/observations`

Submit an observation. The core write path.

- **Auth:** App access token
- **Required capability:** `write_claims`
- **Idempotency:** Yes (via `idempotency_key` in body — UNIQUE per binding)

**Request:**
```json
{
  "idempotency_key": "obs_abc123",
  "experience_id": "exp_..." | null,
  "subject": "user",
  "predicate": "knows",
  "value": "Python",
  "qualifiers": { "proficiency": "advanced" },
  "declared_sensitivity": "public",
  "declared_category": "skills",
  "extraction_method": "user_stated",
  "raw_context": "User said: 'I've been writing Python for 5 years'"
}
```

**Server-determined fields (rejected if present in request):**
- `id` — generated server-side
- `binding_id` — from authenticated token, never from request
- `outcome` — determined by write pipeline
- `submitted_at` — server clock
- `evidence_tier` — determined by extraction_method + first_party flag
- `sensitivity` (effective) — three-input most-restrictive-wins classification
- `first_party` — structurally determined (always true for submitting app)

**Validation chain (delegated to kernel `ingest()`):**
1. Idempotency check
2. Protocol namespace guard (`protocol.*` → 422)
3. Capability check (`write_claims` required)
4. Category check (category in grant's write policy?)
5. Semantic budget checks (active claims/category, daily limit, same-tuple interval)
6. Evidence validation (`raw_context` + `extraction_method` required)
7. Sensitivity classification (most-restrictive-wins)
8. Quarantine if classified as `restricted`
9. Post-classification ceiling check
10. Dedup/merge check
11. Contradiction detection + resolution

**Response (201) — accepted:**
```json
{
  "data": {
    "observation_id": "obs_...",
    "outcome": {
      "status": "accepted",
      "evidence_id": "evi_...",
      "claim_id": "clm_..."
    }
  }
}
```

**Response (201) — merged:**
```json
{
  "data": {
    "observation_id": "obs_...",
    "outcome": {
      "status": "merged",
      "existing_claim_id": "clm_...",
      "evidence_id": "evi_..."
    }
  }
}
```

**Response (422) — rejected:**
```json
{
  "error": {
    "code": "SEMANTIC_LIMIT",
    "message": "Maximum active claims per category exceeded"
  }
}
```

**Response (422) — quarantined:**
```json
{
  "data": {
    "observation_id": "obs_...",
    "outcome": {
      "status": "quarantined",
      "reason": "Classified as restricted sensitivity",
      "requires_user_action": true
    }
  }
}
```

---

#### `POST /v1/observations/:id/retract`

Retract an observation previously submitted by this app.

- **Auth:** App access token
- **Required capability:** `retract_own_observation`

**Request:** 
```json
{
  "reason": "Data was stale"
}
```

**Server-side:**
1. Verify observation exists and belongs to authenticated binding
2. Set evidence status → `"retracted"`
3. Re-run reconciliation on affected claim
4. Log event

**Response (200):**
```json
{
  "data": {
    "observation_id": "obs_...",
    "evidence_id": "evi_...",
    "evidence_status": "retracted",
    "affected_claim_id": "clm_...",
    "claim_new_state": "UNSUPPORTED"
  }
}
```

---

#### `GET /v1/context`

Retrieve the synthesized context model for this binding's authorized scope.

- **Auth:** App access token
- **Required capability:** `read_context`

**Query parameters:**
```
?categories=skills,preferences    (optional — subset of granted categories)
&purpose=coding_assistance        (optional — must be in authorized purposes)
```

**Server-side (delegated to kernel `executeReadPipeline()`):**
1. Authorize request (binding, grant, revision, capability)
2. Query claims by authorized categories + sensitivity ceiling
3. Filter by category → sensitivity → sharing policy (filter-before-synthesis)
4. Synthesize to ContextItems
5. Validate output (binary — VALID or INVALID, never rewrite)
6. Log AccessEvent

**Response (200):**
```json
{
  "data": {
    "items": [
      {
        "claim_id": "clm_...",
        "category": "skills",
        "sensitivity": "public",
        "summary": "user knows Python",
        "confidence_band": "high"
      }
    ],
    "generated_at": "2026-10-03T...",
    "policy_version": "v0.1.0"
  }
}
```

**Note:** `claim_id` is included in context items for `read_context`. This enables apps to reference specific claims in follow-up queries without needing `read_claims`. However, `read_context` does NOT allow fetching individual claims — only the synthesized summary.

---

#### `GET /v1/claims/:id`

Retrieve a specific claim.

- **Auth:** App access token
- **Required capability:** `read_claims`

**Server-side:**
1. `getClaim(authenticatedPassportId, claimId)` — passport-scoped lookup
2. Verify claim's category is in grant's read policy
3. Verify claim's sensitivity is within grant's ceiling
4. Apply sharing policy filter
5. If claim not found or not authorized → `404` (not `403`)

**Response (200):**
```json
{
  "data": {
    "id": "clm_...",
    "subject": "user",
    "predicate": "knows",
    "value": "Python",
    "qualifiers": { "proficiency": "advanced" },
    "category": "skills",
    "state": "SUPPORTED",
    "volatility": "stable",
    "sensitivity": "public",
    "created_at": "2026-10-03T...",
    "updated_at": "2026-10-03T...",
    "current_version_id": "ver_..."
  }
}
```

**Redacted fields (not exposed to apps):**
- `passport_id` — the app already knows which passport it's bound to
- `evidence_ids` — requires `read_evidence` capability
- `sharing_policy` — internal enforcement, not app-visible
- `declared_state` / `observed_state` — internal reconciliation state
- `purged_references` — internal provenance
- `contradicted_by` — cross-claim references not exposed without `read_claims` on the contradicting claim

---

### 5. User Memory Actions

All user action endpoints follow the same pattern:
- **Auth:** User session token (not app token)
- **Server-side:** Create `UserMemoryEvent`, create Tier 1 evidence where applicable, create new `ClaimVersion`, re-reconcile

#### `POST /v1/claims/:id/confirm`

User confirms a claim's current value is correct.

- **Request:** Empty body.
- **Creates:** Tier 1 evidence confirming current value. State → `DECLARED`.

**Response (200):**
```json
{
  "data": {
    "claim_id": "clm_...",
    "new_state": "DECLARED",
    "evidence_id": "evi_...",
    "event_id": "evt_..."
  }
}
```

---

#### `POST /v1/claims/:id/correct`

User corrects a claim's value.

**Request:**
```json
{
  "new_value": "TypeScript",
  "reason": "I primarily use TypeScript now"
}
```

- **Creates:** Tier 1 evidence with new value. New ClaimVersion. State → `DECLARED`.

**Response (200):**
```json
{
  "data": {
    "claim_id": "clm_...",
    "new_state": "DECLARED",
    "new_value": "TypeScript",
    "version_id": "ver_...",
    "evidence_id": "evi_...",
    "event_id": "evt_..."
  }
}
```

---

#### `POST /v1/claims/:id/override`

User overrides the observed state with a declaration.

**Request:**
```json
{
  "declared_state": "DECLARED",
  "reason": "I know this is correct"
}
```

- **Creates:** Sets `declared_state`. Original observations preserved.

**Response (200):**
```json
{
  "data": {
    "claim_id": "clm_...",
    "previous_state": "CONTESTED",
    "new_state": "DECLARED",
    "event_id": "evt_..."
  }
}
```

---

#### `POST /v1/claims/:id/dispute`

User disputes a claim.

**Request:**
```json
{
  "reason": "This doesn't reflect my actual preference"
}
```

- **Creates:** Marks state → `CONTESTED`. Surfaces for review.

**Response (200):**
```json
{
  "data": {
    "claim_id": "clm_...",
    "new_state": "CONTESTED",
    "event_id": "evt_..."
  }
}
```

---

#### `POST /v1/claims/:id/reclassify`

User changes a claim's sensitivity or sharing policy.

**Request:**
```json
{
  "new_sensitivity": "sensitive",
  "new_sharing_policy": { "type": "user_only" }
}
```

**Note:** Users can always upgrade sensitivity. Users can downgrade sensitivity (even below category floor — it's their data). But downgrading sensitivity does NOT change sharing policy.

**Response (200):**
```json
{
  "data": {
    "claim_id": "clm_...",
    "previous_sensitivity": "public",
    "new_sensitivity": "sensitive",
    "event_id": "evt_..."
  }
}
```

---

#### `POST /v1/claims/:id/delete`

User tombstones a claim. Reversible. Evidence retained.

- **Request:** Empty body.
- **Creates:** Sets `deleted = true`. Evidence survives.

**Response (200):**
```json
{
  "data": {
    "claim_id": "clm_...",
    "deleted": true,
    "deleted_at": "2026-10-03T...",
    "event_id": "evt_..."
  }
}
```

---

### 6. Token Lifecycle

#### `POST /v1/tokens/refresh`

Rotate a refresh token. Issues a new access + refresh token pair.

- **Auth:** None (the refresh token IS the credential)

**Request:**
```json
{
  "refresh_token": "<opaque>"
}
```

**Server-side (delegated to kernel `refreshTokenFamily()`):**
1. Decode token → extract `family_id`, `generation`
2. CAS: `family.current_generation == presented_generation`?
   - YES → atomically increment, issue new pair
   - NO → token reuse detected → revoke family → return 401

**Response (200) — rotated:**
```json
{
  "data": {
    "access_token": "<opaque>",
    "access_token_expires_at": "2026-10-03T...",
    "refresh_token": "<opaque>",
    "token_type": "Bearer"
  }
}
```

**Response (401) — reuse detected:**
```json
{
  "error": {
    "code": "TOKEN_REUSE_DETECTED",
    "message": "Token reuse detected. Token family revoked."
  }
}
```

---

## Endpoint Summary

| # | Method | Path | Auth | Required Capability | Idempotent |
|---|--------|------|------|---------------------|------------|
| 1 | POST | `/v1/passports` | User | — | Yes |
| 2 | GET | `/v1/passports` | User | — | — |
| 3 | POST | `/v1/bindings` | User + App verification | — | Yes |
| 4 | GET | `/v1/bindings` | App | — | — |
| 5 | POST | `/v1/bindings/:id/revoke` | User | — | — |
| 6 | POST | `/v1/bindings/:id/grants` | App (`request_elevation`) or User | `request_elevation` (app) | Yes |
| 7 | POST | `/v1/grants/:id/consent` | User | — | — |
| 8 | POST | `/v1/grants/:id/revoke` | User | — | — |
| 9 | POST | `/v1/observations` | App | `write_claims` | Yes |
| 10 | POST | `/v1/observations/:id/retract` | App | `retract_own_observation` | — |
| 11 | GET | `/v1/context` | App | `read_context` | — |
| 12 | GET | `/v1/claims/:id` | App | `read_claims` | — |
| 13 | POST | `/v1/claims/:id/confirm` | User | — | — |
| 14 | POST | `/v1/claims/:id/correct` | User | — | — |
| 15 | POST | `/v1/claims/:id/override` | User | — | — |
| 16 | POST | `/v1/claims/:id/dispute` | User | — | — |
| 17 | POST | `/v1/claims/:id/reclassify` | User | — | — |
| 18 | POST | `/v1/claims/:id/delete` | User | — | — |
| 19 | POST | `/v1/tokens/refresh` | None (token is credential) | — | — |

**Deliberately absent:**
- `DELETE /claims/:id` — the kernel doesn't model claims as CRUD objects
- `PUT /claims/:id` — claims version, they don't overwrite
- `GET /claims` (bulk) — apps access claims through `GET /context` or individual `GET /claims/:id`
- Any endpoint that takes `passport_id` in the request body for authorization — passport is always derived from the authenticated credential

---

## Server-Determined Fields (Mass Assignment Protection)

The API MUST reject or silently ignore these fields if present in request bodies:

| Entity | Server-Determined Fields |
|--------|------------------------|
| Passport | `id`, `account_id`, `created_at`, `binding_ids`, `bridge_ids` |
| Binding | `id`, `status`, `revision`, `created_at`, `current_grant_id` |
| Grant | `id`, `version`, `consent_record_id`, `consented_at`, `active`, `supersedes_grant_id` |
| Observation | `id`, `binding_id`, `outcome`, `submitted_at` |
| Evidence | ALL fields (never directly created by API clients) |
| Claim | ALL fields (created by write pipeline, not API clients) |
| ClaimVersion | ALL fields (created by pipeline/user actions) |
| UserMemoryEvent | ALL fields (created by user action endpoints) |
| AccessEvent | ALL fields (created by audit system) |
| TokenFamily | ALL fields (created by binding flow) |

**Rule:** If a client sends `"id": "evil_id"` in a POST body, the API MUST NOT use that value. The server generates all IDs.

---

## Capability → Endpoint Mapping

| Capability | Endpoints |
|------------|-----------|
| `read_context` | `GET /v1/context` |
| `read_claims` | `GET /v1/claims/:id` |
| `read_versions` | (future: `GET /v1/claims/:id/versions`) |
| `read_evidence` | (future: `GET /v1/claims/:id/evidence`) |
| `write_claims` | `POST /v1/observations` |
| `update_own_claims` | (future: `POST /v1/observations/:id/update`) |
| `retract_own_observation` | `POST /v1/observations/:id/retract` |
| `write_experiences` | (future: `POST /v1/experiences`) |
| `read_experiences` | (future: `GET /v1/experiences`) |
| `request_elevation` | `POST /v1/bindings/:id/grants` (app-initiated) |

No endpoint exists without an explicit capability mapping. No capability grants access to endpoints not listed here.

---

*The API is a membrane. The kernel is the immune system. This contract defines the membrane's pores — nothing more.*
