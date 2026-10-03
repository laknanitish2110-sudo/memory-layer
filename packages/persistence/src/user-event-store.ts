import type { PersistenceClient } from "./client.js";
import type { UserMemoryEventStore } from "@memory-layer/protocol/src/memory/repository.js";
import type {
  UserMemoryEvent,
  UserMemoryAction,
  Sensitivity,
} from "@memory-layer/protocol/src/memory/types.js";

function rowToEvent(row: Record<string, unknown>): UserMemoryEvent {
  return {
    id: row.id as string,
    claim_id: row.claim_id as string,
    action: row.action as UserMemoryAction,
    previous_value: (row.previous_value as string) ?? null,
    new_value: (row.new_value as string) ?? null,
    previous_sensitivity: (row.previous_sensitivity as Sensitivity) ?? null,
    new_sensitivity: (row.new_sensitivity as Sensitivity) ?? null,
    performed_at: row.performed_at as string,
    creates_evidence_id: (row.creates_evidence_id as string) ?? null,
    creates_version_id: (row.creates_version_id as string) ?? null,
  };
}

export class SupabaseUserMemoryEventStore implements UserMemoryEventStore {
  constructor(private client: PersistenceClient) {}

  async createEvent(
    passportId: string,
    event: UserMemoryEvent
  ): Promise<void> {
    const { error } = await this.client.from("user_memory_events").insert({
      id: event.id,
      passport_id: passportId,
      claim_id: event.claim_id,
      action: event.action,
      previous_value: event.previous_value,
      new_value: event.new_value,
      previous_sensitivity: event.previous_sensitivity,
      new_sensitivity: event.new_sensitivity,
      performed_at: event.performed_at,
      creates_evidence_id: event.creates_evidence_id,
      creates_version_id: event.creates_version_id,
    });
    if (error) throw error;
  }

  async getEventsForClaim(
    _passportId: string,
    claimId: string
  ): Promise<UserMemoryEvent[]> {
    const { data, error } = await this.client
      .from("user_memory_events")
      .select("*")
      .eq("claim_id", claimId)
      .order("performed_at", { ascending: true });

    if (error) throw error;
    return (data ?? []).map(rowToEvent);
  }
}
