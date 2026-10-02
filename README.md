# memory-layer

Universal memory layer for AI applications — short-term, long-term, and semantic memory with a REST API.

## Quick Start

```bash
npm install
npm start        # starts server on port 3210
```

## API

All endpoints are under `/api`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/memories/short-term/:sessionId` | Store session memory |
| GET | `/api/memories/short-term/:sessionId/:key` | Recall session memory |
| GET | `/api/memories/short-term/:sessionId` | List session memories |
| DELETE | `/api/memories/short-term/:sessionId/:key` | Forget session memory |
| DELETE | `/api/memories/short-term/:sessionId` | Clear session |
| POST | `/api/memories/long-term` | Store persistent memory |
| GET | `/api/memories/long-term/:key` | Retrieve persistent memory |
| DELETE | `/api/memories/long-term/:key` | Remove persistent memory |
| POST | `/api/memories/long-term/search` | Search persistent memories |
| POST | `/api/memories/semantic` | Add semantic memory |
| POST | `/api/memories/semantic/search` | Semantic similarity search |
| DELETE | `/api/memories/semantic/:key` | Remove semantic memory |

## Programmatic Usage

```typescript
import { MemoryLayer } from "memory-layer";

const ml = new MemoryLayer();

// Short-term (session-scoped, auto-expires)
await ml.shortTerm.remember("session-1", "mood", "happy");
await ml.shortTerm.recall("session-1", "mood");

// Long-term (persistent key-value)
await ml.longTerm.store("user-pref", "dark mode");
await ml.longTerm.retrieve("user-pref");

// Semantic (vector similarity search)
await ml.semantic.add("TypeScript is great for building APIs");
const results = await ml.semantic.search({ text: "building web services" });
```

## Development

```bash
npm run dev          # dev server with hot reload
npm test             # run tests
npm run typecheck    # type checking
npm run build        # compile to dist/
```
