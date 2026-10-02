# @memory-layer/core

Universal memory layer for AI applications. Store, retrieve, and share user memory across apps with pluggable storage backends.

## Install

```bash
npm install @memory-layer/core
```

## Quick Start

```typescript
import { MemoryStore } from "@memory-layer/core";

const store = new MemoryStore();

// Store a memory
await store.set("user-1", "theme", "dark");

// Retrieve it
const mem = await store.get("user-1", "theme");
console.log(mem.value); // "dark"

// List all memories for a user
const all = await store.list("user-1");

// Delete
await store.delete("user-1", "theme");
```

## Cross-App Memory

The key idea: memories are scoped by `userId`, readable by any app. Tag writes with `appId` to track origin.

```typescript
// App A writes a preference
const appA = new MemoryStore({ appId: "settings-app" });
await appA.set("user-1", "theme", "dark");

// App B reads it — same adapter, different appId
const appB = new MemoryStore({ adapter: sharedAdapter, appId: "dashboard" });
const pref = await appB.get("user-1", "theme");
// pref.value === "dark", pref.appId === "settings-app"
```

## Adapters

### In-Memory (default)

```typescript
import { MemoryStore, InMemoryAdapter } from "@memory-layer/core";

const store = new MemoryStore({ adapter: new InMemoryAdapter() });
```

### Supabase

```bash
npm install @supabase/supabase-js
```

```typescript
import { createClient } from "@supabase/supabase-js";
import { MemoryStore, SupabaseAdapter } from "@memory-layer/core";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const store = new MemoryStore({ adapter: new SupabaseAdapter(supabase) });
```

Run the migration to create the `memories` table:

```typescript
import { MIGRATION_SQL } from "@memory-layer/core";
// Execute MIGRATION_SQL against your Supabase project
```

## Demo

```bash
npm run demo
# Open http://localhost:3210/app-a.html (write preferences)
# Open http://localhost:3210/app-b.html (read them from another "app")
```

## Development

```bash
npm test             # run tests (40 tests)
npm run typecheck    # type checking
npm run build        # build with tsup (ESM + CJS + .d.ts)
```
