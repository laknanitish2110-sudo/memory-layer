# Memory Layer — Quickstart

Give your AI app persistent memory in 5 minutes.

Every AI application today has amnesia. Users re-explain themselves every session.
Memory Layer fixes that with a single API.

## What you'll build

A script that:
1. Reads what it already knows about a user (empty on first run)
2. Records two observations ("learning Rust", "prefers visual explanations")
3. Reads context back — now it remembers
4. Shows that permission boundaries actually work

No database. No user management. No session handling. The SDK handles all of that.

## Setup

```bash
cd examples/fifteen-minute-app
npm install
cp .env.example .env
```

Add your API key to `.env`:

```
MEMORY_LAYER_KEY=ml_your_api_key_here
```

## Run

```bash
npm start
```

Expected output (first run):

```
First session — no memories yet.

Observed: user is learning Rust  →  accepted
Observed: prefers visual explanations  →  accepted

Memory now has 2 item(s):

  [skills] user learning Rust  (medium)
  [preferences] user prefers visual explanations with diagrams  (medium)

Skills only: 1 item(s)

Permission boundary working:
  This application isn't authorized for that memory category.
  Suggestion: Request access to additional categories with memory.permissions.request().

Done. Your AI app now has persistent memory.
```

Run it again — step 1 will now show the memories from last time.

## How it works

Three methods cover 90% of use cases:

```typescript
import { MemoryLayer } from "@memory-layer/sdk";

const memory = new MemoryLayer({
  apiKey: process.env.MEMORY_LAYER_KEY,
});

// Read what you know about this user
const ctx = await memory.context();

// Record something new
await memory.observe({
  predicate: "learning",
  value: "Rust",
  category: "skills",
});

// Read again — now it includes the observation
const updated = await memory.context();
```

That's it. The protocol handles user isolation, permissions, evidence tracking,
and deduplication automatically.

## API reference

### `memory.context(options?)`

Returns what the application knows about the current user.

```typescript
const ctx = await memory.context();
// ctx.items: Array<{ id, category, summary, confidence, sensitivity }>

// Filter by category
const skills = await memory.context({ categories: ["skills"] });
```

### `memory.observe(input)`

Records something the application learned about the user.

```typescript
const result = await memory.observe({
  predicate: "knows",          // what relationship
  value: "TypeScript",         // what thing
  category: "skills",          // which bucket (skills, preferences, goals, ...)
  method: "user_stated",       // how you learned it (user_stated, model_inferred, app_measured)
  context: "User said: I've been writing TypeScript for 3 years",
});
// result: { outcome, observationId, claimId, evidenceId }
```

Required fields: `predicate`, `value`. Everything else has sensible defaults.

### `memory.recall(options?)`

Alias for `context()` with category filtering. Use whichever reads better in your code.

```typescript
const skills = await memory.recall({ categories: ["skills"] });
```

### Error handling

```typescript
import { MemoryPermissionError, MemoryAuthError } from "@memory-layer/sdk";

try {
  await memory.observe({ ... });
} catch (err) {
  if (err instanceof MemoryPermissionError) {
    // App tried to access a category it doesn't have permission for
    console.log(err.message);     // Human-readable explanation
    console.log(err.suggestion);  // What to do about it
    console.log(err.code);        // Machine-readable: "CAPABILITY_DENIED" | "CATEGORY_DENIED"
  }
  if (err instanceof MemoryAuthError) {
    // Invalid or expired API key
  }
}
```

Every error has `.message` (human-readable), `.suggestion` (what to do), and `.code` (machine-readable).

## What's happening under the hood

You don't need to know this to use the SDK. But if you're curious:

- Each user gets an isolated **passport** — users can never see each other's data
- Your API key is tied to a **binding** that defines what your app can access
- Observations become **claims** backed by evidence — duplicates merge, not duplicate
- The **grant** on your binding controls which categories and sensitivity levels your app can read/write
- All of this is enforced server-side — the SDK is a thin client, not a security boundary

## Next steps

- **Permissions**: Use `memory.permissions.request()` to ask for access to additional categories
- **Advanced**: Use `memory.advanced.claims.*` for direct claim management (confirm, correct, dispute)
- **Multiple apps**: Different API keys for different apps. Same user, different permissions. Memory is shared by default — the user controls what each app can see.
