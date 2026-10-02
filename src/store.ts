import type {
  UserProfile,
  SessionRecord,
  SessionPlan,
  MemorySnapshot,
  StorageAdapter,
  MemoryConfig,
} from "./types";

const DEFAULT_MAX_SESSIONS = 50;

function key(namespace: string, ...parts: string[]): string {
  return [namespace, ...parts].join(":");
}

function createDefaultProfile(userId: string): UserProfile {
  return {
    id: userId,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    totalSessions: 0,
    totalTimeMinutes: 0,
    metadata: {},
    preferences: {},
    patterns: {
      dominantStates: [],
      avgEngagement: 0,
      triggers: [],
    },
  };
}

export class MemoryStore {
  private storage: StorageAdapter;
  private ns: string;
  private userId: string;
  private maxSessions: number;

  constructor(config: MemoryConfig) {
    this.storage = config.storage;
    this.ns = config.namespace || config.appId;
    this.userId = config.userId || "default";
    this.maxSessions = config.maxSessions || DEFAULT_MAX_SESSIONS;
  }

  async getProfile(): Promise<UserProfile> {
    const profile = await this.storage.get<UserProfile>(
      key(this.ns, "profile", this.userId)
    );
    return profile || createDefaultProfile(this.userId);
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await this.storage.set(key(this.ns, "profile", this.userId), profile);
  }

  async getSessions(): Promise<SessionRecord[]> {
    const sessions = await this.storage.get<SessionRecord[]>(
      key(this.ns, "sessions", this.userId)
    );
    return sessions || [];
  }

  async getLastSession(): Promise<SessionRecord | null> {
    const sessions = await this.getSessions();
    return sessions.length > 0 ? sessions[sessions.length - 1] : null;
  }

  async getLastSessionForApp(appId: string): Promise<SessionRecord | null> {
    const sessions = await this.getSessions();
    for (let i = sessions.length - 1; i >= 0; i--) {
      if (sessions[i].appId === appId) return sessions[i];
    }
    return null;
  }

  async saveSession(session: SessionRecord): Promise<void> {
    const sessions = await this.getSessions();
    const existing = sessions.findIndex((s) => s.id === session.id);
    if (existing >= 0) {
      sessions[existing] = session;
    } else {
      sessions.push(session);
    }
    await this.storage.set(
      key(this.ns, "sessions", this.userId),
      sessions.slice(-this.maxSessions)
    );

    const profile = await this.getProfile();
    profile.lastActiveAt = Date.now();
    profile.totalSessions = sessions.length;
    if (session.durationMinutes > 0) {
      profile.totalTimeMinutes += session.durationMinutes;
    }
    await this.saveProfile(profile);
  }

  async getActivePlan(): Promise<SessionPlan | null> {
    return this.storage.get<SessionPlan>(key(this.ns, "plan", this.userId));
  }

  async savePlan(plan: SessionPlan | null): Promise<void> {
    if (plan) {
      await this.storage.set(key(this.ns, "plan", this.userId), plan);
    } else {
      await this.storage.delete(key(this.ns, "plan", this.userId));
    }
  }

  async getSnapshot(): Promise<MemorySnapshot> {
    const [profile, sessions, activePlan] = await Promise.all([
      this.getProfile(),
      this.getSessions(),
      this.getActivePlan(),
    ]);
    const lastSession =
      sessions.length > 0 ? sessions[sessions.length - 1] : null;
    return { profile, sessions, activePlan, lastSession };
  }

  async updatePatterns(
    dominantState: string,
    engagement: number
  ): Promise<void> {
    const profile = await this.getProfile();
    profile.patterns.dominantStates.push(dominantState);
    profile.patterns.dominantStates =
      profile.patterns.dominantStates.slice(-20);

    const rates = [profile.patterns.avgEngagement, engagement];
    profile.patterns.avgEngagement =
      rates.reduce((a, b) => a + b, 0) / rates.length;

    await this.saveProfile(profile);
  }
}
