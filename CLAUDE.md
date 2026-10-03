# Memory Layer — Startup Context

## What This Is
Universal memory layer for AI applications. Not another data pipeline or conversation exporter — an **understanding layer** that gives any AI app compressed, actionable knowledge about the user across sessions and across apps. Started as a module inside SensAI (emotion-aware AI tutor), now its own project.

## Repo Structure
- `src/types.ts` — Core types: MemoryRecord, Adapter, Sentiment, Interaction, UserTrait, EmotionalSummary, ContextOptions
- `src/store.ts` — MemoryStore class: key-value CRUD with pluggable adapters and cross-app appId tagging
- `src/memory.ts` — Memory class: wrapper around MemoryRecord with Date parsing and toJSON()
- `src/profile.ts` — UserProfile class: emotional context layer (trackInteraction, setTrait, contextForAI, getEmotionalSummary)
- `src/index.ts` — Barrel exports
- `src/adapters/in-memory.ts` — In-memory adapter (Map-based, for dev/testing)
- `src/adapters/supabase.ts` — Supabase adapter (production persistence with Postgres)
- `tests/` — 61 vitest tests covering all classes and cross-app scenarios
- `demo/` — Interactive cross-app demo (TutorAI + CodeAssist + landing page)
- `FOUNDER-QA.md` — 12 hard founder questions answered honestly

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

**MemoryStore** — key-value store with pluggable adapters:
- `store.set(userId, key, value, { appId, metadata })` — store memory
- `store.get(userId, key)` — retrieve memory
- `store.list(userId, { appId, metadata, limit })` — list memories
- `store.delete(userId, key)` / `store.clear(userId)` — cleanup

**UserProfile** — the emotional context layer (the differentiator):
- `profile.trackInteraction({ topic, sentiment, engagement, frustrationTrigger, learningMoment })` — track HOW the user felt
- `profile.setTrait(name, { category, value, confidence })` — set preferences, skills, goals
- `profile.getTrait(name)` — retrieve a trait
- `profile.contextForAI({ include, maxLength })` — compressed natural-language understanding paragraph
- `profile.getEmotionalSummary()` — structured emotional analytics

**Adapters:**
- `InMemoryAdapter` — Map-based, for dev/testing (default)
- `SupabaseAdapter` — Postgres persistence with upsert and RLS

### What Needs Building Next (Memory Passport Protocol)
1. **Permission scopes** — apps request access to categories (skills, preferences, goals, projects, emotional patterns). Users approve/deny
2. **Memory provenance** — source app, confidence score, timestamp, sensitivity level on every memory
3. **Revocation signals** — user deletes a memory, connected apps get notified
4. **Temporal versioning** — contradiction handling instead of overwriting. Most recent + highest confidence wins
5. **User dashboard** — see/edit/delete/export all AI memories across connected apps

### Go-to-Market Strategy
1. **Phase 1:** Sell SDK value to indie devs (AI tutors, coaches, companions). They integrate for good memory, not cross-app
2. **Phase 2:** Users start seeing "Sign in with Memory" buttons. Cross-app context becomes a bonus
3. **Phase 3:** User dashboard — see/edit/delete/export your AI memory across all apps
4. **Phase 4:** Memory Passport becomes the protocol. Mem0 plugs into it as a memory engine underneath

### Key Documents
- `FOUNDER-QA.md` — 12 hard founder questions answered honestly, with strength scoreboard and identified weak spots. Backbone of the pitch deck

### Key Design Decisions
- **Adapter pattern**: Adapter interface so any backend works (InMemory, Supabase, future: Mem0 as backend)
- **Async-first**: All methods return Promises for universal compatibility
- **App-scoped writes, user-scoped reads**: Each write is tagged with appId, but all memories are readable cross-app by userId
- **Privacy-first**: User owns their data. No tracking, no analytics, no third-party calls
- **Understanding over data**: contextForAI() returns compressed natural language, not stat dumps
- **Internal key prefixes**: `_ml:interaction:{uuid}` for interactions, `_ml:trait:{name}` for traits

## Current State
- **v0.1** — Core SDK complete: MemoryStore, Memory, UserProfile, InMemoryAdapter, SupabaseAdapter
- Build: tsup (ESM + CJS) + tsc (declarations). 61 tests passing
- Demo: interactive cross-app experience (TutorAI + CodeAssist + landing page) at localhost:3210
- README: polished with pitch, comparison table, full API reference
- Supabase project created with migration applied

## Roadmap (What's Next)
1. **v0.2** — Permission scopes: `memory.requestAccess(["skills", "preferences"])`, user approval flow
2. **v0.3** — Memory provenance: source, confidence, timestamp, sensitivity on every record
3. **v0.4** — Revocation signals: delete propagation to connected apps
4. **v0.5** — Temporal versioning: contradiction detection and resolution
5. **v0.6** — User dashboard: see/edit/delete/export AI memory
6. **v1.0** — Memory Passport protocol, auth integration, production launch

## Origin
- **SensAI repo**: github.com/laknanitish2110-sudo/Ai-Builds
- **Original module**: `src/lib/memory/` in SensAI
- **Creator's words**: "its a real problem that is today... a small layer made by us today can be used by millions of people if it really solves the problem"
- **On the mindset**: "what makes us different is our mindset and how we can make it"

## Tech Stack
- TypeScript, zero runtime dependencies
- tsup for bundling (CJS + ESM)
- tsc for declarations (emitDeclarationOnly — tsup DTS incompatible with TS 7)
- vitest for testing
- Supabase as optional cloud backend (peer dependency)
