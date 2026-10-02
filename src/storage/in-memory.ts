import type { Memory, MemoryQuery, StorageAdapter } from "../types.js";

export class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, Memory>();

  private makeKey(namespace: string, key: string): string {
    return `${namespace}::${key}`;
  }

  async get(namespace: string, key: string): Promise<Memory | null> {
    const memory = this.store.get(this.makeKey(namespace, key)) ?? null;
    if (memory?.expiresAt && new Date(memory.expiresAt) < new Date()) {
      this.store.delete(this.makeKey(namespace, key));
      return null;
    }
    return memory;
  }

  async set(memory: Memory): Promise<void> {
    this.store.set(this.makeKey(memory.namespace, memory.key), memory);
  }

  async delete(namespace: string, key: string): Promise<boolean> {
    return this.store.delete(this.makeKey(namespace, key));
  }

  async list(query: MemoryQuery): Promise<Memory[]> {
    const now = new Date();
    const results: Memory[] = [];

    for (const memory of this.store.values()) {
      if (memory.expiresAt && new Date(memory.expiresAt) < now) continue;
      if (query.namespace && memory.namespace !== query.namespace) continue;
      if (query.key && memory.key !== query.key) continue;
      if (query.metadata) {
        const match = Object.entries(query.metadata).every(
          ([k, v]) => memory.metadata[k] === v,
        );
        if (!match) continue;
      }
      results.push(memory);
    }

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async clear(namespace?: string): Promise<void> {
    if (!namespace) {
      this.store.clear();
      return;
    }
    for (const [key, memory] of this.store) {
      if (memory.namespace === namespace) {
        this.store.delete(key);
      }
    }
  }
}
