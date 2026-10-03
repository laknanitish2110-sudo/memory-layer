import type { SupabaseClient } from "@supabase/supabase-js";
import type { Adapter, ListOptions, MemoryRecord } from "../types.js";

const TABLE = "memories";

export const MIGRATION_SQL = `
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  key text not null,
  value jsonb not null default '{}',
  metadata jsonb not null default '{}',
  app_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists idx_memories_user_id on memories (user_id);
create index if not exists idx_memories_user_key on memories (user_id, key);
create index if not exists idx_memories_app_id on memories (app_id);

alter table memories enable row level security;
`;

function toRecord(row: Record<string, unknown>): MemoryRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    key: row.key as string,
    value: row.value,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    appId: (row.app_id as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class SupabaseAdapter implements Adapter {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async get(userId: string, key: string): Promise<MemoryRecord | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .eq("key", key)
      .maybeSingle();

    if (error) throw new Error(`supabase get: ${error.message}`);
    return data ? toRecord(data) : null;
  }

  async set(record: MemoryRecord): Promise<void> {
    const { error } = await this.client.from(TABLE).upsert(
      {
        id: record.id,
        user_id: record.userId,
        key: record.key,
        value: record.value,
        metadata: record.metadata,
        app_id: record.appId ?? null,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
      { onConflict: "user_id,key" },
    );

    if (error) throw new Error(`supabase set: ${error.message}`);
  }

  async delete(userId: string, key: string): Promise<boolean> {
    const { count, error } = await this.client
      .from(TABLE)
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("key", key);

    if (error) throw new Error(`supabase delete: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async list(userId: string, options: ListOptions = {}): Promise<MemoryRecord[]> {
    let query = this.client.from(TABLE).select("*").eq("user_id", userId);

    if (options.appId) {
      query = query.eq("app_id", options.appId);
    }
    if (options.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        query = query.eq(`metadata->>${k}`, v);
      }
    }

    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;
    query = query.range(offset, offset + limit - 1).order("created_at");

    const { data, error } = await query;
    if (error) throw new Error(`supabase list: ${error.message}`);
    return (data ?? []).map(toRecord);
  }

  async clear(userId: string): Promise<void> {
    const { error } = await this.client
      .from(TABLE)
      .delete()
      .eq("user_id", userId);

    if (error) throw new Error(`supabase clear: ${error.message}`);
  }
}
