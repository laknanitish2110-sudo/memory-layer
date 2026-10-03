export interface MemoryRecord {
  id: string;
  userId: string;
  key: string;
  value: unknown;
  metadata: Record<string, unknown>;
  appId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListOptions {
  appId?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface Adapter {
  get(userId: string, key: string): Promise<MemoryRecord | null>;
  set(record: MemoryRecord): Promise<void>;
  delete(userId: string, key: string): Promise<boolean>;
  list(userId: string, options?: ListOptions): Promise<MemoryRecord[]>;
  clear(userId: string): Promise<void>;
}

export interface MemoryStoreOptions {
  adapter?: Adapter;
  appId?: string;
}

export interface SetOptions {
  metadata?: Record<string, unknown>;
  appId?: string;
}

// --- Emotional context ---

export type Sentiment =
  | "positive"
  | "neutral"
  | "frustrated"
  | "confused"
  | "excited";

export interface Interaction {
  appId?: string;
  topic?: string;
  sentiment?: Sentiment;
  engagement?: number;
  duration?: number;
  frustrationTrigger?: string;
  learningMoment?: string;
  tags?: string[];
  notes?: string;
}

export interface UserTrait {
  category: "preference" | "skill" | "behavior" | "goal";
  value: unknown;
  confidence?: number;
}

export interface EmotionalSummary {
  totalInteractions: number;
  averageEngagement: number;
  sentimentDistribution: Record<Sentiment, number>;
  frustrationTriggers: string[];
  peakHours: number[];
  topTopics: string[];
  recentSentiment: Sentiment | null;
}

export interface ContextOptions {
  maxLength?: number;
  include?: ("traits" | "emotions" | "history" | "goals")[];
  appId?: string;
}
