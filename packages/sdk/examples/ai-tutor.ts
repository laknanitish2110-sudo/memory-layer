/**
 * Memory Layer — AI Tutor Integration
 *
 * Shows how an AI application uses Memory Layer to remember
 * what a student knows across sessions.
 */
import { MemoryLayer } from "@memory-layer/sdk";

const memory = new MemoryLayer({
  apiKey: process.env.MEMORY_LAYER_KEY,
});

async function buildSystemPrompt(): Promise<string> {
  const ctx = await memory.context({
    categories: ["skills", "preferences", "goals"],
  });

  if (ctx.items.length === 0) {
    return "This is a new student. Start by asking what they'd like to learn.";
  }

  const skills = ctx.items
    .filter((i) => i.category === "skills")
    .map((i) => `- ${i.summary} (${i.confidence})`)
    .join("\n");

  const prefs = ctx.items
    .filter((i) => i.category === "preferences")
    .map((i) => `- ${i.summary}`)
    .join("\n");

  return [
    "You are a programming tutor. Here is what you know about this student:",
    "",
    skills ? `Skills:\n${skills}` : "No skills recorded yet.",
    "",
    prefs ? `Preferences:\n${prefs}` : "",
    "",
    "Adapt your teaching to their level. Don't re-explain things they already know.",
  ].join("\n");
}

async function afterConversation(transcript: string): Promise<void> {
  // The AI tutor observed that the student knows TypeScript
  await memory.observe({
    predicate: "knows",
    value: "TypeScript",
    category: "skills",
    method: "user_stated",
    context: transcript,
  });

  // The student prefers visual explanations
  await memory.observe({
    predicate: "prefers",
    value: "visual explanations with diagrams",
    category: "preferences",
    method: "model_inferred",
    context: transcript,
  });
}
