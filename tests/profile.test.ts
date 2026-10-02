import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../src/store.js";
import { UserProfile } from "../src/profile.js";
import { InMemoryAdapter } from "../src/adapters/in-memory.js";

describe("UserProfile", () => {
  let store: MemoryStore;
  let profile: UserProfile;

  beforeEach(() => {
    store = new MemoryStore({ adapter: new InMemoryAdapter() });
    profile = new UserProfile(store, "user-1");
  });

  describe("trackInteraction", () => {
    it("records an interaction as a memory", async () => {
      const mem = await profile.trackInteraction({
        topic: "recursion",
        sentiment: "frustrated",
        engagement: 0.3,
        frustrationTrigger: "abstract explanations",
        appId: "tutor-app",
      });

      expect(mem.key).toMatch(/^_ml:interaction:/);
      expect(mem.userId).toBe("user-1");
      const val = mem.value as Record<string, unknown>;
      expect(val.topic).toBe("recursion");
      expect(val.sentiment).toBe("frustrated");
    });

    it("records multiple interactions", async () => {
      await profile.trackInteraction({ topic: "arrays", sentiment: "positive" });
      await profile.trackInteraction({ topic: "loops", sentiment: "neutral" });
      await profile.trackInteraction({
        topic: "recursion",
        sentiment: "frustrated",
      });

      const all = await store.list("user-1");
      const interactions = all.filter((m) => m.key.startsWith("_ml:interaction:"));
      expect(interactions).toHaveLength(3);
    });
  });

  describe("setTrait / getTrait", () => {
    it("stores and retrieves a preference", async () => {
      await profile.setTrait("learning_style", {
        category: "preference",
        value: "examples and hands-on coding",
      });

      const trait = await profile.getTrait("learning_style");
      expect(trait).not.toBeNull();
      expect(trait!.category).toBe("preference");
      expect(trait!.value).toBe("examples and hands-on coding");
    });

    it("stores a skill with confidence", async () => {
      await profile.setTrait("python", {
        category: "skill",
        value: "Python",
        confidence: 0.6,
      });

      const trait = await profile.getTrait("python");
      expect(trait!.confidence).toBe(0.6);
    });

    it("stores a goal", async () => {
      await profile.setTrait("next_goal", {
        category: "goal",
        value: "learn Docker by end of month",
      });

      const trait = await profile.getTrait("next_goal");
      expect(trait!.value).toBe("learn Docker by end of month");
    });

    it("returns null for missing trait", async () => {
      const trait = await profile.getTrait("nonexistent");
      expect(trait).toBeNull();
    });
  });

  describe("getEmotionalSummary", () => {
    it("returns empty summary with no interactions", async () => {
      const summary = await profile.getEmotionalSummary();
      expect(summary.totalInteractions).toBe(0);
      expect(summary.averageEngagement).toBe(0);
      expect(summary.recentSentiment).toBeNull();
    });

    it("aggregates sentiment distribution", async () => {
      await profile.trackInteraction({ sentiment: "positive" });
      await profile.trackInteraction({ sentiment: "positive" });
      await profile.trackInteraction({ sentiment: "frustrated" });

      const summary = await profile.getEmotionalSummary();
      expect(summary.totalInteractions).toBe(3);
      expect(summary.sentimentDistribution.positive).toBe(2);
      expect(summary.sentimentDistribution.frustrated).toBe(1);
    });

    it("calculates average engagement", async () => {
      await profile.trackInteraction({ engagement: 0.8 });
      await profile.trackInteraction({ engagement: 0.6 });
      await profile.trackInteraction({ engagement: 1.0 });

      const summary = await profile.getEmotionalSummary();
      expect(summary.averageEngagement).toBeCloseTo(0.8, 1);
    });

    it("collects frustration triggers", async () => {
      await profile.trackInteraction({
        sentiment: "frustrated",
        frustrationTrigger: "abstract explanations",
      });
      await profile.trackInteraction({
        sentiment: "frustrated",
        frustrationTrigger: "too much theory",
      });
      await profile.trackInteraction({
        sentiment: "frustrated",
        frustrationTrigger: "abstract explanations",
      });

      const summary = await profile.getEmotionalSummary();
      expect(summary.frustrationTriggers).toContain("abstract explanations");
      expect(summary.frustrationTriggers).toContain("too much theory");
      expect(summary.frustrationTriggers).toHaveLength(2);
    });

    it("identifies top topics", async () => {
      await profile.trackInteraction({ topic: "recursion" });
      await profile.trackInteraction({ topic: "recursion" });
      await profile.trackInteraction({ topic: "arrays" });
      await profile.trackInteraction({ topic: "recursion" });
      await profile.trackInteraction({ topic: "arrays" });
      await profile.trackInteraction({ topic: "loops" });

      const summary = await profile.getEmotionalSummary();
      expect(summary.topTopics[0]).toBe("recursion");
      expect(summary.topTopics[1]).toBe("arrays");
    });

    it("tracks recent sentiment", async () => {
      await profile.trackInteraction({ sentiment: "positive" });
      await profile.trackInteraction({ sentiment: "frustrated" });
      // Most recent by timestamp
      const summary = await profile.getEmotionalSummary();
      expect(summary.recentSentiment).not.toBeNull();
    });
  });

  describe("contextForAI", () => {
    it("returns empty string with no data", async () => {
      const ctx = await profile.contextForAI();
      expect(ctx).toBe("");
    });

    it("includes traits in context", async () => {
      await profile.setTrait("learning_style", {
        category: "preference",
        value: "concise examples",
      });
      await profile.setTrait("python", {
        category: "skill",
        value: "Python",
        confidence: 0.8,
      });
      await profile.setTrait("sql", {
        category: "skill",
        value: "SQL",
        confidence: 0.5,
      });

      const ctx = await profile.contextForAI({ include: ["traits"] });
      expect(ctx).toContain("concise examples");
      expect(ctx).toContain("advanced at python");
      expect(ctx).toContain("intermediate at sql");
    });

    it("includes emotional context", async () => {
      await profile.trackInteraction({
        sentiment: "frustrated",
        engagement: 0.3,
        frustrationTrigger: "abstract explanations",
      });
      await profile.trackInteraction({
        sentiment: "frustrated",
        engagement: 0.2,
        frustrationTrigger: "walls of text",
      });

      const ctx = await profile.contextForAI({ include: ["emotions"] });
      expect(ctx).toContain("abstract explanations");
      expect(ctx).toContain("walls of text");
      expect(ctx).toContain("frustrated");
    });

    it("includes recent history", async () => {
      await profile.trackInteraction({
        topic: "Docker containers",
        learningMoment: "understood container vs image distinction",
      });

      const ctx = await profile.contextForAI({ include: ["history"] });
      expect(ctx).toContain("Docker containers");
      expect(ctx).toContain("container vs image distinction");
    });

    it("includes goals", async () => {
      await profile.setTrait("next_goal", {
        category: "goal",
        value: "learn Kubernetes by Friday",
      });

      const ctx = await profile.contextForAI({ include: ["goals"] });
      expect(ctx).toContain("learn Kubernetes by Friday");
    });

    it("synthesizes full context across all sections", async () => {
      await profile.setTrait("learning_style", {
        category: "preference",
        value: "hands-on examples",
      });
      await profile.setTrait("python", {
        category: "skill",
        value: "Python",
        confidence: 0.6,
      });
      await profile.setTrait("deploy_goal", {
        category: "goal",
        value: "deploy first app to production",
      });

      await profile.trackInteraction({
        topic: "Docker",
        sentiment: "excited",
        engagement: 0.9,
        learningMoment: "wrote first Dockerfile",
      });
      await profile.trackInteraction({
        topic: "networking",
        sentiment: "confused",
        engagement: 0.4,
        frustrationTrigger: "port mapping confusion",
      });

      const ctx = await profile.contextForAI();

      expect(ctx).toContain("hands-on examples");
      expect(ctx).toContain("intermediate at python");
      expect(ctx).toContain("port mapping confusion");
      expect(ctx).toContain("Docker");
      expect(ctx).toContain("wrote first Dockerfile");
      expect(ctx).toContain("deploy first app to production");
    });

    it("respects maxLength", async () => {
      await profile.setTrait("learning_style", {
        category: "preference",
        value: "very detailed step by step explanations with lots of examples",
      });
      await profile.trackInteraction({ topic: "a very long topic name" });
      await profile.trackInteraction({
        topic: "another topic",
        frustrationTrigger: "something",
      });

      const ctx = await profile.contextForAI({ maxLength: 50 });
      expect(ctx.length).toBeLessThanOrEqual(50);
      expect(ctx.endsWith("…")).toBe(true);
    });

    it("filters sections with include option", async () => {
      await profile.setTrait("python", {
        category: "skill",
        value: "Python",
        confidence: 0.8,
      });
      await profile.setTrait("goal1", {
        category: "goal",
        value: "learn Rust",
      });

      const traitsOnly = await profile.contextForAI({ include: ["traits"] });
      expect(traitsOnly).toContain("python");
      expect(traitsOnly).not.toContain("learn Rust");

      const goalsOnly = await profile.contextForAI({ include: ["goals"] });
      expect(goalsOnly).toContain("learn Rust");
      expect(goalsOnly).not.toContain("python");
    });
  });

  describe("cross-app emotional context", () => {
    it("interaction from App A is visible in App B's contextForAI", async () => {
      const sharedAdapter = new InMemoryAdapter();
      const storeA = new MemoryStore({ adapter: sharedAdapter, appId: "tutor" });
      const storeB = new MemoryStore({
        adapter: sharedAdapter,
        appId: "code-assistant",
      });

      const profileA = new UserProfile(storeA, "user-1");
      const profileB = new UserProfile(storeB, "user-1");

      await profileA.trackInteraction({
        topic: "recursion",
        sentiment: "frustrated",
        frustrationTrigger: "abstract explanations without examples",
        appId: "tutor",
      });

      await profileA.setTrait("learning_style", {
        category: "preference",
        value: "code examples first, theory second",
      });

      const ctx = await profileB.contextForAI();
      expect(ctx).toContain("abstract explanations without examples");
      expect(ctx).toContain("code examples first, theory second");
    });
  });
});
