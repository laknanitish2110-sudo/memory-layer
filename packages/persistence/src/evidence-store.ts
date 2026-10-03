import type { PersistenceClient } from "./client.js";
import type { EvidenceStore } from "@memory-layer/protocol/src/memory/repository.js";
import type {
  Evidence,
  EvidenceLineage,
  EvidenceStatus,
  EvidenceTier,
  ProvenanceStatus,
} from "@memory-layer/protocol/src/memory/types.js";

function rowToEvidence(row: Record<string, unknown>): Evidence {
  return {
    id: row.id as string,
    claim_id: row.claim_id as string,
    observation_id: (row.observation_id as string) ?? null,
    source_type: row.source_type as EvidenceTier,
    app_id: row.app_id as string,
    experience_id: (row.experience_id as string) ?? null,
    observed_at: row.observed_at as string,
    raw_observation: row.raw_observation as string,
    extraction_method: row.extraction_method as string,
    first_party: row.first_party as boolean,
    lineage: row.lineage as EvidenceLineage,
    status: row.status as EvidenceStatus,
    retracted_at: (row.retracted_at as string) ?? null,
    retraction_reason: (row.retraction_reason as string) ?? null,
    provenance_status: row.provenance_status as ProvenanceStatus,
  };
}

export class SupabaseEvidenceStore implements EvidenceStore {
  constructor(private client: PersistenceClient) {}

  async getEvidence(
    _passportId: string,
    evidenceId: string
  ): Promise<Evidence | null> {
    const { data, error } = await this.client
      .from("evidence")
      .select("*")
      .eq("id", evidenceId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return rowToEvidence(data);
  }

  async getEvidenceForClaim(
    _passportId: string,
    claimId: string,
    status?: EvidenceStatus
  ): Promise<Evidence[]> {
    let q = this.client
      .from("evidence")
      .select("*")
      .eq("claim_id", claimId);

    if (status) {
      q = q.eq("status", status);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(rowToEvidence);
  }

  async createEvidence(
    _passportId: string,
    evidence: Evidence
  ): Promise<void> {
    const { error } = await this.client.from("evidence").insert({
      id: evidence.id,
      claim_id: evidence.claim_id,
      observation_id: evidence.observation_id,
      source_type: evidence.source_type,
      app_id: evidence.app_id,
      experience_id: evidence.experience_id,
      observed_at: evidence.observed_at,
      raw_observation: evidence.raw_observation,
      extraction_method: evidence.extraction_method,
      first_party: evidence.first_party,
      lineage: evidence.lineage,
      status: evidence.status,
      retracted_at: evidence.retracted_at,
      retraction_reason: evidence.retraction_reason,
      provenance_status: evidence.provenance_status,
    });
    if (error) throw error;
  }

  async updateEvidence(
    _passportId: string,
    evidence: Evidence
  ): Promise<void> {
    const { error } = await this.client
      .from("evidence")
      .update({
        status: evidence.status,
        retracted_at: evidence.retracted_at,
        retraction_reason: evidence.retraction_reason,
        provenance_status: evidence.provenance_status,
      })
      .eq("id", evidence.id);
    if (error) throw error;
  }
}
