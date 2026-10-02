import { v4 as uuid } from "uuid";
import type {
  EmbeddingProvider,
  Memory,
  SemanticQuery,
  SemanticResult,
  StorageAdapter,
} from "../types.js";
import { cosineSimilarity } from "../utils/embeddings.js";

export class SemanticMemory {
  private storage: StorageAdapter;
  private embedding: EmbeddingProvider;
  private defaultNamespace: string;

  constructor(
    storage: StorageAdapter,
    embedding: EmbeddingProvider,
    defaultNamespace = "semantic",
  ) {
    this.storage = storage;
    this.embedding = embedding;
    this.defaultNamespace = defaultNamespace;
  }

  async add(
    content: string,
    metadata: Record<string, unknown> = {},
    namespace?: string,
    key?: string,
  ): Promise<Memory> {
    const ns = namespace ?? this.defaultNamespace;
    const now = new Date();
    const vec = await this.embedding.embed(content);
    const memoryKey = key ?? uuid();

    const existing = key ? await this.storage.get(ns, memoryKey) : null;
    const memory: Memory = {
      id: existing?.id ?? uuid(),
      namespace: ns,
      key: memoryKey,
      content,
      metadata: { ...metadata, type: "semantic" },
      embedding: vec,
      createdAt: existing?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await this.storage.set(memory);
    return memory;
  }

  async search(query: SemanticQuery): Promise<SemanticResult[]> {
    const ns = query.namespace ?? this.defaultNamespace;
    const topK = query.topK ?? 10;
    const threshold = query.threshold ?? 0;

    let queryEmbedding: number[];
    if (query.embedding) {
      queryEmbedding = query.embedding;
    } else if (query.text) {
      queryEmbedding = await this.embedding.embed(query.text);
    } else {
      return [];
    }

    const allMemories = await this.storage.list({ namespace: ns, limit: 10000 });
    const scored: SemanticResult[] = [];

    for (const memory of allMemories) {
      if (!memory.embedding) continue;
      const score = cosineSimilarity(queryEmbedding, memory.embedding);
      if (score >= threshold) {
        scored.push({ memory, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async remove(key: string, namespace?: string): Promise<boolean> {
    return this.storage.delete(namespace ?? this.defaultNamespace, key);
  }

  async clear(namespace?: string): Promise<void> {
    await this.storage.clear(namespace ?? this.defaultNamespace);
  }
}
