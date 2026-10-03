import type { PersistenceClient } from "./client.js";
import type {
  Binding,
  BindingGrant,
  BindingStatus,
  ConsentMethod,
  DataPolicy,
  SuspensionType,
} from "@memory-layer/protocol/src/authorization/types.js";
import type { Capability } from "@memory-layer/protocol/src/memory/types.js";

function rowToBinding(row: Record<string, unknown>): Binding {
  return {
    id: row.id as string,
    passport_id: row.passport_id as string,
    app_principal_id: row.app_principal_id as string,
    status: row.status as BindingStatus,
    current_grant_id: row.current_grant_id as string,
    revision: row.revision as number,
    created_at: row.created_at as string,
    suspended_at: (row.suspended_at as string) ?? null,
    revoked_at: (row.revoked_at as string) ?? null,
    suspension_type: (row.suspension_type as SuspensionType) ?? null,
  };
}

function rowToGrant(row: Record<string, unknown>): BindingGrant {
  return {
    id: row.id as string,
    binding_id: row.binding_id as string,
    version: row.version as number,
    capabilities: row.capabilities as Capability[],
    data_policy: row.data_policy as DataPolicy,
    authorized_purposes: (row.authorized_purposes as string[]) ?? [],
    consent_record_id: row.consent_record_id as string,
    consented_at: row.consented_at as string,
    consent_method: row.consent_method as ConsentMethod,
    supersedes_grant_id: (row.supersedes_grant_id as string) ?? null,
    active: row.active as boolean,
  };
}

export interface BindingStore {
  getBinding(bindingId: string): Promise<Binding | null>;
  getBindingForPassportAndApp(
    passportId: string,
    appPrincipalId: string
  ): Promise<Binding | null>;
  createBinding(binding: Binding): Promise<void>;
  updateBinding(binding: Binding): Promise<void>;
  incrementRevision(bindingId: string): Promise<number>;
  checkRevision(bindingId: string, requestRevision: number): Promise<boolean>;
}

export interface GrantStore {
  getGrant(grantId: string): Promise<BindingGrant | null>;
  getGrantsForBinding(bindingId: string): Promise<BindingGrant[]>;
  createGrant(grant: BindingGrant): Promise<void>;
  deactivateGrant(grantId: string): Promise<void>;
}

export class SupabaseBindingStore implements BindingStore {
  constructor(private client: PersistenceClient) {}

  async getBinding(bindingId: string): Promise<Binding | null> {
    const { data, error } = await this.client
      .from("bindings")
      .select("*")
      .eq("id", bindingId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return rowToBinding(data);
  }

  async getBindingForPassportAndApp(
    passportId: string,
    appPrincipalId: string
  ): Promise<Binding | null> {
    const { data, error } = await this.client
      .from("bindings")
      .select("*")
      .eq("passport_id", passportId)
      .eq("app_principal_id", appPrincipalId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return rowToBinding(data);
  }

  async createBinding(binding: Binding): Promise<void> {
    const { error } = await this.client.from("bindings").insert({
      id: binding.id,
      passport_id: binding.passport_id,
      app_principal_id: binding.app_principal_id,
      status: binding.status,
      current_grant_id: binding.current_grant_id,
      revision: binding.revision,
      created_at: binding.created_at,
      suspended_at: binding.suspended_at,
      revoked_at: binding.revoked_at,
      suspension_type: binding.suspension_type,
    });
    if (error) throw error;
  }

  async updateBinding(binding: Binding): Promise<void> {
    const { error } = await this.client
      .from("bindings")
      .update({
        status: binding.status,
        current_grant_id: binding.current_grant_id,
        revision: binding.revision,
        suspended_at: binding.suspended_at,
        revoked_at: binding.revoked_at,
        suspension_type: binding.suspension_type,
      })
      .eq("id", binding.id);
    if (error) throw error;
  }

  async incrementRevision(bindingId: string): Promise<number> {
    const { data, error } = await this.client.rpc(
      "increment_binding_revision",
      { p_binding_id: bindingId }
    );
    if (error) throw error;
    return data as number;
  }

  async checkRevision(
    bindingId: string,
    requestRevision: number
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc("check_binding_revision", {
      p_binding_id: bindingId,
      p_request_revision: requestRevision,
    });
    if (error) throw error;
    return data as boolean;
  }
}

export class SupabaseGrantStore implements GrantStore {
  constructor(private client: PersistenceClient) {}

  async getGrant(grantId: string): Promise<BindingGrant | null> {
    const { data, error } = await this.client
      .from("binding_grants")
      .select("*")
      .eq("id", grantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return rowToGrant(data);
  }

  async getGrantsForBinding(bindingId: string): Promise<BindingGrant[]> {
    const { data, error } = await this.client
      .from("binding_grants")
      .select("*")
      .eq("binding_id", bindingId)
      .order("version", { ascending: true });

    if (error) throw error;
    return (data ?? []).map(rowToGrant);
  }

  async createGrant(grant: BindingGrant): Promise<void> {
    const { error } = await this.client.from("binding_grants").insert({
      id: grant.id,
      binding_id: grant.binding_id,
      version: grant.version,
      capabilities: grant.capabilities,
      data_policy: grant.data_policy,
      authorized_purposes: grant.authorized_purposes,
      consent_record_id: grant.consent_record_id,
      consented_at: grant.consented_at,
      consent_method: grant.consent_method,
      supersedes_grant_id: grant.supersedes_grant_id,
      active: grant.active,
    });
    if (error) throw error;
  }

  async deactivateGrant(grantId: string): Promise<void> {
    const { error } = await this.client
      .from("binding_grants")
      .update({ active: false })
      .eq("id", grantId);
    if (error) throw error;
  }
}
