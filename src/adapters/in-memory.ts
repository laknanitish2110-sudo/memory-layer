import type { Adapter, ListOptions, MemoryRecord } from "../types.js";

export class InMemoryAdapter implements Adapter {
  private store = new Map<string, MemoryRecord>();

  private compositeKey(userId: string, key: string): string {
    return `${userId}\0${key}`;
  }

  async get(userId: string, key: string): Promise<MemoryRecord | null> {
    return this.store.get(this.compositeKey(userId, key)) ?? null;
  }

  async set(record: MemoryRecord): Promise<void> {
    this.store.set(this.compositeKey(record.userId, record.key), record);
  }

  async delete(userId: string, key: string): Promise<boolean> {
    return this.store.delete(this.compositeKey(userId, key));
  }

  async list(userId: string, options: ListOptions = {}): Promise<MemoryRecord[]> {
    const results: MemoryRecord[] = [];

    for (const record of this.store.values()) {
      if (record.userId !== userId) continue;
      if (options.appId && record.appId !== options.appId) continue;
      if (options.metadata) {
        const match = Object.entries(options.metadata).every(
          ([k, v]) => record.metadata[k] === v,
        );
        if (!match) continue;
      }
      results.push(record);
    }

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async clear(userId: string): Promise<void> {
    for (const [key, record] of this.store) {
      if (record.userId === userId) {
        this.store.delete(key);
      }
    }
  }
}
