/**
 * Memory Layer — 15-minute quickstart
 *
 * Run: MEMORY_LAYER_KEY=ml_xxx npx tsx src/index.ts
 */
import { MemoryLayer, MemoryPermissionError } from "@memory-layer/sdk";

const memory = new MemoryLayer({
  apiKey: process.env.MEMORY_LAYER_KEY,
});

// ── Step 1: Check what you already know about this user ─────────

const existing = await memory.context();

if (existing.items.length === 0) {
  console.log("First session — no memories yet.\n");
} else {
  console.log("Returning user! Here's what we remember:\n");
  for (const item of existing.items) {
    console.log(`  ${item.summary}  (${item.confidence} confidence)`);
  }
  console.log();
}

// ── Step 2: Record what you learned in this session ─────────────

const obs1 = await memory.observe({
  predicate: "learning",
  value: "Rust",
  category: "skills",
});
console.log(`Observed: user is learning Rust  →  ${obs1.outcome}`);

const obs2 = await memory.observe({
  predicate: "prefers",
  value: "visual explanations with diagrams",
  category: "preferences",
  method: "model_inferred",
  context: "User responded better to diagrams than text-heavy explanations",
});
console.log(`Observed: prefers visual explanations  →  ${obs2.outcome}`);

// ── Step 3: Read back — context now includes both observations ──

const updated = await memory.context();

console.log(`\nMemory now has ${updated.items.length} item(s):\n`);
for (const item of updated.items) {
  console.log(`  [${item.category}] ${item.summary}  (${item.confidence})`);
}

// ── Step 4: Filter by category ──────────────────────────────────

const skills = await memory.context({ categories: ["skills"] });
console.log(`\nSkills only: ${skills.items.length} item(s)`);

// ── Step 5: Handle permission boundaries gracefully ─────────────

try {
  await memory.observe({
    predicate: "diagnosed_with",
    value: "anxiety",
    category: "health",
    sensitivity: "sensitive",
  });
} catch (err) {
  if (err instanceof MemoryPermissionError) {
    console.log(`\nPermission boundary working:`);
    console.log(`  ${err.message}`);
    console.log(`  Suggestion: ${err.suggestion}`);
  } else {
    throw err;
  }
}

console.log("\nDone. Your AI app now has persistent memory.");
