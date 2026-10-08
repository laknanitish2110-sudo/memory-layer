import type { ClaimStore, EvidenceStore, ObservationStore, UserMemoryEventStore } from "@memory-layer/protocol/src/memory/repository.js";
import type { TokenFamilyStore, TokenIssuer } from "@memory-layer/protocol/src/credentials/token-family.js";
import type { Binding, BindingGrant } from "@memory-layer/protocol/src/authorization/types.js";

export interface AppAuthContext {
  type: "app";
  passportId: string;
  bindingId: string;
  grantId: string;
  bindingRevision: number;
  binding: Binding;
  grant: BindingGrant;
}

export interface UserAuthContext {
  type: "user";
  passportId: string;
  accountId: string;
}

export type AuthContext = AppAuthContext | UserAuthContext;

export interface BindingStore {
  getBinding(bindingId: string): Promise<Binding | null>;
  getBindingByPassportAndApp(passportId: string, appPrincipalId: string): Promise<Binding | null>;
  createBinding(binding: Binding): Promise<void>;
  updateBinding(binding: Binding): Promise<void>;
}

export interface GrantStore {
  getGrant(grantId: string): Promise<BindingGrant | null>;
  getActiveGrantForBinding(bindingId: string): Promise<BindingGrant | null>;
  createGrant(grant: BindingGrant): Promise<void>;
  updateGrant(grant: BindingGrant): Promise<void>;
}

export interface Stores {
  claims: ClaimStore;
  evidence: EvidenceStore;
  observations: ObservationStore;
  events: UserMemoryEventStore;
  bindings: BindingStore;
  grants: GrantStore;
  tokenFamilies: TokenFamilyStore;
}

export interface AppContext {
  stores: Stores;
  tokenIssuer: TokenIssuer;
  generateId: (prefix: string) => string;
  now: () => string;
  /** Set the passport scope for RLS enforcement (defense-in-depth). */
  setPassportScope?: (passportId: string) => Promise<void>;
}
