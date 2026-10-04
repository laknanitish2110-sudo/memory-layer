# @memory-layer/sdk

Give your AI application persistent, user-owned memory.

Every AI app today has amnesia — users re-explain themselves every session. Memory Layer is a universal memory API that any AI application can plug into. Users own their data. Apps share what users allow.

```typescript
import { MemoryLayer } from "@memory-layer/sdk";

const memory = new MemoryLayer({
  apiKey: process.env.MEMORY_LAYER_KEY,
});

// What do we know about this user?
const ctx = await memory.context();

// Record something new
await memory.observe({
  predicate: "learning",
  value: "Rust",
});

// Next session: context() returns what you observed
```

## Install

```bash
npm install @memory-layer/sdk
```

## 5-minute quickstart

```typescript
import { MemoryLayer, MemoryPermissionError } from "@memory-layer/sdk";

// 1. Connect
const memory = new MemoryLayer({
  apiKey: process.env.MEMORY_LAYER_KEY,
});

// 2. Read what you know
const ctx = await memory.context();
for (const item of ctx.items) {
  console.log(`${item.summary} (${item.confidence} confidence)`);
}

// 3. Record something new
const result = await memory.observe({
  predicate: "learning",
  value: "Rust",
  category: "skills",
});
console.log(result.outcome); // "accepted"

// 4. Handle permission boundaries
try {
  await memory.observe({
    predicate: "diagnosed_with",
    value: "anxiety",
    category: "health",
    sensitivity: "sensitive",
  });
} catch (err) {
  if (err instanceof MemoryPermissionError) {
    console.log(err.message);    // Human-readable explanation
    console.log(err.suggestion); // What to do about it
  }
}
```

See [`examples/fifteen-minute-app/`](../../examples/fifteen-minute-app/) for a complete runnable example.

---

## `memory.context(options?)`

Returns what the application knows about the current user.

```typescript
const ctx = await memory.context();
// ctx.items: ContextItem[]
// ctx.generatedAt: string (ISO 8601)

for (const item of ctx.items) {
  console.log(item.id);          // "clm_abc123"
  console.log(item.category);    // "skills"
  console.log(item.summary);     // "user learning Rust"
  console.log(item.confidence);  // "high" | "medium" | "low"
  console.log(item.sensitivity); // "public" | "personal" | "sensitive" | "restricted"
}
```

Filter by category:

```typescript
const skills = await memory.context({
  categories: ["skills", "goals"],
});
```

Add an audit purpose:

```typescript
const ctx = await memory.context({
  purpose: "building_system_prompt",
});
```

**Building a system prompt** — the most common use case:

```typescript
async function buildSystemPrompt(): Promise<string> {
  const ctx = await memory.context({
    categories: ["skills", "preferences"],
  });

  if (ctx.items.length === 0) {
    return "New user. Ask what they'd like to learn.";
  }

  const knowledge = ctx.items
    .map((i) => `- ${i.summary} (${i.confidence})`)
    .join("\n");

  return `Here's what you know about this student:\n${knowledge}`;
}
```

---

## `memory.observe(input)`

Records something the application learned about the user.

```typescript
const result = await memory.observe({
  predicate: "knows",        // what relationship
  value: "TypeScript",       // what thing
});
// result.outcome:       "accepted" | "merged" | "quarantined"
// result.observationId: "obs_abc123"
// result.claimId:       "clm_abc123" (if accepted)
// result.evidenceId:    "evi_abc123" (if accepted)
```

Required fields: `predicate` and `value`. Everything else has sensible defaults.

All options:

```typescript
await memory.observe({
  predicate: "prefers",
  value: "visual explanations with diagrams",
  category: "preferences",       // default: "skills"
  sensitivity: "personal",       // default: "public"
  method: "model_inferred",      // "user_stated" | "app_measured" | "model_inferred"
  context: "User responded better to diagrams than text",
  subject: "user",               // default: "user"
  idempotencyKey: "my_unique_key", // auto-generated if omitted
});
```

**Categories**: `skills`, `preferences`, `goals`, `projects`, `behavioral_patterns`, `emotional_patterns`, `personal_context`

**Methods**:
- `user_stated` — the user explicitly said it ("I know TypeScript")
- `app_measured` — the application measured it (completed a quiz, used a feature)
- `model_inferred` — an AI model inferred it from behavior

**Outcomes**:
- `accepted` — new claim created
- `merged` — strengthened an existing claim
- `quarantined` — held for review (sensitivity or conflict)

---

## `memory.recall(options?)`

Alias for `context()` with category filtering. Use whichever reads better in your code.

```typescript
const skills = await memory.recall({ categories: ["skills"] });
```

---

## Permissions

Memory Layer enforces what each application can access. Users control their data.

### Check current permissions

```typescript
const status = await memory.permissions.status();
// status.connected:          boolean
// status.capabilities:       ["read_context", "read_claims", "write_claims"]
// status.readCategories:     ["skills", "preferences"]
// status.writeCategories:    ["skills"]
// status.sensitivityCeiling: "personal"
```

### Request broader access

```typescript
const grant = await memory.permissions.request({
  capabilities: ["read_context", "write_claims"],
  purposes: ["personalized_tutoring"],
  readCategories: ["skills", "preferences", "goals"],
  writeCategories: ["skills", "preferences"],
});
```

### Revoke access

```typescript
await memory.permissions.revoke();
```

---

## Errors

Every error has three properties:

| Property | Type | Purpose |
|----------|------|---------|
| `.message` | `string` | Human-readable explanation |
| `.suggestion` | `string` | What to do about it |
| `.code` | `string` | Machine-readable code for programmatic handling |

### Error classes

```typescript
import {
  MemoryError,           // Base class for all errors
  MemoryAuthError,       // Invalid/expired credentials
  MemoryPermissionError, // Capability, category, or sensitivity denied
  MemoryValidationError, // Invalid input
  MemoryConflictError,   // Duplicate observation (idempotency)
  MemoryRateLimitError,  // Too many requests
} from "@memory-layer/sdk";
```

### Error codes

| Code | Class | Meaning |
|------|-------|---------|
| `AUTH_REQUIRED` | `MemoryAuthError` | Missing or invalid API key / session token |
| `AUTH_EXPIRED` | `MemoryAuthError` | Token has expired |
| `PERMISSION_DENIED` | `MemoryPermissionError` | App lacks the required capability |
| `CATEGORY_DENIED` | `MemoryPermissionError` | App can't write to that category |
| `SENSITIVITY_DENIED` | `MemoryPermissionError` | Data sensitivity exceeds app's ceiling |
| `VALIDATION` | `MemoryValidationError` | Invalid input (empty predicate, etc.) |
| `CONFLICT` | `MemoryConflictError` | Duplicate idempotency key |
| `RATE_LIMITED` | `MemoryRateLimitError` | Slow down |
| `NETWORK_ERROR` | `MemoryError` | Network timeout or connectivity |
| `SERVER_ERROR` | `MemoryError` | Unexpected server error |

### Handling errors

```typescript
try {
  await memory.observe({ predicate: "knows", value: "Go" });
} catch (err) {
  if (err instanceof MemoryPermissionError) {
    // App isn't authorized — show the suggestion
    console.log(err.suggestion);
    // → "Request broader access with memory.permissions.request()."
  } else if (err instanceof MemoryAuthError) {
    // Credentials problem — re-authenticate
    console.log(err.suggestion);
  } else if (err instanceof MemoryRateLimitError) {
    // Back off
  }
}
```

---

## Server vs. browser

### Server-side (Node.js, edge runtimes)

Use an API key. Never expose it to clients.

```typescript
const memory = new MemoryLayer({
  apiKey: process.env.MEMORY_LAYER_KEY,
});
```

### Browser-side

Use a session token from your authorization flow. The SDK warns if you pass an API key in a browser environment.

```typescript
const memory = new MemoryLayer({
  sessionToken: tokenFromAuthFlow,
});
```

Never do this:

```typescript
// WRONG — exposes your API key to every user
const memory = new MemoryLayer({
  apiKey: "ml_live_abc123",  // Now visible in DevTools
});
```

---

## Advanced

Most applications only need `context()`, `observe()`, and error handling. The advanced API is an escape hatch for applications that need direct access to the protocol.

### Claims

Claims are the persistent facts that `context()` returns. You normally create them via `observe()`, but you can also manage them directly:

```typescript
// Confirm a claim the user verified
await memory.advanced.claims.confirm("clm_abc123");

// Correct a claim with a new value
await memory.advanced.claims.correct("clm_abc123", "Python 3.12");

// Dispute a claim the user disagrees with
await memory.advanced.claims.dispute("clm_abc123");

// Soft-delete a claim
await memory.advanced.claims.delete("clm_abc123");
```

### Passports

A passport is the user's identity container. Each user has one. You rarely need to interact with it directly.

```typescript
const passport = await memory.advanced.passports.get("psp_abc123");
```

### Grants

A grant defines exactly what your application can do — which capabilities, categories, and sensitivity levels are allowed.

```typescript
const grant = await memory.advanced.grants.get("grt_abc123");
// grant.capabilities: ["read_context", "write_claims"]
// grant.active: true
```

### Protocol details

Under the hood, Memory Layer enforces:

- **Passport isolation** — users can never see each other's data
- **Binding authorization** — each app can only access what the user allowed
- **Grant enforcement** — capabilities, categories, and sensitivity ceilings
- **Evidence trail** — every observation is backed by evidence
- **Deduplication** — duplicate observations merge, not duplicate
- **Claim lifecycle** — observations become claims through a pipeline

You don't need to understand any of this to use the SDK. The protocol handles it.

---

## Configuration

```typescript
const memory = new MemoryLayer({
  apiKey: "ml_...",            // or sessionToken
  baseUrl: "https://...",      // default: Memory Layer cloud
  timeout: 15_000,             // default: 10_000ms
  fetch: customFetch,          // default: globalThis.fetch
});
```

## TypeScript

All types are exported:

```typescript
import type {
  ContextItem,
  ContextResponse,
  ContextOptions,
  ObserveInput,
  ObserveResponse,
  Category,
  Sensitivity,
  Confidence,
  PermissionStatus,
  MemoryErrorCode,
} from "@memory-layer/sdk";
```
