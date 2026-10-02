# Memory Passport Protocol Specification v0.1

**Status:** Draft — Architecture locked, implementation pending.

This document defines the core protocol for Memory Passport: a portable AI identity protocol with permissioned access. It is the engineering spec, not the pitch. Everything here was pressure-tested through adversarial review and represents locked design decisions.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Core Entities](#2-core-entities)
3. [Memory Object Model](#3-memory-object-model)
4. [Reconciliation Protocol](#4-reconciliation-protocol)
5. [Identity Model](#5-identity-model)
6. [Binding & Permission Protocol](#6-binding--permission-protocol)
7. [Retrieval Pipeline](#7-retrieval-pipeline)
8. [Design Principles](#8-design-principles)
9. [What's Not Built Yet](#9-whats-not-built-yet)

---

## 1. Overview

### The Problem
Every AI app has amnesia. Users re-explain themselves every session. No continuity across tools. Memory that exists is siloed per-platform and owned by companies, not users.

### The Solution
Memory Passport is a protocol where:
- **Users own** their AI memory across all apps
- **Apps request access** to memory categories, like OAuth scopes
- **Memory is portable** — switch apps, keep your context
- **Memory is structured** — not key-value blobs, but semantic claims with evidence and provenance

### Positioning
Compete ABOVE Mem0/Zep (identity + permissions + portability), not below (memory infrastructure). Could literally use Mem0 as a storage backend underneath. Different architecture for a different customer: Mem0 sells to developers, Memory Passport gives sovereignty to users.

---

## 2. Core Entities

Five entities. No more, no less. Each has a clear responsibility.

```
Experience → Evidence → Claim → ClaimVersion → AccessEvent
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
  context: Record<string, unknown>;  // app-defined session context
  summary: string;                   // human-readable session summary
  tags: string[];
}
```

Experiences are raw data. They are never shared cross-app. They feed Evidence.

### 2.2 Evidence

A piece of support for a Claim. Every Claim must have at least one Evidence record. Evidence carries provenance — who said it, when, how.

```typescript
interface Evidence {
  id: string;
  claim_id: string;
  source_type: EvidenceTier;
  app_id: string;
  experience_id: string | null;     // links back to the session that produced it
  observed_at: ISO8601;
  raw_observation: string;          // what the app actually reported
  extraction_method: string;        // "user_stated" | "model_inferred" | "app_measured" | "user_corrected"
  lineage: EvidenceLineage;         // prevents Sybil attacks
}

interface EvidenceLineage {
  origin_app_id: string;            // which app first observed this
  origin_experience_id: string;     // which session
  chain: string[];                  // if derived from other evidence, the chain
}
```

**Evidence Tiers (1-5, higher = stronger):**

| Tier | Source | Example |
|------|--------|---------|
| 1 | User Correction | User explicitly fixes a claim |
| 2 | User Statement | User says "I know Python" |
| 3 | Multi-App Consensus | 3+ independent apps agree |
| 4 | Single App Assertion | One app's observation |
| 5 | Model Inference | AI inferred from behavior |

Tier 1 always wins. Consensus (Tier 3) requires independent evidence chains — same-lineage evidence from multiple apps counts as one source, preventing Sybil attacks where fake apps create false consensus.

### 2.3 Claim

A semantic assertion about the user. The core unit of memory.

```typescript
interface Claim {
  id: string;
  passport_id: string;

  // Semantic triple — the actual memory
  subject: string;                  // "user", "user.project.sensai", etc.
  predicate: string;                // "knows", "prefers", "is_working_on", etc.
  value: string;                    // "Python", "examples over theory", etc.

  // Qualifiers — scope the assertion
  qualifiers: Record<string, string>; // { "level": "intermediate", "context": "web development" }

  // Indexing (NOT the core representation — projections for search)
  category: ClaimCategory;
  tags: string[];

  // State
  state: ClaimState;
  declared_state: ClaimState | null;  // user's self-assessment, persists independently
  observed_state: ClaimState | null;  // aggregated from app observations

  // Temporal properties
  volatility: Volatility;
  created_at: ISO8601;
  updated_at: ISO8601;
  last_confirmed_at: ISO8601 | null;
  expires_at: ISO8601 | null;

  // Privacy
  sensitivity: Sensitivity;

  // Evidence references
  evidence_ids: string[];
  contradicted_by: string[];        // claim IDs that contradict this one

  // Current version
  current_version_id: string;
}
```

**Claim States:**
```typescript
type ClaimState =
  | "DECLARED"    // user explicitly stated
  | "SUPPORTED"   // multiple evidence sources agree
  | "OBSERVED"    // single app observed
  | "CONTESTED"   // conflicting evidence exists
  | "UNKNOWN"     // cannot determine (valid final state, not error)
  | "STALE"       // not confirmed recently, confidence degraded
  | "EXPIRED";    // past explicit expiration
```

**UNKNOWN is a valid state.** When apps disagree and no resolution rule applies, the system does not pick a winner. It surfaces the contradiction to the user or serves the claim as UNKNOWN.

**Declared vs Observed state:** Both persist independently. If a user says "I know Python" (DECLARED) but apps observe them struggling (OBSERVED as CONTESTED), both states exist. Neither silently overwrites the other. The retrieval pipeline decides which to serve based on context.

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

Categories and tags are search indexes. The semantic triple (subject/predicate/value) is the actual memory. A claim like "user knows Python at intermediate level in web development" is represented as:
- subject: `"user"`
- predicate: `"knows"`
- value: `"Python"`
- qualifiers: `{ "level": "intermediate", "context": "web development" }`
- category: `"skills"` (index only)

**Volatility:**
```typescript
type Volatility = "stable" | "slow_changing" | "dynamic" | "ephemeral";
```
- `stable`: name, native language — rarely changes
- `slow_changing`: skill levels, preferences — evolves over months
- `dynamic`: current project, mood — changes weekly/daily
- `ephemeral`: current task, immediate context — session-scoped

**Sensitivity:**
```typescript
type Sensitivity = "public" | "personal" | "sensitive" | "restricted";
```
- `public`: skill levels, preferences — safe to share widely
- `personal`: goals, projects — share with connected apps
- `sensitive`: emotional patterns, behavioral patterns — needs explicit consent
- `restricted`: health, relationships — deny-by-default, requires per-claim user approval

### 2.4 ClaimVersion

Claims evolve. Every change creates a version. Full history, no silent overwrites.

```typescript
interface ClaimVersion {
  id: string;
  claim_id: string;
  version_number: number;
  previous_version_id: string | null;
  value: string;
  qualifiers: Record<string, string>;
  state: ClaimState;
  changed_by: string;              // app_id or "user"
  changed_at: ISO8601;
  change_reason: string;           // "user_correction" | "new_evidence" | "contradiction_resolved" | "staleness_decay"
  evidence_ids: string[];          // evidence supporting this version
}
```

### 2.5 AccessEvent

Audit trail. Every time a claim is served to an app, it's logged.

```typescript
interface AccessEvent {
  id: string;
  claim_id: string;
  app_id: string;
  binding_id: string;
  accessed_at: ISO8601;
  access_type: "read" | "write" | "delete";
  context: string;                 // why the app requested this
  claim_version_at_access: string; // version ID at time of access
}
```

This enables: "This memory was shared with 3 apps before deletion." Users can audit who saw what.

---

## 3. Memory Object Model

### 3.1 What's on the Claim vs What's Not

**ON the Claim:** subject, predicate, value, qualifiers, category (index), tags (index), state, declared_state, observed_state, volatility, sensitivity, temporal fields, evidence references.

**NOT on the Claim:**
- `confidence: number` — Computed at retrieval from evidence signals (source_type, confirmations, last_confirmed, contradictions). Never stored.
- `importance: number` — Relevance is query-dependent. "Knows Python" is critical for a coding app, irrelevant for a cooking app. Computed at retrieval.
- `embedding: float[]` — Index projection, stored in a search index, not the claim record.
- `search_text: string` — Index projection, generated from subject/predicate/value for lexical search.
- `scopes: string[]` — Scopes are a permission-layer concept, not a memory property. The same claim can be visible to different apps based on their binding permissions.

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

The function is deterministic and version-controlled. Changing the function changes retrieval behavior for all claims uniformly, which is the correct behavior — it reflects updated understanding of what evidence means, not a per-claim judgment.

### 3.3 Index Layer

Separate from claims. Rebuilt from claim data. Indexes include:
- **Category index** — claims by ClaimCategory
- **Semantic index** — embeddings generated from subject/predicate/value/qualifiers
- **Lexical index** — full-text search on claim text
- **Temporal index** — claims by recency, staleness, expiration
- **Tag index** — claims by tags

Indexes are projections. Losing them loses performance, not data. They can always be rebuilt from claims.

---

## 4. Reconciliation Protocol

What happens when multiple apps create claims about the same user, and those claims conflict.

### 4.1 Ingestion Pipeline

When an app writes a claim:

```
App submits claim
  → Ingestion gate (is app authorized to write this category?)
  → Dedup check (does an equivalent claim already exist?)
  → If new: create Claim + Evidence
  → If existing: add Evidence to existing Claim
  → Contradiction detection
  → Resolution (if contradiction found)
  → App reliability metrics update
```

### 4.2 Contradiction Detection

Two claims contradict when:
- Same subject + same predicate + different value
- AND qualifiers don't differentiate them (temporal, contextual)

**Qualifier-aware detection:** "Prefers React (for web)" and "Prefers SwiftUI (for mobile)" are NOT contradictions — the qualifier `context` differentiates them. "Prefers React (in 2024)" and "Prefers Vue (in 2025)" are NOT contradictions — temporal qualifier shows evolution, not conflict.

Only same-scope, same-time, genuinely conflicting values trigger contradiction resolution.

### 4.3 Resolution Rules (priority order)

1. **Tier 1 wins.** User correction beats everything. Always.
2. **Tier 2 vs Tier 4+.** User statement beats single app assertion or model inference.
3. **Consensus vs single.** Multi-app consensus (Tier 3) beats single app (Tier 4), but ONLY with independent evidence lineages.
4. **Recency breaks ties.** When tier and consensus are equal, most recent evidence wins — but only as a tiebreaker within the same tier, not across tiers.
5. **Surface to user.** When no rule resolves it, mark as CONTESTED or UNKNOWN. Ask the user. UNKNOWN is a valid final state.

**"Freshest wins" is NOT a general rule.** A malicious app could be the freshest source. Recency is a tiebreaker within the same evidence tier, nothing more.

### 4.4 Declared vs Observed State

When the user says "I know Python" (Tier 2) but three apps observe the user struggling (Tier 3 consensus):

- `declared_state` = DECLARED (user's self-assessment persists)
- `observed_state` = CONTESTED (apps see different behavior)
- `state` = CONTESTED (overall state reflects the conflict)

Neither silently wins. The retrieval pipeline serves what makes sense for the requesting context. A tutoring app might trust the observed state. A profile display might show the declared state.

### 4.5 App Reliability Metrics

Not hidden trust scores. Exposed, queryable metrics:

```typescript
interface AppReliability {
  app_id: string;
  claims_created: number;
  claims_confirmed: number;         // by other apps or user
  claims_corrected: number;         // user corrected this app's claim
  correction_rate: number;          // claims_corrected / claims_created
  sample_size: number;
  observation_window: ISO8601Range;
}
```

Apps with high correction rates get lower effective weight in consensus. This is transparent — any app can query its own reliability metrics and improve.

### 4.6 Evidence Lineage (Anti-Sybil)

Consensus requires independent observation chains. Evidence carries lineage:

```
Evidence A: app_1 observed in experience_001
Evidence B: app_2 observed in experience_002
Evidence C: app_3 imported from app_1's evidence → NOT independent
```

Evidence C traces back to app_1 through its lineage chain. It doesn't count as an independent source for consensus. Three apps reporting the same thing only counts as consensus if at least three independent lineages exist.

---

## 5. Identity Model

Three-layer model. Each layer has a clear responsibility.

### 5.1 Account

Authentication only. How a user proves who they are.

```typescript
interface Account {
  id: string;
  auth_provider: string;           // "google" | "github" | "email" | etc.
  auth_id: string;                 // provider-specific user ID
  email: string;
  created_at: ISO8601;
  passport_ids: string[];          // passports owned by this account
}
```

One account per auth identity. Account knows nothing about memory — it only knows which passports it owns.

### 5.2 Passport

The memory container. Where claims live.

```typescript
interface Passport {
  id: string;
  account_id: string;
  name: string;                    // user-chosen label: "Work", "Personal", "Side Project"
  created_at: ISO8601;
  is_ephemeral: boolean;           // session passport, not persistent
  device_id: string | null;        // for ephemeral passports, bound to device
  binding_ids: string[];           // apps connected to this passport
  bridge_ids: string[];            // bridges to other passports
}
```

**Key design decisions:**
- **Multiple passports per account.** A user might have "Work", "Personal", "Learning" passports. Different apps connect to different passports.
- **Isolation by default.** Passports share nothing unless the user creates a bridge.
- **Not a privacy boundary.** Passports are organizational, not security-critical. The permission layer (bindings) is the security boundary.

### 5.3 Ephemeral Session Passports

For anonymous or first-time users. An app can create a temporary passport without requiring account creation.

```typescript
interface EphemeralPassport extends Passport {
  is_ephemeral: true;
  device_id: string;               // bound to device, not portable
  expires_at: ISO8601;             // auto-expires
  promotable: boolean;             // can be upgraded to persistent
}
```

Properties:
- **Device-bound** — works on this device only, not portable
- **Non-portable** — cannot be shared cross-app (no bindings beyond the creating app)
- **Temporary** — expires automatically
- **Promotable** — can be upgraded to a full passport with explicit user confirmation

**Promotion requires explicit user confirmation.** Anonymous → authenticated promotion is an account takeover surface. The user must:
1. Create or sign into an Account
2. Explicitly confirm: "Attach this session memory to my account"
3. Review what's being promoted before it transfers

### 5.4 Binding

Represents an app's authorized connection to a passport.

```typescript
interface Binding {
  id: string;
  passport_id: string;
  app_id: string;
  credential_hash: string;         // hashed binding credential
  granted_at: ISO8601;
  expires_at: ISO8601 | null;
  revoked_at: ISO8601 | null;
  status: "active" | "suspended" | "revoked" | "expired";
  permissions: BindingPermissions; // what this app can do (see Section 6)
}
```

**Binding credential (not "passport token"):** The credential represents the app's permission against a specific passport, not the passport itself. A leaked credential exposes one app's access, not the entire passport.

### 5.5 Bridges

User-created links between passports for selective claim sharing.

```typescript
interface Bridge {
  id: string;
  source_passport_id: string;
  target_passport_id: string;
  direction: "one_way" | "bidirectional";
  created_at: ISO8601;
  created_by: string;              // always the account owner
  scope: BridgeScope;
  status: "active" | "paused" | "revoked";
}

interface BridgeScope {
  categories: ClaimCategory[];     // which claim categories flow through
  sensitivity_ceiling: Sensitivity; // max sensitivity level that crosses
  claim_filter: string | null;     // optional predicate filter
}
```

Properties:
- **Explicit** — user creates them, never auto-generated
- **Scoped** — only specified categories and sensitivity levels cross
- **Directional** — "Work → Personal" doesn't imply "Personal → Work"
- **Revocable** — user can pause or revoke at any time
- **Provenance-preserving** — bridged claims retain their origin passport. They do NOT silently become owned claims in the target passport. A claim that arrived via bridge is always marked as bridged, showing where it came from.

### 5.6 Auth Modes

**Mode A (v1): App has own auth, user connects Memory Passport separately.**
The app authenticates users with its own system. After login, the app offers "Connect your Memory Passport" as an optional enhancement. The user authorizes, a Binding is created.

**Mode B (v2, deferred): "Sign in with Memory" as OAuth provider.**
Memory Passport acts as the identity provider. User clicks "Sign in with Memory" and the app receives both authentication and memory access. This requires SOC 2, security audits, and significant infrastructure. Not v1.

---

## 6. Binding & Permission Protocol

*Status: Proposed — not yet pressure-tested.*

How apps get access to a passport, what they can read and write, and how access is controlled.

### 6.1 Permission Model

```typescript
interface BindingPermissions {
  read: ReadPermissions;
  write: WritePermissions;
  capabilities: Capability[];       // machine-enforced, not prose
  sensitivity_ceiling: Sensitivity; // max sensitivity this app can access
  purpose: string;                  // human-readable purpose (display only)
  expires_at: ISO8601 | null;
}

interface ReadPermissions {
  categories: ClaimCategory[];     // which categories the app can read
  max_sensitivity: Sensitivity;    // can't exceed binding's ceiling
  include_contested: boolean;      // can the app see CONTESTED claims?
  include_evidence: boolean;       // can the app see underlying evidence?
}

interface WritePermissions {
  categories: ClaimCategory[];     // which categories the app can write to
  max_sensitivity: Sensitivity;    // max sensitivity of claims it can create
  requires_evidence: boolean;      // must provide evidence with every claim (default: true)
  rate_limit: WriteRateLimit;
}

interface WriteRateLimit {
  max_claims_per_hour: number;
  max_claims_per_day: number;
  burst_limit: number;             // max claims in a single request
}
```

### 6.2 Capabilities

Machine-enforced permissions. Not prose purpose statements — actual capability tokens.

```typescript
type Capability =
  | "read_claims"                  // read claims within granted categories
  | "write_claims"                 // create new claims
  | "update_own_claims"            // update claims this app created
  | "read_experiences"             // read this app's own experience records
  | "write_experiences"            // write experience records
  | "read_evidence"                // see evidence behind claims
  | "request_elevation"            // ask user for higher permissions
  | "read_versions"               // see claim history
  | "delete_own_claims";          // delete claims this app created

// NOT capabilities — these are user-only actions:
// "delete_any_claim", "create_bridge", "revoke_binding", "promote_passport"
```

Capabilities are the enforcement layer. Purpose is the display layer. An app's purpose says "AI tutoring" but its capabilities determine what it can actually do. Purpose cannot expand capabilities.

### 6.3 Sensitivity Ceiling

Every binding has a maximum sensitivity level. The app cannot read or write claims above its ceiling, regardless of categories granted.

```
Sensitivity hierarchy: public < personal < sensitive < restricted

App ceiling: "personal"
  → Can read: public, personal claims in granted categories
  → Cannot read: sensitive, restricted claims (even if in granted categories)
  → Cannot write: sensitive, restricted claims
```

**Restricted claims are deny-by-default.** Even with ceiling = "restricted", each restricted claim requires individual user approval before it's served to an app. The ceiling grants eligibility, not access.

### 6.4 Write Permissions (The Dangerous Part)

Write access is the highest-risk permission. A malicious app with write access could poison the user's entire AI identity.

**Protections:**
1. **Rate limits** — every write binding has hard limits (claims per hour, per day, burst)
2. **Evidence required** — writes must include evidence with lineage. No bare assertions.
3. **Category-scoped** — an app authorized to write "skills" cannot write "emotional_patterns"
4. **Sensitivity-capped** — an app cannot create claims above its sensitivity ceiling
5. **Provenance always attached** — every claim knows which app created it. Users can see "App X believes Y about you."
6. **Write ≠ overwrite** — writing creates new evidence for a claim. It never silently replaces another app's claim. The reconciliation protocol handles conflicts.
7. **Correction asymmetry** — apps can write observations (Tier 4-5) but cannot issue corrections (Tier 1). Only users can correct.

### 6.5 Binding Lifecycle

```
1. App registers with Memory Passport (verified identity, declared purpose + capabilities)
2. User installs/uses app
3. App requests binding: categories + capabilities + purpose
4. User reviews and approves (or denies)
5. Binding credential issued (scoped, time-limited, revocable)
6. App operates within granted permissions
7. User can: review, pause, revoke binding at any time
8. Binding expires or is revoked → access ends immediately
```

### 6.6 App Verification

Apps that connect to Memory Passport must be verifiable:

```typescript
interface AppRegistration {
  app_id: string;
  name: string;
  developer_id: string;
  verified: boolean;               // developer identity verified
  domain: string;                  // verified domain ownership
  declared_purpose: string;
  requested_capabilities: Capability[];
  created_at: ISO8601;
  status: "active" | "suspended" | "banned";
}
```

Unverified apps can still create bindings but with lower rate limits and a "unverified" indicator shown to users. Verification doesn't grant trust — it grants identification. A verified app that behaves badly is identifiable and accountable.

### 6.7 Revocation & Suspension

**User-initiated revocation:**
- Immediate. Binding status → "revoked". All future access denied.
- Claims the app created remain (they're the user's memory now) but are marked with the revoked app as source.
- Pending writes are dropped.

**System-initiated suspension:**
- Triggered by: rate limit violations, high correction rate, user reports
- Binding status → "suspended". Access paused, not deleted.
- App can appeal or user can reinstate.
- Suspension is transparent — the app knows it's suspended and why.

**Credential rotation:**
- Binding credentials are time-limited and rotatable
- Compromised credential → user revokes → new binding required
- Old credential immediately invalidated

### 6.8 Consent UX Principles

1. **Informed, not fatigued.** Show what the app is requesting in plain language. "CodeHelper wants to read your Skills and write to Projects." Not a wall of checkboxes.
2. **Smart defaults.** A coding app defaults to requesting skills + projects. A journaling app defaults to emotional_patterns + goals. Pre-selected but changeable.
3. **Granular when the user wants it.** One-click approve for the common case. Expand to see individual categories and capabilities if the user wants control.
4. **Ongoing visibility.** Dashboard shows: which apps are connected, what each can do, what each has actually accessed (from AccessEvents), reliability metrics.
5. **Easy revocation.** One click to revoke. Not buried in settings.

### 6.9 Transparency Levels

Two levels of transparency, because leaking metadata to apps is a risk:

**User transparency (full):**
- See all claims, all evidence, all access events
- See which apps have access and what they've read
- See app reliability metrics
- See contradiction history and resolutions

**App transparency (limited):**
- See its own reliability metrics
- See claims it created and their current state
- See if its claims were corrected (so it can improve)
- CANNOT see: which other apps are connected, what other apps wrote, the user's full claim graph
- Preventing metadata leakage: an app should not learn "user also uses [competitor]" from the permission layer

---

## 7. Retrieval Pipeline

When an app calls `recall()` or `contextForAI()`, this is the pipeline:

```
1. AUTHORIZATION (first, always)
   → Is this binding active?
   → Is the credential valid?
   → What categories/sensitivity is this app authorized for?

2. CANDIDATE RETRIEVAL
   → Pull claims matching authorized categories
   → Filter by sensitivity ceiling
   → Apply staleness/expiration filters

3. CONSOLIDATION
   → Merge Declared and Observed states per context
   → Resolve CONTESTED claims (apply resolution rules or serve as UNKNOWN)
   → Compute confidence from evidence signals

4. RELEVANCE SCORING
   → Score by query context (what did the app ask for?)
   → Weight by volatility (dynamic > stable for "what's current?")
   → Weight by recency within volatility class
   → Apply category-specific ranking

5. CONTEXT COMPRESSION
   → Select top-N claims by relevance
   → Compress into actionable context (not raw claim dumps)
   → Format for AI consumption (natural language summary)

6. OUTPUT
   → Return compressed context to app
   → Include confidence indicators where useful
   → Exclude evidence details unless app has "read_evidence" capability

7. AUDIT LOG
   → Create AccessEvent for every claim served
   → Log: which app, which claims, which versions, when
```

---

## 8. Design Principles

These are not aspirational. They are constraints that every implementation decision must satisfy.

1. **User owns the data.** Always. No exceptions. No "we need this for analytics." If the user deletes it, it's gone.

2. **Memories are hypotheses, not facts.** Every claim has state, evidence, and provenance. False memory is worse than no memory.

3. **UNKNOWN is a valid state.** The system does not guess when it doesn't know. Surfacing uncertainty is better than fabricating confidence.

4. **Privacy by architecture, not policy.** Sensitivity levels, capability enforcement, and audit trails are structural. Not "we promise we won't look."

5. **Transparency asymmetry.** Users see everything. Apps see only what they need. The permission layer never leaks metadata about other apps.

6. **Evidence over assertion.** No bare claims. Every memory traces back to who said it, when, and how. Provenance is not optional.

7. **No silent overwrites.** Claims version. States coexist (declared + observed). Contradiction is surfaced, not hidden.

8. **Indexes are projections.** Embeddings, search text, category indexes can be rebuilt from claims. Losing them loses speed, not data.

9. **Compute at retrieval, not storage.** Confidence, importance, relevance — all computed when needed from stored signals. No stale scores.

10. **Portability over convenience.** If a design decision makes Memory Passport easier to use but harder to leave, reject it.

---

## 9. What's Not Built Yet

### Implemented (in SDK, old types)
- [x] Basic types (UserProfile, SessionRecord, SessionPlan)
- [x] MemoryStore CRUD (localStorage)
- [x] Recall context builder
- [x] Supabase adapter (cloud sync)
- [x] Barrel exports, examples

### Needs Implementation (from this spec)
- [ ] New entity types (Experience, Evidence, Claim, ClaimVersion, AccessEvent)
- [ ] Semantic triple structure (subject/predicate/value)
- [ ] Evidence tiers and lineage tracking
- [ ] Claim states and Declared/Observed duality
- [ ] Reconciliation engine (contradiction detection + resolution)
- [ ] App reliability metrics
- [ ] Confidence computation (retrieval-time)
- [ ] Account/Passport/Binding identity model
- [ ] Binding permission system (capabilities, sensitivity ceiling)
- [ ] Bridge system (cross-passport sharing)
- [ ] Ephemeral passport support
- [ ] Retrieval pipeline (authorization → retrieval → consolidation → relevance → compression → audit)
- [ ] Access event audit logging
- [ ] Backend service (API, auth, persistence)
- [ ] User dashboard (view/edit/delete/revoke)
- [ ] "Connect Memory Passport" OAuth-like flow (Mode A)

### Needs Design (not yet specified)
- [ ] SDK public API surface (the actual `memory.remember()` / `memory.recall()` calls mapping to this protocol)
- [ ] Wire protocol (REST? GraphQL? gRPC?)
- [ ] Encryption (at rest, in transit, client-side?)
- [ ] Conflict resolution UX (how users actually see and resolve contradictions)
- [ ] App registration and verification flow
- [ ] Migration path from old types to new entities
- [ ] Performance targets (latency for recall, throughput for writes)
- [ ] Pricing model

---

*This spec will evolve. Section 6 (Binding & Permissions) has not been pressure-tested yet. Everything else has survived adversarial review.*
