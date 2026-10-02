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

## The Startup Thesis

### The Problem
Every AI app has amnesia. Users re-explain themselves every session. No continuity across tools. When you switch from ChatGPT to Claude, you start from zero. Every. Single. Time.

### What Already Exists (and why it's not enough)
- **Native memory** (ChatGPT Memory, Claude Memory) — siloed to one platform, controlled by the company, not the user
- **Browser extensions** (conversation exporters, prompt managers) — move **conversations**, not understanding. Dumping 500 raw chat transcripts into another AI isn't memory, it's a data dump nobody reads
- **Dev tools** (Mem0, Zep, LangChain memory) — built by infra engineers for developers, focused on vector search and RAG. They solve "how to store embeddings" not "how to understand a human across apps"
- **Unified frontends** (TypingMind, OpenRouter) — one UI for multiple models, but memory is still per-conversation

### The Gap We Fill
The difference between moving data and moving understanding:

**What extensions do:** "Here are 500 conversations"
**What Memory Layer does:** "This user learns best with examples, gets frustrated with abstract explanations, is intermediate at Python, advanced at SQL, planned to learn Docker next week, and engages most between 9-11pm"

We don't dump transcripts. We build **compressed, actionable context** that any AI can immediately use. `memory.recall()` returns understanding, not history.

### What Makes Us Different
1. **Built from the user side, not the infra side.** We didn't start with "let's build a vector database." We started with "I was using AI and it forgot me and that felt broken." The frustration came first, the solution followed.
2. **Prototype proven inside a real product.** SensAI's memory layer wasn't theoretical — it solved real UX (tutor forgetting students between sessions). Most memory startups start with the SDK and hope someone uses it. We started with the product and extracted the SDK.
3. **Emotional context layer.** Nobody else tracks HOW the user felt during interactions. "You were frustrated last time we discussed recursion" is fundamentally different from "you asked about recursion." This is empathetic memory — not just data recall.
4. **User-owned, not developer-owned.** Mem0/Zep store data for the developer on their servers. We flip it: the USER owns the memory. Apps request access. Like Sign In with Google, but for AI memory. A user-facing dashboard where you see everything AI knows about you, across all your apps. You own it, delete it, export it, port it.
5. **Understanding layer, not plumbing.** Extensions move text. We move intelligence. The `contextForAI()` function doesn't return raw history — it returns a compressed profile any AI model can immediately act on.

### The Market Window
The big players (OpenAI, Anthropic, Google) will keep improving native memory. Our window is the gap between "AI has no memory" and "every AI has great memory." That's ~2-3 years. BUT — even when native memory improves, it stays siloed. ChatGPT won't natively share memory with Claude. Our layer sits BETWEEN them. Cross-platform, user-owned memory doesn't disappear when native memory gets better — it becomes more valuable because there's more to connect.

### The Solution
`@memory-layer/core` — a pluggable SDK:
- `memory.remember(key, value)` — store context
- `memory.recall()` — get compressed, actionable context back (not raw history)
- `memory.contextForAI()` — inject understanding into any AI prompt
- `memory.plan(goals)` — plan for next session
- `memory.updateEngagement(state, rate)` — track emotional/engagement patterns
- Pluggable storage: localStorage (offline), Supabase (cloud), custom adapters

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
