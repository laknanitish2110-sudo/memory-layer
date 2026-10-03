import { describe, it, expect, beforeEach } from "vitest";
import { SupabaseEvidenceStore } from "../../src/evidence-store.js";
import { mockSupabaseClient, type MockClient } from "../helpers.js";

describe("SupabaseEvidenceStore — contract conformance", () => {
  let client: MockClient;
  let store: SupabaseEvidenceStore;

  const passportId = "passport_1";

  const baseEvidence = {
    id: "ev_1",
    claim_id: "cl_1",
    observation_id: "obs_1",
    source_type: 4,
    app_id: "app_1",
    experience_id: null,
    observed_at: "2024-01-01T00:00:00Z",
    raw_observation: "user wrote Python code",
    extraction_method: "app_measured",
    first_party: true,
    lineage: {
      origin_app_id: "app_1",
      origin_experience_id: "",
      chain: ["app_1"],
    },
    status: "active",
    retracted_at: null,
    retraction_reason: null,
    provenance_status: "active",
  };

  beforeEach(() => {
    client = mockSupabaseClient();
    store = new SupabaseEvidenceStore(client as never);
  });

  it("getEvidence returns null for non-existent evidence", async () => {
    const result = await store.getEvidence(passportId, "nonexistent");
    expect(result).toBeNull();
  });

  it("getEvidence maps row to Evidence type correctly", async () => {
    client._seed("evidence", [baseEvidence]);
    const result = await store.getEvidence(passportId, "ev_1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("ev_1");
    expect(result!.source_type).toBe(4);
    expect(result!.first_party).toBe(true);
    expect(result!.lineage.origin_app_id).toBe("app_1");
    expect(result!.status).toBe("active");
    expect(result!.provenance_status).toBe("active");
  });

  it("getEvidenceForClaim returns all evidence for claim", async () => {
    client._seed("evidence", [
      baseEvidence,
      { ...baseEvidence, id: "ev_2", status: "retracted" },
    ]);
    const result = await store.getEvidenceForClaim(passportId, "cl_1");
    expect(result.length).toBe(2);
  });

  it("getEvidenceForClaim filters by status", async () => {
    client._seed("evidence", [
      baseEvidence,
      { ...baseEvidence, id: "ev_2", status: "retracted" },
    ]);
    const result = await store.getEvidenceForClaim(
      passportId,
      "cl_1",
      "active"
    );
    expect(result.length).toBe(1);
    expect(result[0].status).toBe("active");
  });

  it("createEvidence inserts with correct fields", async () => {
    const evidence = {
      id: "ev_new",
      claim_id: "cl_1",
      observation_id: "obs_1",
      source_type: 5 as const,
      app_id: "app_1",
      experience_id: null,
      observed_at: "2024-06-01T00:00:00Z",
      raw_observation: "model inferred",
      extraction_method: "model_inferred",
      first_party: true,
      lineage: {
        origin_app_id: "app_1",
        origin_experience_id: "",
        chain: ["app_1"],
      },
      status: "active" as const,
      retracted_at: null,
      retraction_reason: null,
      provenance_status: "active" as const,
    };
    await store.createEvidence(passportId, evidence);
    expect(client.from).toHaveBeenCalledWith("evidence");
  });

  it("updateEvidence only updates status/retraction fields", async () => {
    client._seed("evidence", [baseEvidence]);
    const updated = {
      ...baseEvidence,
      status: "retracted" as const,
      retracted_at: "2024-06-01T00:00:00Z",
      retraction_reason: "user corrected",
      provenance_status: "retracted" as const,
      source_type: 4 as const,
      lineage: baseEvidence.lineage,
    };
    await store.updateEvidence(passportId, updated);
    expect(client.from).toHaveBeenCalledWith("evidence");
  });
});
