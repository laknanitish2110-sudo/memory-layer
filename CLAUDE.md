# Memory Layer — Startup Context

## What This Is
Universal memory layer for AI applications. Not another data pipeline or conversation exporter — an **understanding layer** that gives any AI app compressed, actionable knowledge about the user across sessions and across apps. Started as a module inside SensAI (emotion-aware AI tutor), now its own project.

## Repo Structure
- `src/types.ts` — Core types: UserProfile, SessionRecord, SessionPlan, StorageAdapter
- `src/store.ts` — MemoryStore class: CRUD for profiles, sessions, plans
- `src/recall.ts` — Context building: buildRecallContext(), buildContextForAI()
- `src/memory.ts` — Memory class: high-level API (remember, recall, plan)
- `src/index.ts` — Barrel exports
- `src/adapters/localStorage.ts` — Browser storage adapter
- `src/adapters/supabase.ts` — Cloud sync adapter (Supabase)
- `examples/` — Usage examples

## The Startup Thesis (Evolved)

### The Product: Memory Passport
Not an npm package. A **portable AI identity protocol with permissioned access.**

```
OLD POSITIONING:
"npm install our SDK, get memory"
(competes with Mem0 on infrastructure — you lose)

NEW POSITIONING:
"Your users sign in with Memory Passport.
Your app gets the context they choose to share.
You didn't build memory — you plugged into theirs."
(competes with nobody — new category)
```

### The Problem
Every AI app has amnesia. Users re-explain themselves every session. No continuity across tools. When you switch from ChatGPT to Claude, you start from zero. Every. Single. Time.

### What Already Exists (and why it's not enough)
- **Native memory** (ChatGPT Memory, Claude Memory) — siloed to one platform, controlled by the company, not the user
- **Mem0** ($7.5M funded) — graph memory, contradiction handling, temporal reasoning. Sells to DEVELOPERS. Developer owns the data, not the user
- **Zep** — temporal knowledge graphs, context engineering. Same developer-owned model
- **Browser extensions** — move conversations, not understanding
- **Unified frontends** (TypingMind, OpenRouter) — one UI for multiple models, memory still per-conversation

### The Competitive Insight
Don't compete BELOW Mem0 (on memory infrastructure — they win). Compete ABOVE. Could literally use Mem0 as a backend and build identity + permissions + portability on top.

Mem0 gives developers memory. Memory Passport gives users sovereignty over their AI identity.

### Why Mem0 Can't Copy This
Their business model prevents it. They sell to developers. Making memory user-owned means:
- Developer loses control of personalization data
- Users can take data to a competitor
- Pricing model breaks (who pays?)
- Classic innovator's dilemma

### What Makes Us Different
1. **User-owned, not developer-owned.** Apps request access. Like Sign In with Google, but for AI memory
2. **Cross-app identity.** Mem0 stores memories for one app. Memory Passport knows user_123 in App A is the same person as google_456 in App B
3. **Permissioned access.** Memory organized into scoped categories (skills, preferences, goals, projects, emotional patterns). Each app gets only what the user allows
4. **Memory revocation.** Users delete memories, revocation propagates to connected apps
5. **Prototype proven inside a real product.** SensAI's memory layer solved real UX before extraction
6. **Emotional context layer.** "You were frustrated last time we discussed recursion" vs "you asked about recursion"

### The Market Bet
Every big player (Apple, Google, OpenAI) benefits from memory SILOS. Portable memory helps users but hurts platforms. None will build it because it helps competitors. Same reason messaging never unified (iMessage vs RCS vs WhatsApp).

### The SDK (Current Implementation)
`@memory-layer/core` — the developer integration point:
- `memory.remember(key, value)` — store context
- `memory.recall()` — get compressed, actionable context back (not raw history)
- `memory.contextForAI()` — inject understanding into any AI prompt
- `memory.plan(goals)` — plan for next session
- `memory.updateEngagement(state, rate)` — track emotional/engagement patterns
- Pluggable storage: localStorage (offline), Supabase (cloud), custom adapters

### Go-to-Market Strategy
1. **Phase 1:** Sell SDK value to indie devs (AI tutors, coaches, companions). They integrate for good memory, not cross-app
2. **Phase 2:** Users start seeing "Sign in with Memory" buttons. Cross-app context becomes a bonus
3. **Phase 3:** User dashboard — see/edit/delete/export your AI memory across all apps
4. **Phase 4:** Memory Passport becomes the protocol. Mem0 plugs into it as a memory engine underneath

### Key Documents
- `FOUNDER-QA.md` — 12 hard founder questions answered honestly, with strength scoreboard and identified weak spots. Backbone of the pitch deck.

### Key Design Decisions
- **Adapter pattern**: StorageAdapter interface so any backend works
- **Async-first**: All methods return Promises (even localStorage adapter) for universal compatibility
- **App-scoped**: Each app gets its own namespace, but user profile is shared cross-app
- **Privacy-first**: User owns their data. No tracking, no analytics, no third-party calls
- **Understanding over data**: recall() returns insight, not dumps

## Roadmap
1. **v0.1** (current) — Core types, store, recall, localStorage adapter, Supabase adapter
2. **v0.2** — Tests, build pipeline, publish to npm
3. **v0.3** — Supabase migration script, auth integration, real cloud sync
4. **v0.4** — Smart context engine (relevance scoring, emotional context weighting)
5. **v0.5** — Demo: same memory working across two different apps
6. **v0.6** — User-facing memory dashboard (see/edit/delete/export your AI memory)
7. **v1.0** — Production-ready SDK, docs site, pricing, launch

## Origin
- **SensAI repo**: github.com/laknanitish2110-sudo/Ai-Builds
- **Original module**: `src/lib/memory/` in SensAI
- **Creator's words**: "its a real problem that is today... a small layer made by us today can be used by millions of people if it really solves the problem"
- **On the mindset**: "what makes us different is our mindset and how we can make it"

## Tech Stack
- TypeScript, zero runtime dependencies
- tsup for bundling (CJS + ESM + DTS)
- vitest for testing
- Supabase as optional cloud backend
