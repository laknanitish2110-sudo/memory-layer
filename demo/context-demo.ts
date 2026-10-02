import { MemoryStore, UserProfile, InMemoryAdapter } from "../src/index.js";

async function main() {
const adapter = new InMemoryAdapter();
const store = new MemoryStore({ adapter, appId: "tutor-app" });
const profile = new UserProfile(store, "nitish");

// --- Simulate a week of interactions across two apps ---

// Day 1: Tutor app — learning Python basics
await profile.setTrait("learning_style", {
  category: "preference",
  value: "concise code examples with inline comments",
});
await profile.setTrait("python", {
  category: "skill",
  value: "Python",
  confidence: 0.35,
});
await profile.setTrait("sql", {
  category: "skill",
  value: "SQL",
  confidence: 0.8,
});
await profile.trackInteraction({
  topic: "Python basics",
  sentiment: "positive",
  engagement: 0.7,
  appId: "tutor-app",
  learningMoment: "understood list comprehensions",
});

// Day 2: Tutor app — recursion was hard
await profile.trackInteraction({
  topic: "recursion",
  sentiment: "frustrated",
  engagement: 0.3,
  frustrationTrigger: "abstract explanations without concrete examples",
  appId: "tutor-app",
});

// Day 3: Code assistant — different app, same user
const codeStore = new MemoryStore({ adapter, appId: "code-assistant" });
const codeProfile = new UserProfile(codeStore, "nitish");

await codeProfile.trackInteraction({
  topic: "Docker containers",
  sentiment: "excited",
  engagement: 0.9,
  learningMoment: "wrote first Dockerfile and deployed locally",
  appId: "code-assistant",
});

// Day 4: Goals
await profile.setTrait("deploy_goal", {
  category: "goal",
  value: "deploy a Python API to production by end of month",
});
await profile.setTrait("docker_goal", {
  category: "goal",
  value: "learn Kubernetes after mastering Docker",
});

// Day 5: More frustration with abstract content
await profile.trackInteraction({
  topic: "design patterns",
  sentiment: "confused",
  engagement: 0.2,
  frustrationTrigger: "walls of theory text",
  appId: "tutor-app",
});

// --- Now generate context from the CODE ASSISTANT's perspective ---
console.log("=== contextForAI() output ===\n");
const ctx = await codeProfile.contextForAI();
console.log(ctx);

console.log("\n=== Emotional Summary ===\n");
const summary = await codeProfile.getEmotionalSummary();
console.log(JSON.stringify(summary, null, 2));
}
main();
