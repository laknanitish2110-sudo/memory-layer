export interface UserProfile {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  totalSessions: number;
  totalTimeMinutes: number;
  metadata: Record<string, unknown>;
  preferences: Record<string, unknown>;
  patterns: {
    dominantStates: string[];
    avgEngagement: number;
    triggers: string[];
  };
}

export interface SessionRecord {
  id: string;
  userId: string;
  appId: string;
  startedAt: number;
  endedAt: number | null;
  durationMinutes: number;
  context: Record<string, unknown>;
  summary: string;
  tags: string[];
  lastMessage: string;
}

export interface SessionPlan {
  createdAt: number;
  targetDate: string | null;
  goals: string[];
  appId: string;
  context: Record<string, unknown>;
  notes: string;
}

export interface MemorySnapshot {
  profile: UserProfile;
  sessions: SessionRecord[];
  activePlan: SessionPlan | null;
  lastSession: SessionRecord | null;
}

export interface RecallContext {
  isReturningUser: boolean;
  timeSinceLastSession: string;
  summary: string;
  lastAppId: string | null;
  activePlanSummary: string | null;
  sessionCount: number;
  totalMinutes: number;
  suggestedAction: "continue" | "review" | "new" | "planned";
}

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export interface MemoryConfig {
  appId: string;
  userId?: string;
  storage: StorageAdapter;
  maxSessions?: number;
  namespace?: string;
}
