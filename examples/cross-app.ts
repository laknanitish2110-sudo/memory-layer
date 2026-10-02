import { Memory } from "../src";
import { LocalStorageAdapter } from "../src/adapters/localStorage";

async function demo() {
  const storage = new LocalStorageAdapter();

  // App 1: AI Tutor
  const tutorMemory = new Memory({
    appId: "ai-tutor",
    userId: "user-42",
    storage,
  });

  await tutorMemory.startSession();
  await tutorMemory.remember("learning_style", "visual");
  await tutorMemory.remember("current_topic", "machine-learning");
  await tutorMemory.endSession("Covered gradient descent", ["ml", "calculus"]);

  // App 2: Code Assistant (same user, different app, shared storage)
  const codeMemory = new Memory({
    appId: "code-assistant",
    userId: "user-42",
    storage,
  });

  // This app has its own session history, but can read user-level data
  const context = await codeMemory.recall();
  console.log("Code assistant context:", context);
  // → isReturningUser: false (first time in THIS app)

  await codeMemory.startSession();
  await codeMemory.remember("preferred_language", "python");
  await codeMemory.endSession("Built a simple neural net", ["python", "ml"]);

  // Back in the tutor — it remembers everything
  const tutorContext = await tutorMemory.recall();
  console.log("Tutor recall:", tutorContext);
  // → isReturningUser: true, summary includes gradient descent session
}

demo();
