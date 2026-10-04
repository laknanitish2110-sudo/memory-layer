# Memory Layer

Give any AI application persistent, user-owned memory.

Every AI app today has amnesia. Users re-explain themselves every session — their skills, preferences, goals, context. Memory Layer is a universal memory API that any AI application can plug into. Users own their data and control what each app can see.

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
  category: "skills",
});

// Next session: context() returns what you observed
```

Three methods cover 90% of use cases. The protocol handles user isolation, permissions, evidence tracking, and deduplication automatically.

## Get started

```bash
npm install @memory-layer/sdk
```

See the [SDK documentation](packages/sdk/README.md) for the full API reference, or run the [15-minute quickstart](examples/fifteen-minute-app/) to try it.

## How it works

```
Your AI app
    ↓
@memory-layer/sdk          ← thin client: ergonomics + transport + types
    ↓
Memory Layer API           ← authentication, validation, rate limiting
    ↓
Protocol Kernel            ← authorization, ingestion, context pipeline
    ↓
Postgres                   ← durable storage
```

The SDK is intentionally thin. It translates developer intent into HTTP requests. All security decisions — authorization, sensitivity enforcement, passport isolation — happen in the protocol kernel, server-side. The SDK cannot bypass them.

## What the protocol enforces

- **Passport isolation** — each user's data is completely isolated. One user can never access another's memory, even through the same application.
- **Binding authorization** — each application can only access what the user explicitly allowed.
- **Grant enforcement** — capabilities, categories, and sensitivity ceilings are checked on every request.
- **Evidence trail** — every observation is backed by evidence. The system knows what was observed, when, how, and by which application.
- **Deduplication** — duplicate observations strengthen existing claims instead of creating duplicates.
- **Claim lifecycle** — observations become claims through a pipeline. Claims can be confirmed, corrected, disputed, or deleted by the user.

You don't need to understand any of this to use the SDK.

## Architecture

```
packages/
├── sdk/              @memory-layer/sdk — developer-facing client
├── api/              HTTP API — Hono application, 19 endpoints
├── protocol/         Protocol kernel — authorization, ingestion, context
└── persistence/      Storage layer — Postgres adapter, SQL migrations

examples/
└── fifteen-minute-app/   Runnable quickstart
```

## Test coverage

523 tests across the full stack, no mocks:

| Layer | Tests | What it covers |
|-------|-------|----------------|
| Protocol | 109 | Authorization, ingestion, context, credentials, sensitivity |
| Persistence | 74 | Store contracts, SQL invariants, migration safety |
| API | 289 | HTTP adversarial (116), kernel adversarial (116), integration (57) |
| SDK | 51 | E2E through real HTTP stack (19), 15-min flow (1), adversarial (31) |

Every SDK test exercises the full path: SDK → HTTP → Middleware → Controller → Kernel → Repository.

## Origin

Extracted from [SensAI](https://github.com/laknanitish2110-sudo/Ai-Builds), an emotion-aware AI education platform. The memory module there proved the concept — this repo makes it universal.

## License

MIT
