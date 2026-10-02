import type { StorageAdapter } from "../types";

interface SupabaseClient {
  from(table: string): {
    select(columns?: string): {
      eq(column: string, value: string): {
        single(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
        then(resolve: (result: { data: Record<string, unknown>[] | null; error: unknown }) => void): void;
      };
      like(column: string, pattern: string): Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
    };
    upsert(data: Record<string, unknown>): Promise<{ error: unknown }>;
    delete(): {
      eq(column: string, value: string): Promise<{ error: unknown }>;
    };
  };
}

export interface SupabaseAdapterConfig {
  client: SupabaseClient;
  table?: string;
}

export class SupabaseAdapter implements StorageAdapter {
  private client: SupabaseClient;
  private table: string;

  constructor(config: SupabaseAdapterConfig) {
    this.client = config.client;
    this.table = config.table || "memory_layer";
  }

  async get<T>(key: string): Promise<T | null> {
    const { data, error } = await this.client
      .from(this.table)
      .select("value")
      .eq("key", key)
      .single();

    if (error || !data) return null;
    return data.value as T;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.client.from(this.table).upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.from(this.table).delete().eq("key", key);
  }

  async list(prefix: string): Promise<string[]> {
    const { data, error } = await this.client
      .from(this.table)
      .select("key")
      .like("key", `${prefix}%`);

    if (error || !data) return [];
    return data.map((row) => row.key as string);
  }
}

export const SUPABASE_MIGRATION = `
create table if not exists memory_layer (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create index if not exists idx_memory_layer_key_prefix
  on memory_layer using btree (key text_pattern_ops);
`;
