import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type PersistenceClient = SupabaseClient;

export function createPersistenceClient(
  supabaseUrl: string,
  supabaseKey: string
): PersistenceClient {
  return createClient(supabaseUrl, supabaseKey);
}

export async function withPassportScope<T>(
  client: PersistenceClient,
  passportId: string,
  fn: (tx: PersistenceClient) => Promise<T>
): Promise<T> {
  await client.rpc("set_config", {
    setting: "app.passport_id",
    value: passportId,
    is_local: true,
  });
  return fn(client);
}
