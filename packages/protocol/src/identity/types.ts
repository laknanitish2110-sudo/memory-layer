import type { ISO8601, ClaimCategory, Sensitivity } from "../memory/types.js";

export interface Account {
  id: string;
  auth_provider: string;
  auth_id: string;
  email: string;
  created_at: ISO8601;
  passport_ids: string[];
}

export interface Passport {
  id: string;
  account_id: string;
  name: string;
  created_at: ISO8601;
  is_ephemeral: boolean;
  device_id: string | null;
  binding_ids: string[];
  bridge_ids: string[];
}

export interface EphemeralPassport extends Passport {
  is_ephemeral: true;
  device_id: string;
  expires_at: ISO8601;
  promotable: boolean;
}

export interface Bridge {
  id: string;
  source_passport_id: string;
  target_passport_id: string;
  direction: "one_way" | "bidirectional";
  created_at: ISO8601;
  created_by: string;
  scope: BridgeScope;
  status: "active" | "paused" | "revoked";
}

export interface BridgeScope {
  categories: ClaimCategory[];
  sensitivity_ceiling: Sensitivity;
  claim_filter: string | null;
}

export interface DeveloperAccount {
  id: string;
  email: string;
  domain: string | null;
  verification_status: "unverified" | "verified";
  registered_at: ISO8601;
}

export interface AppPrincipal {
  id: string;
  developer_id: string;
  name: string;
  domain: string | null;
  description: string;
  declared_purposes: string[];
  status: "active" | "suspended" | "banned";
  registered_at: ISO8601;
  ownership_history: OwnershipRecord[];
}

export interface OwnershipRecord {
  developer_id: string;
  from: ISO8601;
  to: ISO8601 | null;
}

export interface OwnershipTransfer {
  app_principal_id: string;
  previous_developer_id: string;
  new_developer_id: string;
  transferred_at: ISO8601;
  invalidated: {
    user_bindings: "suspended_all";
    developer_api_keys: "revoked_all";
    signing_credentials: "revoked_all";
    deployment_tokens: "revoked_all";
    webhook_endpoints: "deregistered_all";
  };
}
