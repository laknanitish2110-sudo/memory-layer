import { describe, it, expect, beforeEach } from "vitest";
import { SupabaseObservationStore } from "../../src/observation-store.js";
import { mockSupabaseClient, type MockClient } from "../helpers.js";

describe("SupabaseObservationStore — contract conformance", () => {
  let client: MockClient;
  let store: SupabaseObservationStore;

  const passportId = "passport_1";

  const baseObs = {
    id: "obs_1",
    idempotency_key: "idem_1",
    binding_id: "binding_1",
    experience_id: null,
    subject: "user",
    predicate: "knows",
    value: "Python",
    qualifiers: {},
    declared_sensitivity: "public",
    declared_category: "skills",
    extraction_method: "app_measured",
    raw_context: "user wrote Python code",
    submitted_at: "2024-01-01T00:00:00Z",
    outcome: null,
  };

  beforeEach(() => {
    client = mockSupabaseClient();
    store = new SupabaseObservationStore(client as never);
  });

  it("getObservation returns null for non-existent", async () => {
    const result = await store.getObservation(passportId, "nonexistent");
    expect(result).toBeNull();
  });

  it("getObservation maps row correctly", async () => {
    client._seed("observations", [baseObs]);
    const result = await store.getObservation(passportId, "obs_1");
    expect(result).not.toBeNull();
    expect(result!.idempotency_key).toBe("idem_1");
    expect(result!.binding_id).toBe("binding_1");
    expect(result!.declared_sensitivity).toBe("public");
    expect(result!.declared_category).toBe("skills");
    expect(result!.extraction_method).toBe("app_measured");
    expect(result!.outcome).toBeNull();
  });

  it("createObservation inserts correctly", async () => {
    const obs = {
      id: "obs_new",
      idempotency_key: "idem_new",
      binding_id: "binding_1",
      experience_id: null,
      subject: "user",
      predicate: "prefers",
      value: "dark mode",
      qualifiers: {},
      declared_sensitivity: "public" as const,
      declared_category: "preferences" as const,
      extraction_method: "user_stated" as const,
      raw_context: "user said they prefer dark mode",
      submitted_at: "2024-06-01T00:00:00Z",
      outcome: null,
    };
    await store.createObservation(passportId, obs);
    expect(client.from).toHaveBeenCalledWith("observations");
  });

  it("findByIdempotencyKey returns null for unknown key", async () => {
    const result = await store.findByIdempotencyKey("binding_1", "unknown");
    expect(result).toBeNull();
  });

  it("findByIdempotencyKey finds existing observation", async () => {
    client._seed("observations", [baseObs]);
    const result = await store.findByIdempotencyKey("binding_1", "idem_1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("obs_1");
  });

  it("findByIdempotencyKey scopes by binding_id", async () => {
    client._seed("observations", [baseObs]);
    const result = await store.findByIdempotencyKey(
      "other_binding",
      "idem_1"
    );
    expect(result).toBeNull();
  });

  it("updateObservation only updates outcome", async () => {
    client._seed("observations", [baseObs]);
    const updated = {
      ...baseObs,
      declared_sensitivity: "public" as const,
      declared_category: "skills" as const,
      extraction_method: "app_measured" as const,
      outcome: {
        status: "accepted" as const,
        evidence_id: "ev_1",
        claim_id: "cl_1",
      },
    };
    await store.updateObservation(passportId, updated);
    expect(client.from).toHaveBeenCalledWith("observations");
  });
});
