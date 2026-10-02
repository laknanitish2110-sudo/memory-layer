import type { StorageAdapter } from "../types";

export class LocalStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(prefix = "memory_layer") {
    this.prefix = prefix;
  }

  private fullKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(this.fullKey(key));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      localStorage.setItem(this.fullKey(key), JSON.stringify(value));
    } catch {
      // storage full or unavailable
    }
  }

  async delete(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.fullKey(key));
    } catch {
      // unavailable
    }
  }

  async list(prefix: string): Promise<string[]> {
    const fullPrefix = this.fullKey(prefix);
    const keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(fullPrefix)) {
          keys.push(k.slice(this.prefix.length + 1));
        }
      }
    } catch {
      // unavailable
    }
    return keys;
  }
}
