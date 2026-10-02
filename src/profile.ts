import { randomUUID } from "node:crypto";
import type { MemoryStore } from "./store.js";
import type { Memory } from "./memory.js";
import type {
  ContextOptions,
  EmotionalSummary,
  Interaction,
  Sentiment,
  UserTrait,
} from "./types.js";

const PREFIX_INTERACTION = "_ml:interaction:";
const PREFIX_TRAIT = "_ml:trait:";

export class UserProfile {
  constructor(
    private store: MemoryStore,
    private userId: string,
  ) {}

  async trackInteraction(interaction: Interaction): Promise<Memory> {
    const id = randomUUID().slice(0, 8);
    return this.store.set(
      this.userId,
      `${PREFIX_INTERACTION}${id}`,
      {
        topic: interaction.topic,
        sentiment: interaction.sentiment ?? "neutral",
        engagement: interaction.engagement ?? 0.5,
        duration: interaction.duration,
        frustrationTrigger: interaction.frustrationTrigger,
        learningMoment: interaction.learningMoment,
        tags: interaction.tags ?? [],
        notes: interaction.notes,
        timestamp: new Date().toISOString(),
      },
      {
        appId: interaction.appId,
        metadata: { _type: "interaction" },
      },
    );
  }

  async setTrait(
    name: string,
    trait: UserTrait,
    appId?: string,
  ): Promise<Memory> {
    return this.store.set(this.userId, `${PREFIX_TRAIT}${name}`, trait, {
      appId,
      metadata: { _type: "trait", category: trait.category },
    });
  }

  async getTrait(name: string): Promise<UserTrait | null> {
    const mem = await this.store.get(this.userId, `${PREFIX_TRAIT}${name}`);
    return mem ? (mem.value as UserTrait) : null;
  }

  async getEmotionalSummary(): Promise<EmotionalSummary> {
    const interactions = await this.getInteractions();

    const sentimentDist: Record<Sentiment, number> = {
      positive: 0,
      neutral: 0,
      frustrated: 0,
      confused: 0,
      excited: 0,
    };

    const hourCounts = new Array<number>(24).fill(0);
    const topicCounts = new Map<string, number>();
    const frustrationTriggers: string[] = [];
    let engagementSum = 0;
    let recentSentiment: Sentiment | null = null;
    let latestTime = 0;

    for (const mem of interactions) {
      const data = mem.value as Record<string, unknown>;
      const sentiment = (data.sentiment as Sentiment) ?? "neutral";
      sentimentDist[sentiment]++;

      engagementSum += (data.engagement as number) ?? 0.5;

      if (data.topic) {
        const topic = data.topic as string;
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }

      if (data.frustrationTrigger) {
        frustrationTriggers.push(data.frustrationTrigger as string);
      }

      const ts = data.timestamp as string | undefined;
      if (ts) {
        const d = new Date(ts);
        hourCounts[d.getUTCHours()]++;
        if (d.getTime() > latestTime) {
          latestTime = d.getTime();
          recentSentiment = sentiment;
        }
      }
    }

    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter((h) => h.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((h) => h.hour);

    const topTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    const unique = (arr: string[]) => [...new Set(arr)];

    return {
      totalInteractions: interactions.length,
      averageEngagement:
        interactions.length > 0 ? engagementSum / interactions.length : 0,
      sentimentDistribution: sentimentDist,
      frustrationTriggers: unique(frustrationTriggers),
      peakHours,
      topTopics,
      recentSentiment,
    };
  }

  async contextForAI(options: ContextOptions = {}): Promise<string> {
    const include = options.include ?? [
      "traits",
      "emotions",
      "history",
      "goals",
    ];
    const parts: string[] = [];

    if (include.includes("traits")) {
      const traitSection = await this.buildTraitContext(options.appId);
      if (traitSection) parts.push(traitSection);
    }

    if (include.includes("emotions")) {
      const emotionSection = await this.buildEmotionalContext();
      if (emotionSection) parts.push(emotionSection);
    }

    if (include.includes("history")) {
      const historySection = await this.buildHistoryContext(options.appId);
      if (historySection) parts.push(historySection);
    }

    if (include.includes("goals")) {
      const goalSection = await this.buildGoalContext();
      if (goalSection) parts.push(goalSection);
    }

    const full = parts.join(" ");
    if (options.maxLength && full.length > options.maxLength) {
      return full.slice(0, options.maxLength - 1) + "…";
    }
    return full;
  }

  private async getInteractions(): Promise<Memory[]> {
    const all = await this.store.list(this.userId, { limit: 10000 });
    return all.filter((m) => m.key.startsWith(PREFIX_INTERACTION));
  }

  private async getTraits(): Promise<Map<string, UserTrait>> {
    const all = await this.store.list(this.userId, { limit: 10000 });
    const traits = new Map<string, UserTrait>();
    for (const mem of all) {
      if (mem.key.startsWith(PREFIX_TRAIT)) {
        const name = mem.key.slice(PREFIX_TRAIT.length);
        traits.set(name, mem.value as UserTrait);
      }
    }
    return traits;
  }

  private async buildTraitContext(appId?: string): Promise<string> {
    const traits = await this.getTraits();
    if (traits.size === 0) return "";

    const preferences: string[] = [];
    const skills: string[] = [];

    for (const [name, trait] of traits) {
      const label = name.replace(/_/g, " ");
      if (trait.category === "preference") {
        preferences.push(`${label}: ${trait.value}`);
      } else if (trait.category === "skill") {
        const level =
          typeof trait.confidence === "number"
            ? trait.confidence > 0.7
              ? "advanced"
              : trait.confidence > 0.4
                ? "intermediate"
                : "beginner"
            : null;
        skills.push(level ? `${level} at ${label}` : label);
      }
    }

    const parts: string[] = [];
    if (preferences.length > 0) {
      parts.push(
        `This user prefers ${preferences.join(", ").toLowerCase()}.`,
      );
    }
    if (skills.length > 0) {
      parts.push(`They are ${joinNatural(skills)}.`);
    }
    return parts.join(" ");
  }

  private async buildEmotionalContext(): Promise<string> {
    const summary = await this.getEmotionalSummary();
    if (summary.totalInteractions === 0) return "";

    const parts: string[] = [];

    if (summary.frustrationTriggers.length > 0) {
      parts.push(
        `They tend to get frustrated with ${joinNatural(summary.frustrationTriggers)}.`,
      );
    }

    if (summary.averageEngagement > 0.7) {
      parts.push("They are generally highly engaged.");
    } else if (summary.averageEngagement < 0.3) {
      parts.push("They tend to have low engagement and may need more interactive approaches.");
    }

    if (summary.recentSentiment && summary.recentSentiment !== "neutral") {
      const sentimentLabels: Record<Sentiment, string> = {
        positive: "positive and receptive",
        neutral: "neutral",
        frustrated: "frustrated",
        confused: "confused and may need clearer explanations",
        excited: "excited and highly motivated",
      };
      parts.push(
        `In their most recent session, they were ${sentimentLabels[summary.recentSentiment]}.`,
      );
    }

    if (summary.peakHours.length > 0) {
      const formatted = summary.peakHours
        .map((h) => `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`)
        .slice(0, 2);
      parts.push(`They are most active around ${joinNatural(formatted)}.`);
    }

    return parts.join(" ");
  }

  private async buildHistoryContext(appId?: string): Promise<string> {
    const interactions = await this.getInteractions();
    if (interactions.length === 0) return "";

    const recent = interactions
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 3);

    const topicMentions: string[] = [];
    const learningMoments: string[] = [];

    for (const mem of recent) {
      const data = mem.value as Record<string, unknown>;
      if (data.topic) topicMentions.push(data.topic as string);
      if (data.learningMoment)
        learningMoments.push(data.learningMoment as string);
    }

    const parts: string[] = [];
    if (topicMentions.length > 0) {
      parts.push(
        `Recently they have been working on ${joinNatural([...new Set(topicMentions)])}.`,
      );
    }
    if (learningMoments.length > 0) {
      parts.push(
        `Key breakthroughs: ${joinNatural(learningMoments)}.`,
      );
    }

    return parts.join(" ");
  }

  private async buildGoalContext(): Promise<string> {
    const traits = await this.getTraits();
    const goals: string[] = [];

    for (const [name, trait] of traits) {
      if (trait.category === "goal") {
        goals.push(String(trait.value));
      }
    }

    if (goals.length === 0) return "";
    return `Their goals: ${joinNatural(goals)}.`;
  }
}

function joinNatural(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
