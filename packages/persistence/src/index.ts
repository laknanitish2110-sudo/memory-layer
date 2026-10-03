export { createPersistenceClient, withPassportScope } from "./client.js";
export type { PersistenceClient } from "./client.js";

export { SupabaseClaimStore } from "./claim-store.js";
export { SupabaseEvidenceStore } from "./evidence-store.js";
export { SupabaseObservationStore } from "./observation-store.js";
export { SupabaseUserMemoryEventStore } from "./user-event-store.js";
export { SupabaseBindingStore, SupabaseGrantStore } from "./binding-store.js";
export type { BindingStore, GrantStore } from "./binding-store.js";
export { SupabaseTokenFamilyStore } from "./token-store.js";
export { SupabaseAccessEventStore } from "./access-event-store.js";
export type { AccessEventStore } from "./access-event-store.js";
