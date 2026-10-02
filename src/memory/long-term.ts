import { v4 as uuid } from "uuid";
import type { Memory, MemoryQuery, StorageAdapter } from "../types.js";

export class LongTermMemory {
  private storage: StorageAdapter;
  private defaultNamespace: string;

  constructor(storage: StorageAdapter, defaultNamespace = "default") {
    this.storage = storage;
    this.defaultNamespace = defaultNamespace;
  }

  async store(
    key: string,
    content: string,
    metadata: Record<string, unknown> = {},
    namespace?: string,
  ): Promise<Memory> {
    const ns = namespace ?? this.defaultNamespace;
    const now = new Date();
    const existing = await this.storage.get(ns, key);

    const memory: Memory = {
      id: existing?.id ?? uuid(),
      namespace: ns,
      key,
      content,
      metadata: { ...metadata, type: "long-term" },
      createdAt: existing?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await this.storage.set(memory);
    return memory;
  }

  async retrieve(key: string, namespace?: string): Promise<Memory | null> {
    return this.storage.get(namespace ?? this.defaultNamespace, key);
  }

  async remove(key: string, namespace?: string): Promise<boolean> {
    return this.storage.delete(namespace ?? this.defaultNamespace, key);
  }

  async search(query: MemoryQuery): Promise<Memory[]> {
    return this.storage.list({
      ...query,
      namespace: query.namespace ?? this.defaultNamespace,
    });
  }

  async clear(namespace?: string): Promise<void> {
    await this.storage.clear(namespace ?? this.defaultNamespace);
  }
}
