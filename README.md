# Memory Layer

> Universal memory layer for AI applications. Give any AI app persistent, cross-session, user-owned memory.

## The Problem

Every AI app today has amnesia. Users re-explain context every session. No continuity, no recall, no learning from past interactions.

## The Solution

A pluggable memory layer that any AI application can integrate in minutes:

```typescript
import { Memory } from '@memory-layer/core';
import { LocalStorageAdapter } from '@memory-layer/core/adapters/localStorage';

const memory = new Memory({
  appId: 'my-ai-app',
  storage: new LocalStorageAdapter(),
});

// Recall past context
const context = await memory.recall();
// → { isReturningUser: true, summary: "Last active 3h ago. 12 sessions...", ... }

// Get context string for your AI prompt
const aiContext = await memory.contextForAI();
// → "Returning user: 12 past sessions.\nLast active: 3h ago.\n..."

// Remember things
await memory.remember('favorite_language', 'Python');

// Session tracking
await memory.startSession({ topic: 'machine learning' });
// ... user interacts ...
await memory.endSession('Covered neural networks basics', ['ml', 'neural-nets']);

// Plans
await memory.plan(['Continue with backpropagation', 'Build a simple NN']);
```

## Storage Adapters

### localStorage (browser)
```typescript
import { LocalStorageAdapter } from '@memory-layer/core/adapters/localStorage';

const memory = new Memory({
  appId: 'my-app',
  storage: new LocalStorageAdapter(),
});
```

### Supabase (cloud sync)
```typescript
import { SupabaseAdapter } from '@memory-layer/core/adapters/supabase';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const memory = new Memory({
  appId: 'my-app',
  userId: 'user-123',
  storage: new SupabaseAdapter({ client: supabase }),
});
```

### Custom adapter
Implement the `StorageAdapter` interface:

```typescript
interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
```

## API

### `Memory`
| Method | Description |
|--------|-------------|
| `recall()` | Get full recall context (returning user status, time since last visit, plan, suggested action) |
| `contextForAI()` | Get a string to inject into your AI system prompt |
| `startSession(meta?)` | Begin tracking a session |
| `endSession(summary?, tags?)` | End and save the current session |
| `remember(key, value)` | Store a key-value pair in user profile |
| `get(key)` | Retrieve a stored value |
| `setPreference(key, value)` | Store a user preference |
| `plan(goals, notes?)` | Save a plan for next session |
| `getPlan()` | Get the active plan |
| `clearPlan()` | Clear the active plan |
| `updateEngagement(state, rate)` | Track engagement patterns |

## Architecture

```
@memory-layer/core
├── Memory          — High-level API (remember, recall, plan)
├── MemoryStore     — CRUD operations on profiles, sessions, plans
├── Recall          — Context building, time formatting, suggestions
├── Types           — UserProfile, SessionRecord, SessionPlan, etc.
└── Adapters
    ├── localStorage  — Browser storage (works offline)
    └── supabase      — Cloud sync (multi-device, cross-app)
```

## Origin

Extracted from [SensAI](https://github.com/laknanitish2110-sudo/Ai-Builds), an emotion-aware AI education platform. The memory module there proved the concept — this repo makes it universal.

## License

MIT
