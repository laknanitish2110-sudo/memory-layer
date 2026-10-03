import { randomUUID } from "node:crypto";
import { Memory } from "./memory.js";
import { InMemoryAdapter } from "./adapters/in-memory.js";
import type { Adapter, ListOptions, MemoryStoreOptions, SetOptions } from "./types.js";

export class MemoryStore {
  private adapter: Adapter;
  private appId?: string;

  constructor(options: MemoryStoreOptions = {}) {
    this.adapter = options.adapter ?? new InMemoryAdapter();
    this.appId = options.appId;
  }

  async get(userId: string, key: string): Promise<Memory | null> {
    const record = await this.adapter.get(userId, key);
    return record ? new Memory(record) : null;
  }

  async set(
    userId: string,
    key: string,
    value: unknown,
    options: SetOptions = {},
  ): Promise<Memory> {
    const now = new Date().toISOString();
    const existing = await this.adapter.get(userId, key);

    const record = {
      id: existing?.id ?? randomUUID(),
      userId,
      key,
      value,
      metadata: options.metadata ?? existing?.metadata ?? {},
      appId: options.appId ?? this.appId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.adapter.set(record);
    return new Memory(record);
  }

  async delete(userId: string, key: string): Promise<boolean> {
    return this.adapter.delete(userId, key);
  }

  async list(userId: string, options?: ListOptions): Promise<Memory[]> {
    const records = await this.adapter.list(userId, options);
    return records.map((r) => new Memory(r));
  }

  async clear(userId: string): Promise<void> {
    await this.adapter.clear(userId);
  }
}
