import type { PersistenceClient } from "./client.js";
import type {
  AccessEvent,
  Capability,
  ClaimCategory,
  Sensitivity,
} from "@memory-layer/protocol/src/memory/types.js";

function rowToAccessEvent(row: Record<string, unknown>): AccessEvent {
  return {
    id: row.id as string,
    binding_id: row.binding_id as string,
    grant_id: row.grant_id as string,
    credential_id: row.credential_id as string,
    capability_used: row.capability_used as Capability,
    categories_accessed: row.categories_accessed as ClaimCategory[],
    claims_served: (row.claims_served as string[]) ?? [],
    claims_served_count: row.claims_served_count as number,
    sensitivity_levels_touched: row.sensitivity_levels_touched as Sensitivity[],
    accessed_at: row.accessed_at as string,
    request_context: (row.request_context as string) ?? null,
    policy_version: row.policy_version as string,
    grant_version: row.grant_version as number,
    binding_revision: row.binding_revision as number,
  };
}

export interface AccessEventStore {
  createAccessEvent(event: AccessEvent): Promise<void>;
  getAccessEventsForBinding(bindingId: string): Promise<AccessEvent[]>;
  redactAccessEvent(eventId: string): Promise<void>;
}

export class SupabaseAccessEventStore implements AccessEventStore {
  constructor(private client: PersistenceClient) {}

  async createAccessEvent(event: AccessEvent): Promise<void> {
    const { error } = await this.client.from("access_events").insert({
      id: event.id,
      binding_id: event.binding_id,
      grant_id: event.grant_id,
      credential_id: event.credential_id,
      capability_used: event.capability_used,
      categories_accessed: event.categories_accessed,
      claims_served: event.claims_served,
      claims_served_count: event.claims_served_count,
      sensitivity_levels_touched: event.sensitivity_levels_touched,
      accessed_at: event.accessed_at,
      request_context: event.request_context,
      policy_version: event.policy_version,
      grant_version: event.grant_version,
      binding_revision: event.binding_revision,
    });
    if (error) throw error;
  }

  async getAccessEventsForBinding(
    bindingId: string
  ): Promise<AccessEvent[]> {
    const { data, error } = await this.client
      .from("access_events")
      .select("*")
      .eq("binding_id", bindingId)
      .order("accessed_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(rowToAccessEvent);
  }

  async redactAccessEvent(eventId: string): Promise<void> {
    const { error } = await this.client
      .from("access_events")
      .update({
        claims_served: [],
        claims_served_count: 0,
        resource_reference: "PURGED",
      })
      .eq("id", eventId);
    if (error) throw error;
  }
}
