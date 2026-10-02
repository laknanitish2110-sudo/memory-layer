import type { MemoryRecord } from "./types.js";

export class Memory {
  readonly id: string;
  readonly userId: string;
  readonly key: string;
  readonly value: unknown;
  readonly metadata: Record<string, unknown>;
  readonly appId?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(record: MemoryRecord) {
    this.id = record.id;
    this.userId = record.userId;
    this.key = record.key;
    this.value = record.value;
    this.metadata = record.metadata;
    this.appId = record.appId;
    this.createdAt = new Date(record.createdAt);
    this.updatedAt = new Date(record.updatedAt);
  }

  toJSON(): MemoryRecord {
    return {
      id: this.id,
      userId: this.userId,
      key: this.key,
      value: this.value,
      metadata: this.metadata,
      appId: this.appId,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
