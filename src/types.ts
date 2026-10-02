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
