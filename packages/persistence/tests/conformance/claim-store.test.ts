import { describe, it, expect, beforeEach } from "vitest";
import { SupabaseClaimStore } from "../../src/claim-store.js";
import { mockSupabaseClient, type MockClient } from "../helpers.js";

describe("SupabaseClaimStore — contract conformance", () => {
  let client: MockClient;
  let store: SupabaseClaimStore;

  const passportId = "passport_1";
  const otherPassportId = "passport_2";

  const baseClaim = {
    id: "cl_1",
    passport_id: passportId,
    subject: "user",
    predicate: "knows",
    value: "Python",
    qualifiers: {},
    category: "skills",
    tags: [],
    state: "OBSERVED",
    declared_state: null,
    observed_state: "OBSERVED",
    volatility: "stable",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    last_confirmed_at: null,
    expires_at: null,
    sensitivity: "public",
    sharing_policy: { type: "grant_controlled" },
    current_version_id: "cv_1",
    deleted: false,
    deleted_at: null,
  };

  beforeEach(() => {
    client = mockSupabaseClient();
    store = new SupabaseClaimStore(client as never);
  });

  it("getClaim returns null for non-existent claim", async () => {
    const result = await store.getClaim(passportId, "nonexistent");
    expect(result).toBeNull();
  });

  it("getClaim returns claim with correct type mapping", async () => {
    client._seed("claims", [baseClaim]);
    const result = await store.getClaim(passportId, "cl_1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("cl_1");
    expect(result!.passport_id).toBe(passportId);
    expect(result!.subject).toBe("user");
    expect(result!.predicate).toBe("knows");
    expect(result!.value).toBe("Python");
    expect(result!.category).toBe("skills");
    expect(result!.state).toBe("OBSERVED");
    expect(result!.sensitivity).toBe("public");
    expect(result!.sharing_policy).toEqual({ type: "grant_controlled" });
    expect(result!.deleted).toBe(false);
  });

  it("getClaim enforces passport scope — wrong passport returns null", async () => {
    client._seed("claims", [baseClaim]);
    const result = await store.getClaim(otherPassportId, "cl_1");
    expect(result).toBeNull();
  });

  it("getClaims filters by category", async () => {
    client._seed("claims", [
      baseClaim,
      { ...baseClaim, id: "cl_2", category: "preferences" },
    ]);
    const result = await store.getClaims(passportId, {
      categories: ["skills"],
    });
    expect(result.length).toBe(1);
    expect(result[0].category).toBe("skills");
  });

  it("getClaims excludes deleted by default", async () => {
    client._seed("claims", [
      baseClaim,
      { ...baseClaim, id: "cl_del", deleted: true },
    ]);
    const result = await store.getClaims(passportId, {});
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("cl_1");
  });

  it("getClaims includes deleted when requested", async () => {
    client._seed("claims", [
      baseClaim,
      { ...baseClaim, id: "cl_del", deleted: true },
    ]);
    const result = await store.getClaims(passportId, { include_deleted: true });
    expect(result.length).toBe(2);
  });

  it("getClaims filters by sensitivity ceiling", async () => {
    client._seed("claims", [
      baseClaim,
      { ...baseClaim, id: "cl_sens", sensitivity: "sensitive" },
    ]);
    const result = await store.getClaims(passportId, {
      sensitivity_ceiling: "personal",
    });
    expect(result.length).toBe(1);
    expect(result[0].sensitivity).toBe("public");
  });

  it("createClaim inserts with correct passport_id", async () => {
    const claim = {
      id: "cl_new",
      passport_id: passportId,
      subject: "user",
      predicate: "prefers",
      value: "dark mode",
      qualifiers: {},
      category: "preferences" as const,
      tags: [],
      state: "DECLARED" as const,
      declared_state: "DECLARED" as const,
      observed_state: null,
      volatility: "stable" as const,
      created_at: "2024-06-01T00:00:00Z",
      updated_at: "2024-06-01T00:00:00Z",
      last_confirmed_at: null,
      expires_at: null,
      sensitivity: "public" as const,
      sharing_policy: { type: "grant_controlled" as const },
      evidence_ids: [],
      purged_references: [],
      contradicted_by: [],
      current_version_id: "cv_new",
      deleted: false,
      deleted_at: null,
    };
    await store.createClaim(passportId, claim);

    expect(client.from).toHaveBeenCalledWith("claims");
  });

  it("findMatchingClaim returns null when no match", async () => {
    const result = await store.findMatchingClaim(
      passportId,
      "nonexistent",
      "nonexistent",
      {}
    );
    expect(result).toBeNull();
  });

  it("findMatchingClaim finds by subject+predicate within passport scope", async () => {
    client._seed("claims", [baseClaim]);
    const result = await store.findMatchingClaim(
      passportId,
      "user",
      "knows",
      {}
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe("cl_1");
  });

  it("createClaimVersion inserts version row", async () => {
    const version = {
      id: "cv_1",
      claim_id: "cl_1",
      version_number: 1,
      previous_version_id: null,
      value: "Python",
      qualifiers: {},
      state: "OBSERVED" as const,
      changed_by: "system",
      changed_at: "2024-01-01T00:00:00Z",
      change_reason: "initial observation",
      evidence_ids: ["ev_1"],
    };
    await store.createClaimVersion(passportId, version);
    expect(client.from).toHaveBeenCalledWith("claim_versions");
  });

  it("countActiveClaimsByCategory returns 0 for empty store", async () => {
    const result = await store.countActiveClaimsByCategory(passportId, "skills");
    expect(result).toBe(0);
  });
});
