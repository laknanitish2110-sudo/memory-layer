# Memory Layer

**Your AI has amnesia. We fix that.**

Memory Layer is the universal memory system for AI applications. It gives every AI tool you use a shared understanding of who you are — your skills, preferences, frustrations, and goals — across every app, owned by you.

```typescript
import { MemoryStore, UserProfile } from "@memory-layer/core";

const store = new MemoryStore({ appId: "my-app" });
const profile = new UserProfile(store, "user-123");

// Track how the user felt, not just what they said
await profile.trackInteraction({
  topic: "recursion",
  sentiment: "frustrated",
  engagement: 0.3,
  frustrationTrigger: "abstract explanations without code",
});

// In a DIFFERENT app — one call, full understanding
const context = await profile.contextForAI();
// → "This user prefers code examples first, theory second.
//    They are beginner at python. They tend to get frustrated
//    with abstract explanations without code. Recently they
//    have been working on recursion."
```

## Why

Open ChatGPT. Ask "what did I struggle with last week?" It'll say *"I don't have access to previous conversations."* You've used it for months. It knows nothing about you.

Every AI app you use — coding assistants, tutors, writing tools — starts from scratch. Every. Single. Time.

**You are a stranger to every AI you've ever used.**

Memory Layer fixes this.

## What Makes It Different

| Feature | ChatGPT/Claude Memory | Mem0 / Zep | Memory Layer |
|---|---|---|---|
| Cross-app | No — siloed per platform | Developer-owned | User-owned, any app |
| Emotional context | No | No | Sentiment, frustration, engagement |
| Output format | Raw facts | Embeddings | Natural language understanding |
| Data ownership | Platform owns it | Developer owns it | **User** owns it |

**The key insight:** everyone is building memory *for their platform*. Nobody is building memory *for the user*.

## Install

```bash
npm install @memory-layer/core
```

## Quick Start

```typescript
import { MemoryStore, UserProfile, InMemoryAdapter } from "@memory-layer/core";

// 1. Create a store (InMemoryAdapter is the default for dev)
const store = new MemoryStore({ appId: "tutor-app" });
const profile = new UserProfile(store, "nitish");

// 2. Track interactions with emotional context
await profile.trackInteraction({
  topic: "Python basics",
  sentiment: "positive",
  engagement: 0.8,
  learningMoment: "understood list comprehensions",
});

await profile.trackInteraction({
  topic: "recursion",
  sentiment: "frustrated",
  engagement: 0.2,
  frustrationTrigger: "abstract explanations without concrete examples",
});

// 3. Set user traits
await profile.setTrait("learning_style", {
  category: "preference",
  value: "code examples first, theory second",
});

await profile.setTrait("python", {
  category: "skill",
  value: "Python",
  confidence: 0.35,
});

await profile.setTrait("deploy_goal", {
  category: "goal",
  value: "deploy a Python API to production by end of month",
});

// 4. Get synthesized context — one paragraph of understanding
const context = await profile.contextForAI();
console.log(context);
```

**Output:**
> This user prefers learning style: code examples first, theory second. They are beginner at python. They tend to get frustrated with abstract explanations without concrete examples. In their most recent session, they were frustrated. Recently they have been working on Python basics and recursion. Key breakthroughs: understood list comprehensions. Their goals: deploy a Python API to production by end of month.

## Cross-App Memory

The real power: memories set in App A are visible to App B.

```typescript
const sharedAdapter = new InMemoryAdapter();

// App A: Tutor
const tutorStore = new MemoryStore({ adapter: sharedAdapter, appId: "tutor" });
const tutorProfile = new UserProfile(tutorStore, "nitish");

await tutorProfile.trackInteraction({
  topic: "recursion",
  sentiment: "frustrated",
  frustrationTrigger: "abstract explanations without examples",
});

// App B: Code Assistant — NEVER saw the tutor session
const codeStore = new MemoryStore({ adapter: sharedAdapter, appId: "code-assistant" });
const codeProfile = new UserProfile(codeStore, "nitish");

const context = await codeProfile.contextForAI();
// → Includes the frustration from the tutor session!
// The code assistant now knows to use concrete examples.
```

## API

### `MemoryStore`

The core key-value store with pluggable adapters.

```typescript
const store = new MemoryStore({
  adapter: new InMemoryAdapter(), // or SupabaseAdapter for production
  appId: "my-app",               // tags all writes with this app ID
});

await store.set(userId, key, value);
await store.get(userId, key);
await store.delete(userId, key);
await store.list(userId, { appId, metadata, limit, offset });
await store.clear(userId);
```

### `UserProfile`

The emotional context layer — the differentiator.

#### `trackInteraction(interaction)`

Records a user interaction with sentiment and engagement data.

```typescript
await profile.trackInteraction({
  topic: "recursion",           // what they were working on
  sentiment: "frustrated",      // positive | neutral | frustrated | confused | excited
  engagement: 0.3,              // 0-1 scale
  frustrationTrigger: "...",    // what specifically frustrated them
  learningMoment: "...",        // what clicked
  appId: "tutor-app",           // which app recorded this
});
```

#### `setTrait(name, trait)` / `getTrait(name)`

Stores persistent user traits — preferences, skills, goals.

```typescript
await profile.setTrait("python", {
  category: "skill",       // preference | skill | behavior | goal
  value: "Python",
  confidence: 0.6,         // 0-1: beginner (<0.4), intermediate (0.4-0.7), advanced (>0.7)
});

const trait = await profile.getTrait("python");
```

#### `contextForAI(options?)`

Synthesizes everything into a natural-language paragraph for AI system prompts.

```typescript
const context = await profile.contextForAI();

// Filter sections:
const traitsOnly = await profile.contextForAI({ include: ["traits"] });
const emotionsAndGoals = await profile.contextForAI({ include: ["emotions", "goals"] });

// Limit length:
const short = await profile.contextForAI({ maxLength: 200 });
```

Sections: `traits` (preferences + skill levels), `emotions` (frustration triggers, engagement, recent sentiment), `history` (recent topics + learning moments), `goals`.

#### `getEmotionalSummary()`

Returns structured emotional analytics.

```typescript
const summary = await profile.getEmotionalSummary();
// {
//   totalInteractions: 4,
//   averageEngagement: 0.45,
//   sentimentDistribution: { positive: 1, frustrated: 2, confused: 1, ... },
//   frustrationTriggers: ["abstract explanations", "walls of theory text"],
//   topTopics: ["recursion", "Python basics"],
//   peakHours: [14, 21],
//   recentSentiment: "frustrated"
// }
```

### Adapters

| Adapter | Use case |
|---|---|
| `InMemoryAdapter` | Development and testing (default) |
| `SupabaseAdapter` | Production persistence with Postgres |

```typescript
import { SupabaseAdapter, MIGRATION_SQL } from "@memory-layer/core";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(url, key);
const adapter = new SupabaseAdapter(supabase);
const store = new MemoryStore({ adapter, appId: "my-app" });
```

Run `MIGRATION_SQL` against your Supabase project to create the required table and indexes.

## Demo

Run the interactive cross-app demo locally:

```bash
git clone https://github.com/laknanitish2110-sudo/memory-layer.git
cd memory-layer
npm install
npm run demo
```

Open `http://localhost:3210`:

1. **TutorAI** — Walk through a Python lesson. Give feedback on each topic. Get frustrated with recursion.
2. **CodeAssist** — Open the code assistant with the same user ID. It has *never seen your tutor sessions* — but it immediately knows your learning style, what frustrated you, and shows you recursion with actual code.

## Development

```bash
npm test          # run tests (61 tests)
npm run typecheck # type checking
npm run build     # build with tsup (ESM + CJS + .d.ts)
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   UserProfile                    │
│  trackInteraction · setTrait · contextForAI      │
├─────────────────────────────────────────────────┤
│                   MemoryStore                    │
│          get · set · delete · list · clear        │
├─────────────────────────────────────────────────┤
│                    Adapter                       │
│         InMemoryAdapter │ SupabaseAdapter         │
└─────────────────────────────────────────────────┘
```

Memories are scoped by `userId` and shared across apps. Each memory is tagged with the `appId` that wrote it, but readable by any app — cross-app memory by design.

## License

MIT
