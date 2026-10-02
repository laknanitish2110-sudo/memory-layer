# Memory Layer — Startup Context

## What This Is
Universal memory layer for AI applications. An npm package that any AI app can plug into to get persistent, cross-session, user-owned memory. Started as a module inside SensAI (emotion-aware AI tutor), now its own project.

## Repo Structure
- `src/types.ts` — Core types: UserProfile, SessionRecord, SessionPlan, StorageAdapter
- `src/store.ts` — MemoryStore class: CRUD for profiles, sessions, plans
- `src/recall.ts` — Context building: buildRecallContext(), buildContextForAI()
- `src/memory.ts` — Memory class: high-level API (remember, recall, plan)
- `src/index.ts` — Barrel exports
- `src/adapters/localStorage.ts` — Browser storage adapter
- `src/adapters/supabase.ts` — Cloud sync adapter (Supabase)
- `examples/` — Usage examples

## The Startup Vision

### Problem
Every AI app has amnesia. Users re-explain themselves every session. No continuity across tools.

### Solution
`@memory-layer/core` — a pluggable SDK:
- `memory.remember(key, value)` — store context
- `memory.recall()` — get past context back
- `memory.contextForAI()` — inject into AI prompts
- `memory.plan(goals)` — plan for next session
- Pluggable storage: localStorage (offline), Supabase (cloud), custom adapters

### Key Design Decisions
- **Adapter pattern**: StorageAdapter interface so any backend works
- **Async-first**: All methods return Promises (even localStorage adapter) for universal compatibility
- **App-scoped**: Each app gets its own namespace, but user profile is shared
- **Privacy-first**: User owns their data. No tracking, no analytics, no third-party calls

## Roadmap
1. **v0.1** (current) — Core types, store, recall, localStorage adapter, Supabase adapter
2. **v0.2** — Tests, build pipeline, publish to npm
3. **v0.3** — Supabase migration script, auth integration, real cloud sync
4. **v0.4** — Smart context engine (relevance scoring, not just dump everything)
5. **v0.5** — Demo: same memory working across two different apps
6. **v1.0** — Production-ready SDK, docs site, pricing

## Origin
- **SensAI repo**: github.com/laknanitish2110-sudo/Ai-Builds
- **Original module**: `src/lib/memory/` in SensAI
- **Creator's words**: "its a real problem that is today... a small layer made by us today can be used by millions of people if it really solves the problem"

## Tech Stack
- TypeScript, zero runtime dependencies
- tsup for bundling (CJS + ESM + DTS)
- vitest for testing
- Supabase as optional cloud backend
