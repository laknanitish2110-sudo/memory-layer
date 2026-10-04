import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const migrationsDir = join(import.meta.dirname, "../packages/persistence/migrations");

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`Found ${files.length} migrations:`);
for (const f of files) {
  console.log(`  ${f}`);
}

// Create a tracking table if it doesn't exist
const { error: trackError } = await supabase.rpc("exec_sql", {
  sql: `
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `,
});

if (trackError) {
  // If exec_sql RPC doesn't exist, try raw SQL via the REST endpoint
  // Supabase doesn't expose raw SQL by default — use the SQL editor or
  // run migrations manually via psql
  console.error("Cannot run SQL via RPC. Migrations must be applied manually.");
  console.error("Use the Supabase SQL Editor or psql to run these files in order:");
  for (const f of files) {
    console.log(`  ${join(migrationsDir, f)}`);
  }
  console.error("\nOr create an exec_sql RPC function:");
  console.error(`  CREATE OR REPLACE FUNCTION exec_sql(sql TEXT) RETURNS void AS $$`);
  console.error(`  BEGIN EXECUTE sql; END;`);
  console.error(`  $$ LANGUAGE plpgsql SECURITY DEFINER;`);
  process.exit(1);
}

let applied = 0;
let skipped = 0;

for (const file of files) {
  // Check if already applied
  const { data: existing } = await supabase
    .from("_migrations")
    .select("name")
    .eq("name", file)
    .maybeSingle();

  if (existing) {
    console.log(`  SKIP  ${file} (already applied)`);
    skipped++;
    continue;
  }

  const sql = readFileSync(join(migrationsDir, file), "utf-8");

  const { error } = await supabase.rpc("exec_sql", { sql });
  if (error) {
    console.error(`  FAIL  ${file}: ${error.message}`);
    process.exit(1);
  }

  // Record migration
  await supabase.from("_migrations").insert({ name: file });

  console.log(`  OK    ${file}`);
  applied++;
}

console.log(`\nDone. Applied: ${applied}, Skipped: ${skipped}, Total: ${files.length}`);
