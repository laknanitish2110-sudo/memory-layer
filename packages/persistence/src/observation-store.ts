import type { PersistenceClient } from "./client.js";
import type { ObservationStore } from "@memory-layer/protocol/src/memory/repository.js";
import type {
  Observation,
  ObservationOutcome,
  Sensitivity,
  ClaimCategory,
} from "@memory-layer/protocol/src/memory/types.js";

function rowToObservation(row: Record<string, unknown>): Observation {
  return {
    id: row.id as string,
    idempotency_key: row.idempotency_key as string,
    binding_id: row.binding_id as string,
    experience_id: (row.experience_id as string) ?? null,
    subject: row.subject as string,
    predicate: row.predicate as string,
    value: row.value as string,
    qualifiers: (row.qualifiers as Record<string, string>) ?? {},
    declared_sensitivity: row.declared_sensitivity as Sensitivity,
    declared_category: row.declared_category as ClaimCategory,
    extraction_method: row.extraction_method as Observation["extraction_method"],
    raw_context: row.raw_context as string,
    submitted_at: row.submitted_at as string,
    outcome: (row.outcome as ObservationOutcome) ?? null,
  };
}

export class SupabaseObservationStore implements ObservationStore {
  constructor(private client: PersistenceClient) {}

  async getObservation(
    _passportId: string,
    observationId: string
  ): Promise<Observation | null> {
    const { data, error } = await this.client
      .from("observations")
      .select("*")
      .eq("id", observationId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return rowToObservation(data);
  }

  async createObservation(
    _passportId: string,
    observation: Observation
  ): Promise<void> {
    const { error } = await this.client.from("observations").insert({
      id: observation.id,
      idempotency_key: observation.idempotency_key,
      binding_id: observation.binding_id,
      experience_id: observation.experience_id,
      subject: observation.subject,
      predicate: observation.predicate,
      value: observation.value,
      qualifiers: observation.qualifiers,
      declared_sensitivity: observation.declared_sensitivity,
      declared_category: observation.declared_category,
      extraction_method: observation.extraction_method,
      raw_context: observation.raw_context,
      submitted_at: observation.submitted_at,
      outcome: observation.outcome,
    });
    if (error) throw error;
  }

  async updateObservation(
    _passportId: string,
    observation: Observation
  ): Promise<void> {
    const { error } = await this.client
      .from("observations")
      .update({
        outcome: observation.outcome,
      })
      .eq("id", observation.id);
    if (error) throw error;
  }

  async findByIdempotencyKey(
    bindingId: string,
    idempotencyKey: string
  ): Promise<Observation | null> {
    const { data, error } = await this.client
      .from("observations")
      .select("*")
      .eq("binding_id", bindingId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return rowToObservation(data);
  }
}
