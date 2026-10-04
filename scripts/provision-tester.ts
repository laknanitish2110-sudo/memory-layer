/**
 * Provision a tester for M3.5 stranger test.
 *
 * Creates: account → passport → app_principal → binding → grant → token_family
 * All through the same Supabase stores the server uses.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node --experimental-strip-types \
 *     scripts/provision-tester.ts --name "Alice"
 *
 * Optional:
 *   --api-url https://your-deployed-api.com   (printed in output, default http://localhost:3000)
 *   --categories skills,preferences,goals      (write categories, default skills,preferences)
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    name: { type: "string", short: "n" },
    "api-url": { type: "string" },
    categories: { type: "string" },
  },
});

const testerName = values.name ?? "Tester";
const apiUrl = values["api-url"] ?? process.env.API_URL ?? "http://localhost:3000";
const writeCategories = (values.categories ?? "skills,preferences").split(",");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function genId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

const now = new Date().toISOString();

// 1. Create account (the user behind the passport)
const accountId = randomUUID();
const { error: acctErr } = await supabase.from("accounts").insert({
  id: accountId,
  auth_provider: "manual",
  auth_id: `tester_${testerName.toLowerCase().replace(/\s+/g, "_")}`,
  email: `${testerName.toLowerCase().replace(/\s+/g, ".")}@test.memorylayer.dev`,
  created_at: now,
});
if (acctErr) {
  console.error("Failed to create account:", acctErr.message);
  process.exit(1);
}

// 2. Create passport (the user's memory container)
const passportId = randomUUID();
const { error: pspErr } = await supabase.from("passports").insert({
  id: passportId,
  account_id: accountId,
  name: `${testerName}'s Passport`,
  created_at: now,
  is_ephemeral: false,
});
if (pspErr) {
  console.error("Failed to create passport:", pspErr.message);
  process.exit(1);
}

// 3. Create developer account (the app developer)
const developerId = randomUUID();
const { error: devErr } = await supabase.from("developer_accounts").insert({
  id: developerId,
  email: `dev.${testerName.toLowerCase().replace(/\s+/g, ".")}@test.memorylayer.dev`,
  verification_status: "verified",
  registered_at: now,
});
if (devErr) {
  console.error("Failed to create developer account:", devErr.message);
  process.exit(1);
}

// 4. Create app principal (the application identity)
const appPrincipalId = randomUUID();
const { error: appErr } = await supabase.from("app_principals").insert({
  id: appPrincipalId,
  developer_id: developerId,
  name: `${testerName}'s Test App`,
  description: `M3.5 stranger test app for ${testerName}`,
  declared_purposes: ["coding_assistance", "personalized_tutoring"],
  status: "active",
  registered_at: now,
});
if (appErr) {
  console.error("Failed to create app principal:", appErr.message);
  process.exit(1);
}

// 5. Create binding (app ↔ passport relationship)
const bindingId = randomUUID();
const grantId = randomUUID();
const { error: bndErr } = await supabase.from("bindings").insert({
  id: bindingId,
  passport_id: passportId,
  app_principal_id: appPrincipalId,
  status: "active",
  current_grant_id: null, // set after grant creation
  revision: 1,
  created_at: now,
});
if (bndErr) {
  console.error("Failed to create binding:", bndErr.message);
  process.exit(1);
}

// 6. Create grant (permissions)
const { error: grtErr } = await supabase.from("binding_grants").insert({
  id: grantId,
  binding_id: bindingId,
  version: 1,
  capabilities: ["read_context", "read_claims", "write_claims", "retract_own_observation"],
  data_policy: {
    read: {
      categories: ["skills", "preferences", "goals", "projects", "behavioral_patterns", "emotional_patterns", "personal_context"],
      sensitivity_ceiling: "personal",
    },
    write: {
      categories: writeCategories,
      sensitivity_ceiling: "personal",
      rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 },
      semantic_limits: { max_new_claims_per_category_per_day: 50, min_interval_same_tuple_hours: 1, max_active_claims_per_category: 500 },
      evidence_required: true,
    },
  },
  authorized_purposes: ["coding_assistance", "personalized_tutoring"],
  consent_record_id: randomUUID(),
  consented_at: now,
  consent_method: "initial_auth",
  active: true,
});
if (grtErr) {
  console.error("Failed to create grant:", grtErr.message);
  process.exit(1);
}

// 7. Link binding to grant
const { error: linkErr } = await supabase
  .from("bindings")
  .update({ current_grant_id: grantId })
  .eq("id", bindingId);
if (linkErr) {
  console.error("Failed to link binding to grant:", linkErr.message);
  process.exit(1);
}

// 8. Create token family (credential management)
const familyId = randomUUID();
const { error: famErr } = await supabase.from("token_families").insert({
  family_id: familyId,
  binding_id: bindingId,
  current_generation: 0,
  created_at: now,
});
if (famErr) {
  console.error("Failed to create token family:", famErr.message);
  process.exit(1);
}

// 9. Build the API key (same format the server's token validator expects)
const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
const apiKey = `app|${bindingId}|${familyId}|0|${expiresAt}`;

console.log(`
════════════════════════════════════════════════════
  Memory Layer — Tester Provisioned
════════════════════════════════════════════════════

  Tester:     ${testerName}
  API URL:    ${apiUrl}
  API Key:    ${apiKey}

  Write categories: ${writeCategories.join(", ")}

  ── For the tester's .env ──────────────────────

  MEMORY_LAYER_KEY=${apiKey}

  ── Quick verification ─────────────────────────

  import { MemoryLayer } from "@memory-layer/sdk";
  const memory = new MemoryLayer({
    apiKey: "${apiKey}",
    baseUrl: "${apiUrl}",
  });
  const ctx = await memory.context();
  console.log(ctx); // { items: [], generatedAt: "..." }

  ── Internal IDs (for debugging only) ──────────

  Account:       ${accountId}
  Passport:      ${passportId}
  App Principal: ${appPrincipalId}
  Binding:       ${bindingId}
  Grant:         ${grantId}
  Token Family:  ${familyId}

════════════════════════════════════════════════════
`);
