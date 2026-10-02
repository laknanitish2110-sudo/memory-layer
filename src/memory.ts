import type {
  MemoryConfig,
  SessionRecord,
  SessionPlan,
  RecallContext,
} from "./types";
import { MemoryStore } from "./store";
import { buildRecallContext, buildContextForAI } from "./recall";

export class Memory {
  private store: MemoryStore;
  private appId: string;
  private currentSession: SessionRecord | null = null;

  constructor(config: MemoryConfig) {
    this.store = new MemoryStore(config);
    this.appId = config.appId;
  }

  async recall(): Promise<RecallContext> {
    return buildRecallContext(this.store, this.appId);
  }

  async contextForAI(): Promise<string> {
    return buildContextForAI(this.store, this.appId);
  }

  async startSession(meta?: Record<string, unknown>): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      userId: (await this.store.getProfile()).id,
      appId: this.appId,
      startedAt: Date.now(),
      endedAt: null,
      durationMinutes: 0,
      context: meta || {},
      summary: "",
      tags: [],
      lastMessage: "",
    };
    this.currentSession = session;
    return session;
  }

  async endSession(summary?: string, tags?: string[]): Promise<void> {
    if (!this.currentSession) return;

    this.currentSession.endedAt = Date.now();
    this.currentSession.durationMinutes = Math.round(
      (Date.now() - this.currentSession.startedAt) / 60000
    );
    if (summary) this.currentSession.summary = summary;
    if (tags) this.currentSession.tags = tags;

    await this.store.saveSession(this.currentSession);
    this.currentSession = null;
  }

  async remember(key: string, value: unknown): Promise<void> {
    const profile = await this.store.getProfile();
    profile.metadata[key] = value;
    await this.store.saveProfile(profile);
  }

  async get(key: string): Promise<unknown> {
    const profile = await this.store.getProfile();
    return profile.metadata[key] ?? null;
  }

  async setPreference(key: string, value: unknown): Promise<void> {
    const profile = await this.store.getProfile();
    profile.preferences[key] = value;
    await this.store.saveProfile(profile);
  }

  async plan(goals: string[], notes?: string): Promise<void> {
    const plan: SessionPlan = {
      createdAt: Date.now(),
      targetDate: null,
      goals,
      appId: this.appId,
      context: {},
      notes: notes || "",
    };
    await this.store.savePlan(plan);
  }

  async getPlan(): Promise<SessionPlan | null> {
    return this.store.getActivePlan();
  }

  async clearPlan(): Promise<void> {
    await this.store.savePlan(null);
  }

  async updateEngagement(state: string, rate: number): Promise<void> {
    await this.store.updatePatterns(state, rate);
  }

  getStore(): MemoryStore {
    return this.store;
  }
}
