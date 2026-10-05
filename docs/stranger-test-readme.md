# Memory Layer API — External Developer Guide

You have been given access to the Memory Layer API — a universal memory
service that any AI application can plug into. This document describes the
**deployed API as it actually works**.

## Quick Start

### 1. Exchange Your Refresh Token for an Access Token

```bash
curl -s -X POST "$API_URL/v1/tokens/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "YOUR_REFRESH_TOKEN"}' | jq .
```

Response:

```json
{
  "data": {
    "access_token": "app|...|...|0|2026-10-05T20:00:00.000Z",
    "access_token_expires_at": "2026-10-05T20:00:00.000Z",
    "refresh_token": "refresh|...|1",
    "token_type": "Bearer"
  },
  "meta": {
    "request_id": "req_...",
    "policy_version": "v0.1.0"
  }
}
```

**Save both tokens.** The old refresh token is now dead. Use the new
`refresh_token` next time you need a fresh access token.

### 2. Store an Observation

```bash
curl -s -X POST "$API_URL/v1/observations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "idempotency_key": "my-first-obs",
    "subject": "user",
    "predicate": "prefers",
    "value": "dark mode",
    "declared_category": "preferences",
    "declared_sensitivity": "public",
    "extraction_method": "user_stated",
    "raw_context": "User said they prefer dark mode"
  }' | jq .
```

Response (201 Created):

```json
{
  "data": {
    "observation_id": "uuid",
    "outcome": {
      "status": "accepted",
      "evidence_id": "uuid",
      "claim_id": "uuid"
    }
  },
  "meta": {
    "request_id": "req_...",
    "policy_version": "v0.1.0"
  }
}
```

### 3. Read Your Context

```bash
curl -s "$API_URL/v1/context" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

Response:

```json
{
  "data": {
    "items": [
      {
        "claim_id": "uuid",
        "category": "preferences",
        "sensitivity": "public",
        "summary": "user prefers dark mode",
        "confidence_band": "medium"
      }
    ],
    "generated_at": "2026-10-05T19:00:00.000Z",
    "policy_version": "v0.1.0"
  },
  "meta": {
    "request_id": "req_...",
    "policy_version": "v0.1.0"
  }
}
```

## API Reference

All responses use the envelope: `{ "data": {...}, "meta": { "request_id", "policy_version" } }`

All POST endpoints require `Content-Type: application/json`.

### No Authentication Required

| Endpoint | Method | Description |
|---|---|---|
| `/v1/tokens/refresh` | POST | Exchange refresh token for access + new refresh |
| `/` | GET | Service info |
| `/health` | GET | Health check |

### App Authentication (Bearer access token)

| Endpoint | Method | Description |
|---|---|---|
| `/v1/observations` | POST | Store an observation about the user |
| `/v1/observations/:id/retract` | POST | Retract your own observation |
| `/v1/context` | GET | Read derived claims as context items |
| `/v1/claims/:id` | GET | Read a single claim by ID |
| `/v1/bindings` | GET | Read your binding info |

## Token Refresh

**Request:**

```json
{
  "refresh_token": "refresh|<family_id>|<generation>"
}
```

- `refresh_token` (string, required): Your current refresh token.

**Response (200):**

```json
{
  "data": {
    "access_token": "app|...",
    "access_token_expires_at": "ISO-8601",
    "refresh_token": "refresh|...|<next_generation>",
    "token_type": "Bearer"
  }
}
```

**Error cases:**
- Missing or non-string `refresh_token` → 400 `VALIDATION_ERROR`
- Malformed token → 401 `TOKEN_INVALID`
- Reusing an already-rotated refresh token → 401 `TOKEN_REUSE_DETECTED` (entire family revoked)

## Store Observation

**POST** `/v1/observations`

**Required fields:**

| Field | Type | Description |
|---|---|---|
| `idempotency_key` | string | Client-generated unique key for this observation |
| `subject` | string | Who or what the observation is about |
| `predicate` | string | The relationship (e.g. "prefers", "knows", "struggles_with") |
| `value` | string | The fact (e.g. "dark mode", "Python", "calculus") |
| `declared_category` | string | One of: `skills`, `preferences`, `goals`, `projects`, `behavioral_patterns`, `emotional_patterns`, `personal_context` |
| `declared_sensitivity` | string | One of: `public`, `personal`, `sensitive`, `restricted` |
| `extraction_method` | string | One of: `user_stated`, `app_measured`, `model_inferred` |
| `raw_context` | string | The original context that produced this observation |

**Optional fields:**

| Field | Type | Description |
|---|---|---|
| `experience_id` | string | Group observations from the same interaction |
| `qualifiers` | object | Additional key-value metadata |
| `purpose` | string | Why this observation is being stored |

**Forbidden fields** (server-determined, will be rejected if included):
`id`, `binding_id`, `outcome`, `submitted_at`

**Validation rules:**
- All required fields must be present and must be strings.
- `declared_category` must be one of the 7 valid categories listed above.
- `declared_sensitivity` must be one of the 4 valid sensitivities listed above.
- `extraction_method` must be one of: `user_stated`, `app_measured`, `model_inferred`.

**Response (201):** Outcome status is one of `accepted`, `merged`, or `quarantined`.

```json
{
  "data": {
    "observation_id": "uuid",
    "outcome": {
      "status": "accepted",
      "evidence_id": "uuid",
      "claim_id": "uuid"
    }
  }
}
```

## Retract Observation

**POST** `/v1/observations/:id/retract`

Retracts an observation you previously submitted. The `:id` must be a valid
UUID of an observation owned by your binding.

**Response (200):**

```json
{
  "data": {
    "observation_id": "uuid",
    "evidence_id": "uuid or null",
    "evidence_status": "retracted"
  }
}
```

## Read Context

**GET** `/v1/context`

Returns derived claims as context items. This is the primary read endpoint.

**Query parameters (optional):**

| Parameter | Description |
|---|---|
| `categories` | Comma-separated list of categories to filter by (defaults to grant's read categories) |
| `purpose` | Purpose of the context read |

**Response (200):**

```json
{
  "data": {
    "items": [
      {
        "claim_id": "uuid",
        "category": "preferences",
        "sensitivity": "public",
        "summary": "user prefers dark mode",
        "confidence_band": "medium"
      }
    ],
    "generated_at": "ISO-8601",
    "policy_version": "v0.1.0"
  }
}
```

**Note on `confidence_band`:** This is derived from the claim's internal
state, not from any input confidence value. A single observation produces
state `OBSERVED` → `"medium"` confidence band. Multiple corroborating
observations can raise it to `"high"`. Conflicting observations produce
`"low"`.

## Read Single Claim

**GET** `/v1/claims/:id`

Returns a single claim by its UUID. The claim must belong to your passport
and be within your grant's allowed categories and sensitivity ceiling.

**Response (200):**

```json
{
  "data": {
    "id": "uuid",
    "subject": "user",
    "predicate": "prefers",
    "value": "dark mode",
    "qualifiers": {},
    "category": "preferences",
    "state": "OBSERVED",
    "volatility": "stable",
    "sensitivity": "public",
    "created_at": "ISO-8601",
    "updated_at": "ISO-8601",
    "current_version_id": "uuid"
  }
}
```

## Read Binding

**GET** `/v1/bindings`

Returns your current binding information.

**Response (200):**

```json
{
  "data": {
    "id": "uuid",
    "status": "active",
    "revision": 1,
    "current_grant_id": "uuid",
    "created_at": "ISO-8601"
  }
}
```

## Token Security Model

- **Access tokens** expire after 1 hour.
- **Refresh tokens** are single-use. Each refresh gives you a NEW refresh
  token and invalidates the old one.
- **Token reuse detection:** If you attempt to use an already-rotated
  refresh token, the entire token family is revoked as a security measure.
  You will receive a 401 `TOKEN_REUSE_DETECTED` error.
- Each tester has their own isolated token family.

## Error Format

All errors follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "request_id": "req_..."
  }
}
```

**Common error codes:**

| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing or invalid field |
| `TOKEN_INVALID` | 401 | Bad or missing access/refresh token |
| `TOKEN_EXPIRED` | 401 | Access token has expired |
| `TOKEN_REUSE_DETECTED` | 401 | Stale refresh token used, family revoked |
| `NOT_FOUND` | 404 | Resource does not exist or is not accessible |
| `INTERNAL_ERROR` | 500 | Server error (report this) |

## Rules of the Test

1. You have **your credentials only** — no admin access, no dashboard.
2. The API is the only interface. No backdoors, no shortcuts.
3. If something breaks, note the HTTP status, the response body, and what you did.
4. Try to break it. Edge cases, weird inputs, rapid-fire requests — all fair game.
5. Do NOT share your credentials with anyone else.

## Reporting

Document what worked, what didn't, and what surprised you:

- **Worked as expected**: list of operations that went smoothly
- **Broke / unexpected**: exact curl command + response
- **Confusing**: anything where the API behavior wasn't obvious
- **Missing**: anything you expected but wasn't there
