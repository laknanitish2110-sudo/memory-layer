import { describe, it, expect, beforeEach } from "vitest";
import {
  SupabaseBindingStore,
  SupabaseGrantStore,
} from "../../src/binding-store.js";
import { mockSupabaseClient, type MockClient } from "../helpers.js";

describe("SupabaseBindingStore — contract conformance", () => {
  let client: MockClient;
  let store: SupabaseBindingStore;

  const baseBinding = {
    id: "binding_1",
    passport_id: "passport_1",
    app_principal_id: "app_1",
    status: "active",
    current_grant_id: "grant_1",
    revision: 1,
    created_at: "2024-01-01T00:00:00Z",
    suspended_at: null,
    revoked_at: null,
    suspension_type: null,
  };

  beforeEach(() => {
    client = mockSupabaseClient();
    store = new SupabaseBindingStore(client as never);
  });

  it("getBinding returns null for unknown binding", async () => {
    const result = await store.getBinding("nonexistent");
    expect(result).toBeNull();
  });

  it("getBinding maps row to Binding type", async () => {
    client._seed("bindings", [baseBinding]);
    const result = await store.getBinding("binding_1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("binding_1");
    expect(result!.passport_id).toBe("passport_1");
    expect(result!.status).toBe("active");
    expect(result!.revision).toBe(1);
    expect(result!.suspended_at).toBeNull();
    expect(result!.suspension_type).toBeNull();
  });

  it("getBindingForPassportAndApp scopes by both fields", async () => {
    client._seed("bindings", [baseBinding]);
    const result = await store.getBindingForPassportAndApp(
      "passport_1",
      "app_1"
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe("binding_1");
  });

  it("getBindingForPassportAndApp returns null for wrong passport", async () => {
    client._seed("bindings", [baseBinding]);
    const result = await store.getBindingForPassportAndApp(
      "passport_2",
      "app_1"
    );
    expect(result).toBeNull();
  });

  it("incrementRevision calls the DB function", async () => {
    client.rpc.mockResolvedValueOnce({ data: 2, error: null });
    const result = await store.incrementRevision("binding_1");
    expect(result).toBe(2);
    expect(client.rpc).toHaveBeenCalledWith("increment_binding_revision", {
      p_binding_id: "binding_1",
    });
  });

  it("checkRevision calls the DB function", async () => {
    client.rpc.mockResolvedValueOnce({ data: true, error: null });
    const result = await store.checkRevision("binding_1", 1);
    expect(result).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("check_binding_revision", {
      p_binding_id: "binding_1",
      p_request_revision: 1,
    });
  });

  it("checkRevision returns false for stale revision", async () => {
    client.rpc.mockResolvedValueOnce({ data: false, error: null });
    const result = await store.checkRevision("binding_1", 0);
    expect(result).toBe(false);
  });
});

describe("SupabaseGrantStore — contract conformance", () => {
  let client: MockClient;
  let store: SupabaseGrantStore;

  const baseGrant = {
    id: "grant_1",
    binding_id: "binding_1",
    version: 1,
    capabilities: ["read_context", "read_claims"],
    data_policy: {
      read: {
        categories: ["skills"],
        sensitivity_ceiling: "personal",
      },
      write: {
        categories: ["skills"],
        sensitivity_ceiling: "personal",
        rate_limit: {
          max_observations_per_hour: 100,
          max_observations_per_day: 1000,
          max_per_request: 10,
        },
        semantic_limits: {
          max_new_claims_per_category_per_day: 50,
          min_interval_same_tuple_hours: 1,
          max_active_claims_per_category: 500,
        },
        evidence_required: true,
      },
    },
    authorized_purposes: ["coding_assistance"],
    consent_record_id: "consent_1",
    consented_at: "2024-01-01T00:00:00Z",
    consent_method: "initial_auth",
    supersedes_grant_id: null,
    active: true,
  };

  beforeEach(() => {
    client = mockSupabaseClient();
    store = new SupabaseGrantStore(client as never);
  });

  it("getGrant returns null for unknown grant", async () => {
    const result = await store.getGrant("nonexistent");
    expect(result).toBeNull();
  });

  it("getGrant maps row to BindingGrant type", async () => {
    client._seed("binding_grants", [baseGrant]);
    const result = await store.getGrant("grant_1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("grant_1");
    expect(result!.capabilities).toEqual(["read_context", "read_claims"]);
    expect(result!.data_policy.read.categories).toEqual(["skills"]);
    expect(result!.active).toBe(true);
  });

  it("getGrantsForBinding returns grants ordered by version", async () => {
    client._seed("binding_grants", [
      baseGrant,
      { ...baseGrant, id: "grant_2", version: 2, active: true },
    ]);
    const result = await store.getGrantsForBinding("binding_1");
    expect(result.length).toBe(2);
  });

  it("createGrant inserts correctly", async () => {
    await store.createGrant({
      ...baseGrant,
      id: "grant_new",
      version: 2,
      capabilities: ["read_context", "read_claims", "write_claims"],
      authorized_purposes: ["coding_assistance"],
      consent_record_id: "consent_2",
      consent_method: "upgrade_prompt",
      supersedes_grant_id: "grant_1",
      active: true,
      data_policy: baseGrant.data_policy as never,
      consented_at: "2024-06-01T00:00:00Z",
      binding_id: "binding_1",
    });
    expect(client.from).toHaveBeenCalledWith("binding_grants");
  });

  it("deactivateGrant calls update with active=false", async () => {
    client._seed("binding_grants", [baseGrant]);
    await store.deactivateGrant("grant_1");
    expect(client.from).toHaveBeenCalledWith("binding_grants");
  });
});
