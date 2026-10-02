import { Memory } from "../src";
import { LocalStorageAdapter } from "../src/adapters/localStorage";

async function main() {
  // Initialize memory for your app
  const memory = new Memory({
    appId: "my-chatbot",
    storage: new LocalStorageAdapter(),
  });

  // Check if user has been here before
  const context = await memory.recall();

  if (context.isReturningUser) {
    console.log(`Welcome back! ${context.summary}`);
    console.log(`Suggested: ${context.suggestedAction}`);

    if (context.activePlanSummary) {
      console.log(`You had a plan: ${context.activePlanSummary}`);
    }
  } else {
    console.log("Welcome! This is your first session.");
  }

  // Get context to inject into your AI prompt
  const aiContext = await memory.contextForAI();
  console.log("AI context:", aiContext);

  // Start a session
  const session = await memory.startSession({ topic: "typescript" });
  console.log("Session started:", session.id);

  // Remember user preferences
  await memory.remember("skill_level", "intermediate");
  await memory.setPreference("response_style", "concise");

  // Later, retrieve them
  const level = await memory.get("skill_level");
  console.log("Skill level:", level);

  // End the session with a summary
  await memory.endSession(
    "Discussed TypeScript generics and type guards",
    ["typescript", "generics", "type-guards"]
  );

  // Plan for next time
  await memory.plan([
    "Cover utility types (Partial, Required, Pick)",
    "Build a type-safe API client",
  ]);
}

main();
