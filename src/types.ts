export interface Memory {
  id: string;
  namespace: string;
  key: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface MemoryQuery {
  namespace?: string;
  key?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface SemanticQuery {
  namespace?: string;
  text?: string;
  embedding?: number[];
  topK?: number;
  threshold?: number;
}

export interface SemanticResult {
  memory: Memory;
  score: number;
}

export interface StorageAdapter {
  get(namespace: string, key: string): Promise<Memory | null>;
  set(memory: Memory): Promise<void>;
  delete(namespace: string, key: string): Promise<boolean>;
  list(query: MemoryQuery): Promise<Memory[]>;
  clear(namespace?: string): Promise<void>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

export interface MemoryLayerConfig {
  storage?: StorageAdapter;
  embedding?: EmbeddingProvider;
  defaultNamespace?: string;
  defaultTTL?: number;
}
