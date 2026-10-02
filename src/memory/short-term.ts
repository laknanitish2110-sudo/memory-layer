import { v4 as uuid } from "uuid";
import type { Memory, StorageAdapter } from "../types.js";

export class ShortTermMemory {
  private storage: StorageAdapter;
  private defaultTTL: number;

  constructor(storage: StorageAdapter, defaultTTL = 3600) {
    this.storage = storage;
    this.defaultTTL = defaultTTL;
  }

  async remember(
    sessionId: string,
    key: string,
    content: string,
    metadata: Record<string, unknown> = {},
    ttl?: number,
  ): Promise<Memory> {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + (ttl ?? this.defaultTTL) * 1000,
    );
    const namespace = `session:${sessionId}`;

    const existing = await this.storage.get(namespace, key);
    const memory: Memory = {
      id: existing?.id ?? uuid(),
      namespace,
      key,
      content,
      metadata: { ...metadata, sessionId, type: "short-term" },
      createdAt: existing?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await this.storage.set(memory);
    return memory;
  }

  async recall(sessionId: string, key: string): Promise<Memory | null> {
    return this.storage.get(`session:${sessionId}`, key);
  }

  async forget(sessionId: string, key: string): Promise<boolean> {
    return this.storage.delete(`session:${sessionId}`, key);
  }

  async listSession(sessionId: string): Promise<Memory[]> {
    return this.storage.list({ namespace: `session:${sessionId}` });
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.storage.clear(`session:${sessionId}`);
  }
}
