# Memory Passport Protocol Specification v0.1

**Status:** LOCKED — All sections pressure-tested through adversarial review. Implementation pending.

This document defines the core protocol for Memory Passport: a portable AI identity protocol with permissioned access. Every design decision here survived multiple rounds of hostile architectural review. Changes require a new version, not edits to locked sections.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Core Entities](#2-core-entities)
3. [Memory Object Model](#3-memory-object-model)
4. [Reconciliation Protocol](#4-reconciliation-protocol)
5. [Identity Model](#5-identity-model)
6. [Binding & Permission Protocol](#6-binding--permission-protocol)
7. [Retrieval Pipeline](#7-retrieval-pipeline)
8. [Security Model](#8-security-model)
9. [Data Lifecycle & Erasure](#9-data-lifecycle--erasure)
10. [Protocol Invariants](#10-protocol-invariants)
11. [Design Principles](#11-design-principles)
12. [Implementation Roadmap](#12-implementation-roadmap)

---

## 1. Overview

### The Problem

Every AI app has amnesia. Users re-explain themselves every session. No continuity across tools. Memory that exists is siloed per-platform and owned by companies, not users.

### The Solution

Memory Passport is a protocol where:
- **Users own** their AI memory across all apps
- **Apps request access** to memory categories via structured bindings
- **Memory is portable** — switch apps, keep your context
- **Memory is structured** — semantic claims with evidence, provenance, and reconciliation

### Positioning

Compete ABOVE Mem0/Zep (identity + permissions + portability), not below (memory infrastructure). Different architecture for a different customer: Mem0 sells to developers, Memory Passport gives sovereignty to users.

### What This Protocol Actually Is

Not a memory database with an SDK. Five interconnected systems:

```
IDENTITY → AUTHORIZATION → PROVENANCE → RECONCILIATION → CONTEXT
```

Memory is the data. The protocol is the control plane.

---

## 2. Core Entities

Seven first-class entities. Each has a clear responsibility.

```
Observation → Evidence → Claim → ClaimVersion
Experience (raw sessions)
AccessEvent (audit)
UserMemoryEvent (user actions)
```

### 2.1 Experience

A raw interaction record. What happened in one session.

```typescript
interface Experience {
  id: string;
  passport_id: string;
  app_id: string;
  binding_id: string;
  started_at: ISO8601;
  ended_at: ISO8601 | null;
  duration_seconds: number;
  context: Record<string, unknown>;
  summary: string;
  tags: string[];
}
```

Experiences are raw data. Never shared cross-app. They feed Observations.

### 2.2 Observation

The boundary between "what an app said" and "what Memory Layer believes." Apps submit Observations, not Claims.

```typescript
interface Observation {
  id: string;
  idempotency_key: string;          // UNIQUE(binding_id, idempotency_key) — prevents replay/retry duplication
  binding_id: string;
  experience_id: string | null;

  subject: string;
  predicate: string;
  value: string;
  qualifiers: Record<string, string>;

  declared_sensitivity: Sensitivity;
  declared_category: ClaimCategory;

  extraction_method: "user_stated" | "app_measured" | "model_inferred";
  raw_context: string;
  submitted_at: ISO8601;

  outcome: ObservationOutcome | null;
}

type ObservationOutcome =
  | { status: "accepted"; evidence_id: string; claim_id: string }
  | { status: "rejected"; reason: string }
  | { status: "quarantined"; reason: string; requires_user_action: true }
  | { status: "merged"; existing_claim_id: string; evidence_id: string };
```

Observations are stored as-is. The Evidence and Claim that result from processing are Memory Layer's interpretation. These are never conflated.

### 2.3 Evidence

A piece of support for a Claim. Every Claim must have at least one Evidence record. Evidence carries provenance and is immutable — it can be retracted but never deleted.

```typescript
interface Evidence {
  id: string;
  claim_id: string;
  observation_id: string | null;
  source_type: EvidenceTier;
  app_id: string;
  experience_id: string | null;
  observed_at: ISO8601;
  raw_observation: string;
  extraction_method: string;
  first_party: boolean;              // true when observer is the subject of the claim's app context
  lineage: EvidenceLineage;
  status: EvidenceStatus;
  retracted_at: ISO8601 | null;
  retraction_reason: string | null;
  provenance_status: ProvenanceStatus;
}

type EvidenceStatus = "active" | "retracted";
type ProvenanceStatus = "active" | "retracted" | "purged";

interface EvidenceLineage {
  origin_app_id: string;
  origin_experience_id: string;
  chain: string[];
}
```

**Evidence Tiers (1–5, lower number = stronger):**

| Tier | Source | Example |
|------|--------|---------|
| 1 | User Correction | User explicitly fixes a claim |
| 2 | User Statement | User says "I know Python" |
| 3 | Multi-App Consensus | 3+ independent apps agree |
| 4 | Single App Assertion | One app's observation |
| 5 | Model Inference | AI inferred from behavior |

Tier 1 always wins. Consensus (Tier 3) requires independent evidence chains — same-lineage evidence from multiple apps counts as one source, preventing Sybil attacks.

**Retraction:** An app can retract its own observation. Evidence status → `"retracted"`. Retracted evidence does not participate in reconciliation but is never deleted — the immutable record that it existed and was withdrawn remains.

### 2.4 Claim

A semantic assertion about the user. The core unit of memory.

```typescript
interface Claim {
  id: string;
  passport_id: string;

  // Semantic triple
  subject: string;
  predicate: string;
  value: string;
  qualifiers: Record<string, string>;

  // Indexing (projections, not core)
  category: ClaimCategory;
  tags: string[];

  // State
  state: ClaimState;
  declared_state: ClaimState | null;
  observed_state: ClaimState | null;

  // Temporal
  volatility: Volatility;
  created_at: ISO8601;
  updated_at: ISO8601;
  last_confirmed_at: ISO8601 | null;
  expires_at: ISO8601 | null;

  // Privacy (two independent dimensions)
  sensitivity: Sensitivity;
  sharing_policy: SharingPolicy;

  // Evidence
  evidence_ids: string[];
  purged_references: PurgedProvenanceRecord[];
  contradicted_by: string[];

  current_version_id: string;
}
```

**Claim States:**

```typescript
type ClaimState =
  | "DECLARED"      // user explicitly stated
  | "SUPPORTED"     // multiple evidence sources agree
  | "OBSERVED"      // single app observed
  | "CONTESTED"     // conflicting evidence exists
  | "UNKNOWN"       // cannot determine — valid final state, not error
  | "UNSUPPORTED"   // all supporting evidence retracted or purged
  | "STALE"         // not confirmed recently
  | "EXPIRED";      // past explicit expiration
```

**UNKNOWN is a valid state.** The system does not guess when it doesn't know.

**Declared vs Observed:** Both persist independently. If a user says "I know Python" (DECLARED) but apps observe struggling (OBSERVED as CONTESTED), both states exist. Neither silently overwrites the other. The retrieval pipeline decides which to serve based on context.

**Sensitivity and Sharing Policy are independent dimensions:**

```typescript
type Sensitivity = "public" | "personal" | "sensitive" | "restricted";

type SharingPolicy =
  | { type: "grant_controlled" }
  | { type: "explicit_only"; approved_binding_ids: string[] }
  | { type: "user_only" };
```

Sensitivity is classification (what kind of data). Sharing policy is authorization (who can see it). Changing sensitivity does NOT change sharing policy. A user can have a `personal`-classified claim with `user_only` sharing.

**Defaults by sensitivity:**
- `public` / `personal` → `grant_controlled`
- `sensitive` → `grant_controlled` (requires ceiling ≥ sensitive)
- `restricted` → `explicit_only` (per-claim or per-category user approval required)

**Categories (indexes, not core structure):**

```typescript
type ClaimCategory =
  | "skills"
  | "preferences"
  | "goals"
  | "projects"
  | "behavioral_patterns"
  | "emotional_patterns"
  | "personal_context";
```

**Category sensitivity floors:**

```typescript
const CATEGORY_SENSITIVITY_FLOORS: Record<ClaimCategory, Sensitivity> = {
  skills:              "public",
  preferences:         "public",
  goals:               "personal",
  projects:            "personal",
  behavioral_patterns: "personal",
  emotional_patterns:  "sensitive",
  personal_context:    "personal",
};
```

**Volatility:**

```typescript
type Volatility = "stable" | "slow_changing" | "dynamic" | "ephemeral";
```

**Purged provenance:**

```typescript
interface PurgedProvenanceRecord {
  original_evidence_id: string;
  purged_at: ISO8601;
  provenance_status: "PURGED";
}
```

When evidence is purged, downstream claims retain a record that evidence existed. The content is gone, but the provenance graph is not broken.

### 2.5 ClaimVersion

Claims evolve. Every change creates an immutable version.

```typescript
interface ClaimVersion {
  id: string;
  claim_id: string;
  version_number: number;
  previous_version_id: string | null;
  value: string;
  qualifiers: Record<string, string>;
  state: ClaimState;
  changed_by: string;
  changed_at: ISO8601;
  change_reason: string;
  evidence_ids: string[];
}
```

### 2.6 UserMemoryEvent

Users don't directly mutate claims. They perform memory actions, each creating an immutable event.

```typescript
type UserMemoryAction =
  | "CONFIRM"       // adds Tier 1 evidence confirming current value
  | "CORRECT"       // adds Tier 1 evidence with new value, creates new ClaimVersion
  | "OVERRIDE"      // sets DECLARED state, original observations preserved
  | "DELETE"        // tombstones claim — reversible, evidence retained
  | "RECLASSIFY"    // sensitivity/sharing change, no value change
  | "DISPUTE";      // marks CONTESTED, surfaces for review

interface UserMemoryEvent {
  id: string;
  claim_id: string;
  action: UserMemoryAction;
  previous_value: string | null;
  new_value: string | null;
  previous_sensitivity: Sensitivity | null;
  new_sensitivity: Sensitivity | null;
  performed_at: ISO8601;
  creates_evidence_id: string | null;
  creates_version_id: string | null;
}
```

DELETE tombstones a claim. PURGE (see Section 9) is a separate account-level operation that destroys data.

### 2.7 AccessEvent

Audit trail. Every time a claim is served to an app.

```typescript
interface AccessEvent {
  id: string;
  binding_id: string;
  grant_id: string;
  credential_id: string;
  capability_used: Capability;
  categories_accessed: ClaimCategory[];
  claims_served: string[];
  claims_served_count: number;
  sensitivity_levels_touched: Sensitivity[];
  accessed_at: ISO8601;
  request_context: string | null;
  policy_version: string;
  grant_version: number;
  binding_revision: number;
}
```

---

## 3. Memory Object Model

### 3.1 What's on the Claim vs What's Not

**ON the Claim:** subject, predicate, value, qualifiers, category (index), tags (index), state, declared_state, observed_state, volatility, sensitivity, sharing_policy, temporal fields, evidence references, purged references.

**NOT on the Claim:**
- `confidence: number` — Computed at retrieval from evidence signals. Never stored.
- `importance: number` — Relevance is query-dependent. Computed at retrieval.
- `embedding: float[]` — Index projection, stored in a search index.
- `search_text: string` — Index projection, generated from semantic triple.
- `scopes: string[]` — Scopes are a permission-layer concept, not a memory property.

### 3.2 Confidence Computation (at retrieval)

```
confidence(claim) = f(
  highest_evidence_tier,
  number_of_confirming_sources,
  number_of_independent_lineages,
  time_since_last_confirmation,
  contradiction_count,
  volatility
)
```

The function is deterministic and version-controlled.

### 3.3 Index Layer

Separate from claims. Rebuilt from claim data. Losing indexes loses performance, not data.

### 3.4 Sensitivity Classification (who assigns)

Three inputs, most-restrictive wins:

1. App-declared sensitivity (at observation submission)
2. System classifier (pattern-based in v1)
3. Category floor (structural minimum)

Result = highest of all three. Apps can't sneak sensitive data into public claims. Users can upgrade sensitivity (always) or downgrade (always, including below category floor — it's their data). But downgrading sensitivity does NOT change sharing policy.

If classification result = `restricted`, the claim enters quarantine — stored but not served until the user explicitly releases it.

---

## 4. Reconciliation Protocol

### 4.1 Write Pipeline (Observation → Claim)

```
App submits Observation
  → Idempotency check (UNIQUE binding_id + idempotency_key)
  → Protocol namespace check (HARD REJECT if reserved subject/predicate)
  → Capability check (binding has write_claims?)
  → Category check (category in write data policy?)
  → Rate limit check (over quota?)
  → Semantic budget check (unique claims/category, same-tuple interval)
  → Evidence validation (has raw_context + extraction_method?)
  → Sensitivity classification (3-input, most-restrictive-wins)
  → Sensitivity ceiling check (post-classification > binding ceiling? REJECT)
  → Self-referential check (flag first_party, cap evidence tier)
  → Dedup check (existing equivalent claim? merge evidence : create new)
  → Contradiction detection
  → Resolution (if contradiction found)
  → App reliability metrics update
  → Observation.outcome filled
```

### 4.2 Protocol Namespace Separation

Two architecturally separate stores:

```
USER MEMORY NAMESPACE: "user.*"
  user/knows/Python
  user/prefers/examples
  user/working_on/React project

PROTOCOL NAMESPACE: "protocol.*"
  protocol/binding/authorized
  protocol/passport/owner
  protocol/consent/granted
```

Apps have zero write access to the protocol namespace. This is not a denylist — it's two different stores. App writes go through the Observation pipeline targeting the user memory store. Protocol state is written by Memory Layer internals through a separate code path.

### 4.3 Contradiction Detection

Two claims contradict when:
- Same subject + same predicate + different value
- AND qualifiers don't differentiate them (temporal, contextual)

Qualifier-aware: "Prefers React (for web)" and "Prefers SwiftUI (for mobile)" are NOT contradictions. "Prefers React (in 2024)" and "Prefers Vue (in 2025)" are NOT contradictions.

### 4.4 Resolution Rules (priority order)

1. **Tier 1 wins.** User correction beats everything. Always.
2. **Tier 2 vs Tier 4+.** User statement beats single app assertion or model inference.
3. **Consensus vs single.** Multi-app consensus (Tier 3) beats single app (Tier 4), but ONLY with independent evidence lineages.
4. **Recency breaks ties.** Within the same tier only. Not across tiers.
5. **Surface to user.** When no rule resolves it → CONTESTED or UNKNOWN. UNKNOWN is a valid final state.

### 4.5 Declared vs Observed State

Both persist independently. Neither silently overwrites the other.

### 4.6 App Reliability Metrics

Not hidden trust scores. Exposed, queryable:

```typescript
interface AppReliability {
  app_id: string;
  claims_created: number;
  claims_confirmed: number;
  claims_corrected: number;
  correction_rate: number;
  sample_size: number;
  observation_window: ISO8601Range;
}
```

Correction rate is a **signal**, not an automatic trigger. High correction rate → graduated rate limit reduction (automatic, transparent). Sustained patterns → platform review queue (manual). Never automatic suspension from metrics alone.

### 4.7 Evidence Lineage (Anti-Sybil)

Consensus requires independent observation chains. Evidence derived from another app's evidence (via lineage chain) doesn't count as independent. Three apps reporting the same thing only counts as consensus if at least three independent lineages exist.

### 4.8 Self-Referential Claims

Structural provenance handles this, not text classification:

- Every observation carries `first_party: boolean` — structurally known because the system knows which app submitted it
- First-party evidence: tier capped at 5, lower default weight in retrieval, flagged in user dashboard
- Keyword detection against app name/domain runs as an additional signal, not a security gate
- Apps legitimately write first-party observations ("User completed our Python course") — these aren't blocked, they're marked

### 4.9 Reconciliation After Retraction

When an app retracts an observation:

```
Evidence status → "retracted"
  → Reconciliation re-runs on affected claim
  → Recompute from all active (non-retracted) evidence
  → Other evidence supports claim? → claim persists
  → No remaining evidence? → state → UNSUPPORTED
  → User's own evidence → ALWAYS survives retraction
```

### 4.10 Reconciliation After Purge

When evidence is purged (Section 9):

```
Evidence destroyed
  → PurgedProvenanceRecord added to affected claims
  → Reconciliation re-runs
  → Recompute from remaining active evidence
  → Claim may persist, change state, or become UNSUPPORTED
```

---

## 5. Identity Model

### 5.1 Account

Authentication only.

```typescript
interface Account {
  id: string;
  auth_provider: string;
  auth_id: string;
  email: string;
  created_at: ISO8601;
  passport_ids: string[];
}
```

### 5.2 Passport

The memory container.

```typescript
interface Passport {
  id: string;
  account_id: string;
  name: string;
  created_at: ISO8601;
  is_ephemeral: boolean;
  device_id: string | null;
  binding_ids: string[];
  bridge_ids: string[];
}
```

- Multiple passports per account. Isolation by default.
- Passports are organizational, not security boundaries. Bindings are the security boundary.

### 5.3 Ephemeral Session Passports

```typescript
interface EphemeralPassport extends Passport {
  is_ephemeral: true;
  device_id: string;
  expires_at: ISO8601;
  promotable: boolean;
}
```

Device-bound, non-portable, temporary, promotable with explicit user confirmation. Promotion requires: create/sign into Account → explicitly confirm → review what's being promoted.

### 5.4 Bridges

User-created links between passports for selective claim sharing.

```typescript
interface Bridge {
  id: string;
  source_passport_id: string;
  target_passport_id: string;
  direction: "one_way" | "bidirectional";
  created_at: ISO8601;
  created_by: string;
  scope: BridgeScope;
  status: "active" | "paused" | "revoked";
}

interface BridgeScope {
  categories: ClaimCategory[];
  sensitivity_ceiling: Sensitivity;
  claim_filter: string | null;
}
```

Explicit, scoped, directional, revocable, provenance-preserving. Bridged claims retain origin passport — they do NOT silently become owned claims.

### 5.5 Auth Modes

**Mode A (v1):** App has own auth, user connects Memory Passport separately.
**Mode B (v2, deferred):** "Sign in with Memory" as OAuth provider. Requires SOC 2 + security infrastructure.

---

## 6. Binding & Permission Protocol

### 6.1 Three-Layer Authorization Model

```
Binding — the relationship (app ↔ passport)
BindingGrant — the versioned permission snapshot
Credential — the authentication mechanism
```

### 6.2 Binding

```typescript
interface Binding {
  id: string;
  passport_id: string;
  app_principal_id: string;
  status: BindingStatus;
  current_grant_id: string;
  revision: number;                  // incremented on every state change — revocation ordering
  created_at: ISO8601;
  suspended_at: ISO8601 | null;
  revoked_at: ISO8601 | null;
  suspension_type: SuspensionType | null;
}

type BindingStatus = "active" | "suspended" | "revoked";

type SuspensionType =
  | "user_paused"                    // user can restore
  | "platform_rate_violation"        // auto-restores after cooldown
  | "platform_security"             // platform review required — user CANNOT override
  | "platform_abuse"                // platform review required — user CANNOT override
  | "ownership_transfer";           // user re-consent required
```

### 6.3 BindingGrant (versioned permissions)

```typescript
interface BindingGrant {
  id: string;
  binding_id: string;
  version: number;
  capabilities: Capability[];
  data_policy: DataPolicy;
  authorized_purposes: string[];
  consent_record_id: string;
  consented_at: ISO8601;
  consent_method: "initial_auth" | "upgrade_prompt" | "downgrade_silent" | "reauthorization";
  supersedes_grant_id: string | null;
  active: boolean;
}
```

### 6.4 Capability Model (verbs)

```typescript
type Capability =
  // Read (ordered by privacy impact)
  | "read_context"              // compressed, actionable summary — the 95% path
  | "read_claims"               // individual claim records
  | "read_versions"             // claim change history
  | "read_evidence"             // evidence behind claims (HIGH privilege)

  // Write
  | "write_claims"              // submit observations that become evidence
  | "update_own_claims"         // modify observations this app created
  | "retract_own_observation"   // retract an observation (evidence → RETRACTED)

  // Lifecycle
  | "write_experiences"         // write experience records
  | "read_experiences"          // read this app's own experiences
  | "request_elevation";        // ask user for higher permissions
```

NOT capabilities: `export` (user-only), `create_bridge` (user-only), `revoke_binding` (user-only), `promote_passport` (user-only).

### 6.5 Data Policy Model (nouns + constraints)

```typescript
interface DataPolicy {
  read: ReadPolicy;
  write: WritePolicy;
}

interface ReadPolicy {
  categories: ClaimCategory[];
  sensitivity_ceiling: Sensitivity;
}

interface WritePolicy {
  categories: ClaimCategory[];
  sensitivity_ceiling: Sensitivity;
  rate_limit: WriteRateLimit;
  semantic_limits: SemanticWriteLimits;
  evidence_required: true;           // always true, not configurable
}

interface WriteRateLimit {
  max_observations_per_hour: number;
  max_observations_per_day: number;
  max_per_request: number;
}

interface SemanticWriteLimits {
  max_new_claims_per_category_per_day: number;
  min_interval_same_tuple_hours: number;
  max_active_claims_per_category: number;
}
```

**The actual permission = capability × data_policy.** Two orthogonal dimensions.

### 6.6 Read Access Levels

| Capability | App gets | App does NOT get | Timestamps? |
|---|---|---|---|
| `read_context` | Compressed natural-language summary | Claim IDs, structure, provenance | No |
| `read_claims` | Individual claims (subject/predicate/value/state) | Evidence, source apps | Claim created_at/updated_at only |
| `read_versions` | Claim change history | Evidence, source apps | Version changed_at |
| `read_evidence` | Evidence records (tier, method) | Source app_id (always redacted cross-app) | Full evidence timestamps |

Cross-app timestamp redaction prevents temporal side-channel attacks.

### 6.7 Write Protections

1. Rate limits — per-binding hard limits
2. Semantic limits — claims/category/day, same-tuple intervals, active claim caps
3. Evidence required — no bare assertions
4. Category-scoped — can't write outside granted categories
5. Sensitivity-capped — can't create above ceiling (post-classification)
6. Provenance attached — every claim knows which app created it
7. Write ≠ overwrite — creates new evidence, reconciliation handles conflicts
8. Correction asymmetry — apps submit Tier 4–5, only users issue Tier 1
9. Protocol namespace — apps cannot write protocol state (architectural separation)

**Unverified app limits:**

| | Unverified | Verified |
|---|---|---|
| Rate | 10/hour, 50/day | 100/hour, 1000/day |
| New claims/category/day | 5 | 50 |
| Same-tuple interval | 24 hours | 1 hour |
| Active claims/category | 50 | 500 |
| Sensitivity ceiling | personal | sensitive |

These limits bound poisoning blast radius. They do not prevent it entirely — an unverified app can still accumulate up to 350 active claims. The mitigation: provenance is visible to users, correction rate rises on bad claims.

### 6.8 Purpose Templates

Deterministic capability ceilings. Purpose → allowed capabilities/categories/sensitivity.

```typescript
interface PurposeTemplate {
  id: string;
  name: string;
  description: string;
  max_capabilities: Capability[];
  max_read_categories: ClaimCategory[];
  max_write_categories: ClaimCategory[];
  max_sensitivity: Sensitivity;
}
```

**v1 templates:**

| Purpose | Max Read | Max Write | Max Sensitivity |
|---|---|---|---|
| `coding_assistance` | read_context, read_claims; skills, projects, preferences | skills | personal |
| `tutoring` | read_context, read_claims; skills, goals, preferences, behavioral_patterns | skills, goals | personal |
| `health_monitoring` | read_context, read_claims; behavioral_patterns, personal_context | behavioral_patterns | sensitive |
| `journaling` | read_context; emotional_patterns, goals, preferences | emotional_patterns, goals | sensitive |
| `general_assistant` | read_context; skills, preferences, projects | preferences | personal |

**Enforcement:** `isGrantWithinPurpose(grant, authorizedPurposes)` — deterministic check. Grant capabilities/categories/sensitivity must fit within the union of authorized purposes' ceilings. No AI, no judgment calls.

Purpose templates are platform-controlled security ceilings, not developer-defined permission bundles. Custom purposes require platform review.

No app can request `sensitivity_ceiling: restricted`. Restricted claims are user-managed.

### 6.9 Consent Model

```typescript
interface ConsentRecord {
  id: string;
  binding_id: string;
  grant_id: string;
  grant_version: number;
  consented_at: ISO8601;
  consent_type: "initial" | "expansion" | "reduction" | "reauthorization";
  capabilities_granted: Capability[];
  data_policy_granted: DataPolicy;
  delta_from_previous: GrantDelta | null;
  presented_to_user: ConsentPresentation;
}
```

**Grant delta with formal expansion detection:**

```typescript
interface GrantDelta {
  added_capabilities: Capability[];
  removed_capabilities: Capability[];
  added_read_categories: ClaimCategory[];
  removed_read_categories: ClaimCategory[];
  added_write_categories: ClaimCategory[];
  removed_write_categories: ClaimCategory[];
  read_sensitivity_change: { from: Sensitivity; to: Sensitivity } | null;
  write_sensitivity_change: { from: Sensitivity; to: Sensitivity } | null;
  added_purposes: string[];
  removed_purposes: string[];
  expiration_changes: { capability: Capability; from: ExpirationRule; to: ExpirationRule }[] | null;
  restricted_approval_changes: any | null;
}

function isExpansion(delta: GrantDelta): boolean {
  // Returns true if ANY security-relevant dimension expanded:
  // capabilities, categories, sensitivity, purposes, duration/expiration,
  // restricted approval scope
  // This function must be updated when new grant dimensions are added
}
```

**Rules:**
- `isExpansion() === true` → requires user consent
- `isExpansion() === false` → silent downgrade allowed
- Purpose change → always requires consent
- No retroactive expansion

### 6.10 Restricted Claim Approval

Three granularities:

```typescript
type RestrictedApprovalGranularity =
  | {
      type: "claim_version";
      claim_id: string;
      claim_version_id: string;      // bound to THIS version
      expires_at: null;              // persists until revoked
    }
  | {
      type: "claim_lineage";
      claim_id: string;             // covers ALL versions
      expires_at: ISO8601;          // MUST expire
    }
  | {
      type: "category";
      category: ClaimCategory;
      sensitivity: "restricted";
      expires_at: ISO8601;          // MUST expire, max 90 days
    };
```

When a claim version changes, `claim_version` approval does NOT cover the new version. User must re-approve. `claim_lineage` covers all versions but must expire. Broader scope = shorter lifetime.

### 6.11 Expiration Model

Principle: risk of undetected misuse × impact → determines reauthorization frequency.

```typescript
type ExpirationRule =
  | { type: "until_revoked" }
  | { type: "periodic"; interval_days: number }
  | { type: "one_time" };
```

| Capability | Sensitivity ≤ personal | Sensitivity = sensitive |
|---|---|---|
| `read_context` | Until revoked | Periodic (90 days) |
| `read_claims` | Until revoked | Periodic (90 days) |
| `read_versions` | Periodic (90 days) | Periodic (30 days) |
| `read_evidence` | Periodic (30 days) | Periodic (30 days) |
| `write_claims` | Until revoked | Periodic (90 days) |

### 6.12 App Identity

```typescript
interface DeveloperAccount {
  id: string;
  email: string;
  domain: string | null;
  verification_status: "unverified" | "verified";
  registered_at: ISO8601;
}

interface AppPrincipal {
  id: string;                        // immutable, system-assigned
  developer_id: string;
  name: string;
  domain: string | null;
  description: string;
  declared_purposes: Purpose[];
  status: "active" | "suspended" | "banned";
  registered_at: ISO8601;
  ownership_history: OwnershipRecord[];
}

interface OwnershipRecord {
  developer_id: string;
  from: ISO8601;
  to: ISO8601 | null;
}
```

Two verification levels only: unverified (email confirmed) and verified (email + DNS challenge). No "Trusted Enterprise" tier — that's a hidden trust score.

Bindings reference the immutable AppPrincipal ID, not the developer.

### 6.13 Ownership Transfer

On developer change:

```typescript
interface OwnershipTransfer {
  app_principal_id: string;
  previous_developer_id: string;
  new_developer_id: string;
  transferred_at: ISO8601;
  invalidated: {
    user_bindings: "suspended_all";
    developer_api_keys: "revoked_all";
    signing_credentials: "revoked_all";
    deployment_tokens: "revoked_all";
    webhook_endpoints: "deregistered_all";
  };
}
```

All bindings suspended. All developer credentials invalidated. Users must re-consent (full consent screen with new developer identity). New developer starts from clean credential state.

### 6.14 Revocation

**User clicks "Disconnect":**

1. `Binding.status` → `"revoked"`, `revision` incremented
2. All credentials invalidated immediately
3. Future requests → 401 (stale revision check catches in-flight requests)
4. Revocation webhook sent (best effort)
5. Claims app created remain (user's data) — marked with revoked source
6. AccessEvent logged

**Memory Layer CANNOT promise:** app's local cache cleared, LLM history purged, app's internal database cleaned, exported data returned.

**Memory Layer DOES promise:** no future data flows without new consent, revocation event sent, full audit trail.

### 6.15 Transparency

**User sees (full):** All claims, evidence, access events, app connections, reliability metrics, contradiction history, revocation history.

**App sees (limited):** Own reliability metrics, own claims, whether claims were corrected. CANNOT see: other apps, other apps' claims, user's full claim graph. Prevents metadata leakage.

### 6.16 Cross-App Data Access

Apps receive canonical claims only. Raw evidence from other apps is never exposed.

`read_evidence` (rare capability): evidence records include tier, method, timestamp, but `app_id` is ALWAYS redacted cross-app. Prevents App A from becoming a surveillance window into App B.

**Export:** NOT a third-party capability. Only users can export, via dashboard with account credentials. User-initiated export to an app requires high-friction confirmation.

### 6.17 Consent UX

**Standard consent screen:**

```
[App Name] wants to connect to your [Passport Name]

[Verification status + domain]

WILL BE ABLE TO:
  Read: [categories in plain language]
  Write: [categories in plain language]

WILL NOT BE ABLE TO:
  [key restrictions]

Purpose: [from registration]

[Allow]  [Customize]  [Deny]
```

**Expansion consent (delta only):**

```
[App Name] is requesting additional access

NEW:
  [what's being added]

EXISTING (unchanged):
  [current permissions]

[Allow]  [Deny]
```

**SketchyAI requesting "everything":** Request rejected at validation. No wildcard permissions exist. Apps must request specific categories. The user never sees a consent screen that says "read everything."

---

## 7. Retrieval Pipeline

### 7.1 Read Pipeline

```
APP REQUEST
    │
┌───▼────────────┐
│ AUTH ENGINE     │  Binding active? Credential valid? Revision current?
└───┬────────────┘
    │
┌───▼────────────┐
│ CLAIM FILTER   │  Category filter + sensitivity ceiling + sharing policy
│                │  Output: ONLY authorized claims
└───┬────────────┘
    │
┌───▼────────────┐
│ CONSOLIDATION  │  Declared/Observed resolution per context
│                │  Compute confidence from evidence signals
└───┬────────────┘
    │
┌───▼────────────┐
│ RELEVANCE      │  Query context, volatility, recency
└───┬────────────┘
    │
    ├──── read_claims ──→ structured claim records
    │
    └──── read_context ──→ ContextModel → Renderer → OutputValidation
                                                         │
                                              VALID → return
                                              INVALID → regenerate or degrade
    │
┌───▼────────────┐
│ AUDIT LOG      │  AccessEvent with policy_version, grant_version, binding_revision
└────────────────┘
```

### 7.2 Authorization-Before-Synthesis (Protocol Invariant)

The context synthesizer receives ONLY the pre-filtered authorized claim set. It has zero access to the full claim store.

```typescript
// The synthesizer is a pure function:
function synthesize(authorizedClaims: Claim[]): ContextModel;
// It cannot query the claim store. It receives a pre-filtered array.
```

### 7.3 ContextModel (structured internal representation)

```typescript
interface ContextModel {
  items: ContextItem[];
  passport_id: string;
  generated_at: ISO8601;
  policy_version: string;
}

interface ContextItem {
  claim_id: string;
  category: ClaimCategory;
  sensitivity: Sensitivity;
  summary: string;
  confidence_band: "high" | "medium" | "low";
}
```

Validation: every item's category must be in the grant, every item's sensitivity ≤ ceiling. Deterministic check.

### 7.4 Output Validation (binary, never rewrites)

```typescript
function validateOutput(
  context: ContextModel,
  authorizedCategories: ClaimCategory[],
  sensitivityCeiling: Sensitivity
): { status: "VALID" } | { status: "INVALID"; violation: string };
```

On INVALID: regenerate (once), then return degraded response. Never silently strip content.

### 7.5 Protocol Guarantee

> Memory Layer guarantees that the context synthesizer receives NO source claim outside the authorized set. It does NOT guarantee that authorized claims cannot imply information classified elsewhere. Inference from authorized claims is outside the protocol's control boundary.

### 7.6 Write Pipeline

```
APP → Observation
         │
    ┌────▼─────────────┐
    │ INGESTION GATE    │
    │  idempotency      │
    │  namespace check  │  → protocol namespace = HARD REJECT
    │  capability       │
    │  category         │
    │  rate limit       │
    │  semantic budget  │
    │  evidence check   │
    └────┬─────────────┘
         │
    ┌────▼─────────────┐
    │ CLASSIFICATION    │  3-input, most-restrictive-wins
    │                   │  restricted → QUARANTINE
    └────┬─────────────┘
         │
    ┌────▼─────────────┐
    │ CEILING CHECK     │  Post-classification > binding ceiling? → REJECT
    └────┬─────────────┘
         │
    ┌────▼─────────────┐
    │ PROVENANCE        │  first_party flag, self-referential cap
    └────┬─────────────┘
         │
    ┌────▼─────────────┐
    │ RECONCILIATION    │  Dedup → Evidence → Claim → Contradiction resolution
    └────┬─────────────┘
         │
    Observation.outcome filled
```

---

## 8. Security Model

### 8.1 Credential Model

Short-lived access tokens + rotating refresh tokens. v1 bearer tokens — no instance binding (honest limitation).

```typescript
interface TokenFamily {
  family_id: string;
  binding_id: string;
  current_generation: number;
  created_at: ISO8601;
  revoked_at: ISO8601 | null;
}

interface RefreshToken {
  token_hash: string;
  family_id: string;
  generation: number;
  issued_at: ISO8601;
  expires_at: ISO8601;
}
```

**Refresh flow (atomic compare-and-swap):**

```
App presents refresh_token (generation=N)
  → CAS: family.current_generation == N?
     YES → atomically increment to N+1, issue new token pair
     NO  → token reuse detected → revoke entire family → suspend binding → notify user
```

**v1 security stack:**

1. Scope (binding isolation)
2. Grant (capability × data policy)
3. Rate limits + semantic limits
4. Short lifetime (1-hour access tokens)
5. Token family rotation (double-use detection via CAS)
6. Audit trail (AccessEvents with policy version)
7. Revocation (binding revision ordering)

**v2 (DEFERRED):** DPoP proof-of-possession, anomaly detection, device fingerprinting, request signing.

### 8.2 Revocation Ordering

```
Every API request carries binding revision.
Revocation increments revision.
Requests with stale revision → rejected.
Revision comparison is atomic with authorization — not check-then-execute.
```

### 8.3 Suspension Categories

- `user_paused` → user can restore
- `platform_rate_violation` → auto-restores after cooldown, user can restore
- `platform_security` → platform review required, user CANNOT override
- `platform_abuse` → platform review required, user CANNOT override
- `ownership_transfer` → user re-consent required (full new consent flow)

### 8.4 Attack Surface (v1, honest assessment)

| Attack | v1 Mitigation | Residual Risk |
|---|---|---|
| Stolen access token | 1-hour expiry, rate limits, binding scope | Authorized access for up to 1 hour within grant |
| Stolen refresh token | Single-use CAS rotation, family revocation | Attacker wins race → 1 token pair before detection |
| Write poisoning | Evidence req, rate/semantic limits, reconciliation | Bounded blast radius (350 claims max for unverified) |
| Sybil consensus | Evidence lineage, independent chain requirement | Attacker must control truly independent apps |
| Self-serving claims | Structural first_party flag, tier cap, provenance | Disguised self-references possible |
| Permission escalation | Grant versioning, consent on expansion | Social engineering user to approve |
| Context inference leakage | Auth-before-synthesis, no unauthorized source claims | Inference from authorized claims not preventable |

---

## 9. Data Lifecycle & Erasure

### 9.1 Retention Classes

```typescript
type RetentionClass = "user_controlled" | "security_retained" | "legal_retained";
```

| Data | Retention Class | User can purge? | Retention |
|---|---|---|---|
| Claims, ClaimVersions | user_controlled | Yes, immediately | Until purged |
| Evidence, Observations | user_controlled | Yes, immediately | Until purged |
| UserMemoryEvents | user_controlled | Yes, immediately | Until purged |
| AccessEvents (full) | security_retained | Redacted on purge | 90 days from event |
| Binding/Grant records | security_retained | Redacted on purge | 90 days from revocation |
| Token family events | security_retained | Redacted on purge | 90 days |
| Suspension/ban records | legal_retained | No | Platform policy |

### 9.2 DELETE vs PURGE

**DELETE** (UserMemoryAction): Tombstones claim. Evidence retained. Reversible within a window.

**PURGE** (account-level operation): Destroys claim data, evidence, versions. AccessEvents redacted (claim references → `"PURGED"`, payload stripped, event shell retained for 90 days). Irreversible. High-friction confirmation required.

```typescript
type PurgeScope =
  | { type: "single_claim"; claim_id: string }
  | { type: "category"; passport_id: string; category: ClaimCategory }
  | { type: "passport"; passport_id: string }
  | { type: "account" };
```

### 9.3 Purged Provenance

When evidence is purged but downstream claims survive:

```
Claim B referenced Evidence E (now purged)
  → Claim B.purged_references += { original_evidence_id: "E", purged_at: now, status: "PURGED" }
  → Claim B.evidence_ids removes E
  → Reconciliation re-runs on Claim B from remaining active evidence
```

Provenance graph records that evidence existed. Content is gone.

### 9.4 Redacted AccessEvent (post-purge)

```typescript
// Before purge:
{ claim_ids: ["cl_789"], capability: "read_context", ... }

// After purge:
{ resource_count: 1, resource_reference: "PURGED", capability: "read_context", ... }
```

---

## 10. Protocol Invariants

These are not guidelines. They are constraints that must hold in every implementation. Violating any one breaks the security model.

1. **Apps never own passports.**
2. **Apps never write protocol state.** (Architectural namespace separation.)
3. **Apps submit observations, not truth.** (Observations → Evidence → Claims via reconciliation.)
4. **Evidence is immutable.** Retraction is state, not deletion.
5. **Claims are user-owned.** Apps cannot prevent deletion, revocation, or correction.
6. **Authorization happens before synthesis.** The context synthesizer receives only the pre-filtered authorized claim set.
7. **Unauthorized claims never enter ContextModel.**
8. **Context rendering cannot expand authorization.** Output validation is binary (VALID/INVALID), never rewrite.
9. **Grant expansion requires consent.** `isExpansion()` checks every security-relevant dimension.
10. **Revocation invalidates stale binding revisions.** Revision comparison is atomic with authorization.
11. **Cross-passport access requires explicit bridge.**
12. **Every permissioned query is passport-scoped.** No `getAllClaims()` exists. The ClaimStore interface requires `passport_id`.
13. **Purge destroys user memory data while respecting security/legal retention.** AccessEvents are redacted, not destroyed.
14. **Provenance survives semantically even when evidence is purged.** PurgedProvenanceRecords prevent dangling references.

---

## 11. Design Principles

1. **User owns the data.** Always. If the user purges it, it's gone.
2. **Memories are hypotheses, not facts.** Every claim has state, evidence, provenance.
3. **UNKNOWN is a valid state.** The system does not guess.
4. **Privacy by architecture, not policy.** Structural enforcement, not promises.
5. **Transparency asymmetry.** Users see everything. Apps see only what they need.
6. **Evidence over assertion.** No bare claims. Provenance is not optional.
7. **No silent overwrites.** Claims version. States coexist. Contradiction is surfaced.
8. **Indexes are projections.** Losing them loses speed, not data.
9. **Compute at retrieval, not storage.** Confidence, importance, relevance — all computed.
10. **Portability over convenience.** If it's easier to use but harder to leave, reject it.

---

## 12. Implementation Roadmap

### Implemented (SDK, old types — to be migrated)

- [x] Basic types (UserProfile, SessionRecord, SessionPlan)
- [x] MemoryStore CRUD (localStorage)
- [x] Recall context builder
- [x] Supabase adapter (cloud sync)

### Needs Implementation (from this spec)

- [ ] New entity types (Observation, Evidence, Claim, ClaimVersion, UserMemoryEvent, AccessEvent)
- [ ] Semantic triple structure (subject/predicate/value)
- [ ] Evidence tiers, lineage tracking, retraction state
- [ ] Claim states and Declared/Observed duality
- [ ] Sensitivity + sharing policy (independent dimensions)
- [ ] Reconciliation engine (contradiction detection + resolution)
- [ ] Write pipeline (Observation → Evidence → Claim)
- [ ] Protocol namespace separation
- [ ] App reliability metrics
- [ ] Confidence computation (retrieval-time)
- [ ] Account/Passport/Binding/Grant/Credential model
- [ ] Purpose templates and enforcement
- [ ] Token family rotation (CAS-based)
- [ ] Binding revision ordering
- [ ] ContextModel + structured synthesis
- [ ] Output validation (binary)
- [ ] Restricted claim approval (3 granularities)
- [ ] AccessEvent audit logging with policy version
- [ ] Retention classes and purge system
- [ ] Bridge system
- [ ] Backend service (API, auth, persistence)
- [ ] User dashboard
- [ ] "Connect Memory Passport" flow (Mode A)

### Needs Design (not yet specified)

- [ ] SDK public API surface mapping to this protocol
- [ ] Wire protocol (REST / GraphQL / gRPC)
- [ ] Encryption (at rest, in transit, client-side)
- [ ] Conflict resolution UX
- [ ] App registration and verification flow
- [ ] Migration path from old types
- [ ] Performance targets
- [ ] Pricing model

---

## Appendix: Architecture Summary

```
                         ACCOUNT
                            │
                            ▼
                         PASSPORT
                            │
                            ▼
                         BINDING
                            │
                     ┌──────┴──────┐
                     ▼             ▼
                   GRANT       CREDENTIAL
                     │          (token family)
          ┌──────────┼───────────┐
          ▼          ▼           ▼
     CAPABILITY    POLICY      PURPOSE
          │          │           │
          └──────────┼───────────┘
                     ▼
               AUTHORIZATION
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
       READ                    WRITE
          │                     │
    authorized set         OBSERVATION
          │                     │
     ContextModel            EVIDENCE
          │                     │
      Renderer            RECONCILIATION
          │                     │
       Output                  ▼
      Validation             CLAIM
          │                     │
          ▼              CLAIM VERSION
         APP

Cross-cutting: POLICY VERSION + BINDING REVISION + ACCESS EVENTS + RETENTION POLICY + PROVENANCE
```

---

*Protocol v0.1 — All sections locked. Adversarially reviewed through 3 rounds of hostile CTO analysis. Ready for implementation translation: schemas, state machines, API contracts, conformance tests.*
