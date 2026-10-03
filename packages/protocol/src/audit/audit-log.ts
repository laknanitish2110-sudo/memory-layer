import type {
  AccessEvent,
  Capability,
  ClaimCategory,
  Sensitivity,
} from "../memory/types.js";

export interface AuditStore {
  logAccess(passportId: string, event: AccessEvent): Promise<void>;
  getAccessEvents(
    passportId: string,
    bindingId: string,
    limit?: number
  ): Promise<AccessEvent[]>;
}

export interface AuditEntry {
  binding_id: string;
  grant_id: string;
  credential_id: string;
  capability: Capability;
  categories: ClaimCategory[];
  claims_served: string[];
  sensitivity_levels: Sensitivity[];
  policy_version: string;
  grant_version: number;
  binding_revision: number;
}

export function createAccessEvent(
  entry: AuditEntry,
  now: string
): AccessEvent {
  return {
    id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    binding_id: entry.binding_id,
    grant_id: entry.grant_id,
    credential_id: entry.credential_id,
    capability_used: entry.capability,
    categories_accessed: entry.categories,
    claims_served: entry.claims_served,
    claims_served_count: entry.claims_served.length,
    sensitivity_levels_touched: entry.sensitivity_levels,
    accessed_at: now,
    request_context: null,
    policy_version: entry.policy_version,
    grant_version: entry.grant_version,
    binding_revision: entry.binding_revision,
  };
}

export interface RedactedAccessEvent {
  id: string;
  binding_id: string;
  capability_used: Capability;
  resource_count: number;
  resource_reference: "PURGED";
  accessed_at: string;
  policy_version: string;
}

export function redactAccessEvent(event: AccessEvent): RedactedAccessEvent {
  return {
    id: event.id,
    binding_id: event.binding_id,
    capability_used: event.capability_used,
    resource_count: event.claims_served_count,
    resource_reference: "PURGED",
    accessed_at: event.accessed_at,
    policy_version: event.policy_version,
  };
}
