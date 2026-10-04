/**
 * Memory Layer — 15-minute quickstart
 *
 * This is the complete integration a developer should be able to write
 * within 15 minutes of reading the docs. If they can't, M3 has failed.
 */
import { MemoryLayer, MemoryPermissionError } from "@memory-layer/sdk";

// 1. Connect (one line)
const memory = new MemoryLayer({
  apiKey: process.env.MEMORY_LAYER_KEY,
});

// 2. Read what you know about this user
const ctx = await memory.context();

for (const item of ctx.items) {
  console.log(`${item.summary} (${item.confidence} confidence)`);
}

// 3. Record something new
const result = await memory.observe({
  predicate: "learning",
  value: "Rust",
  category: "skills",
});
console.log(`Observation ${result.outcome}: ${result.observationId}`);

// 4. Handle permission errors gracefully
try {
  await memory.observe({
    predicate: "feels",
    value: "frustrated",
    category: "emotional_patterns",
    sensitivity: "sensitive",
  });
} catch (err) {
  if (err instanceof MemoryPermissionError) {
    console.log(err.message);
    console.log(err.suggestion);
    // → "This application isn't authorized for that memory category."
    // → "Request access to additional categories with memory.permissions.request()."
  }
}

// 5. Filtered recall
const skills = await memory.recall({
  categories: ["skills"],
  limit: 10,
});

// 6. That's it. The protocol handles:
//    - Passport isolation (users can't see each other's data)
//    - Binding authorization (app can only access what the user allowed)
//    - Grant enforcement (capabilities, categories, sensitivity ceiling)
//    - Evidence trail (every observation is evidence-backed)
//    - Reconciliation (duplicate observations merge, not duplicate)
//    - Claim lifecycle (observations become claims through the pipeline)
//    - Token rotation (refresh tokens auto-rotate, reuse = family revocation)
//
// The developer doesn't need to know any of that.
