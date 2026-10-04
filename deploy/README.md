# Deploy — M3.5 Test Environment

Minimal deployment to get a public HTTPS URL and three tester credentials.

## Prerequisites

- A Supabase project (free tier works): https://supabase.com/dashboard
- Node 22+ (for provisioning script)

## Step 1: Run migrations

Open the Supabase SQL Editor and run each file in order:

```
packages/persistence/migrations/001_identity.sql
packages/persistence/migrations/002_bindings.sql
packages/persistence/migrations/003_memory.sql
packages/persistence/migrations/004_credentials.sql
packages/persistence/migrations/005_audit.sql
packages/persistence/migrations/006_rls.sql
packages/persistence/migrations/007_force_rls.sql
```

Or, if you've created the `exec_sql` RPC function:

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJ... \
node --experimental-strip-types deploy/migrate.ts
```

## Step 2: Deploy the API

### Option A: Railway / Render / Fly.io

Set these env vars:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
PORT=3000
```

Deploy using the Dockerfile at the repo root.

### Option B: Run locally with ngrok

```bash
cd deploy && npm install
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJ... \
npx tsx server.ts
```

Then expose it:

```bash
ngrok http 3000
```

## Step 3: Provision testers

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJ... \
node --experimental-strip-types scripts/provision-tester.ts \
  --name "Alice" \
  --api-url https://your-api.railway.app
```

Repeat for Bob and Charlie. Each gets their own isolated passport.

## Step 4: Verify

From any machine:

```typescript
import { MemoryLayer } from "@memory-layer/sdk";

const memory = new MemoryLayer({
  apiKey: "app|...",           // from provisioning output
  baseUrl: "https://...",      // your deployed URL
});

// Should return empty items
const ctx = await memory.context();
console.log(ctx);

// Should return outcome: "accepted"
const result = await memory.observe({
  predicate: "knows",
  value: "TypeScript",
  category: "skills",
});
console.log(result);
```

## What this is NOT

- Not production infrastructure
- Not a signup system
- Not meant to survive past M3.5

The goal: one public HTTPS URL, three isolated credentials, hand them to three strangers, then watch.
