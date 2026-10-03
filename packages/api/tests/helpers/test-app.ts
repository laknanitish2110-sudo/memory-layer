import { createApp, type CreateAppOptions } from "../../src/app.js";
import type { AppContext, BindingStore, GrantStore, Stores } from "../../src/context.js";
import type { TokenValidator } from "../../src/middleware/auth.js";
import type { RefreshTokenDecoder } from "../../src/routes/tokens.js";
import type { Binding, BindingGrant } from "@memory-layer/protocol/src/authorization/types.js";
import type { TokenFamily } from "@memory-layer/protocol/src/credentials/types.js";
import type { Claim, ClaimVersion, Evidence, Observation, UserMemoryEvent } from "@memory-layer/protocol/src/memory/types.js";
import type { ClaimStore, EvidenceStore, ObservationStore, UserMemoryEventStore } from "@memory-layer/protocol/src/memory/repository.js";
import type { TokenFamilyStore } from "@memory-layer/protocol/src/credentials/token-family.js";

let idCounter = 0;

export interface TestAppContext {
  app: ReturnType<typeof createApp>;
  stores: Stores;
  addBinding(binding: Binding): void;
  addGrant(grant: BindingGrant): void;
  addClaim(claim: Claim): void;
  addObservation(observation: Observation): void;
  addEvidence(evidence: Evidence): void;
  addTokenFamily(family: TokenFamily): void;
}

export function createTestApp(): TestAppContext {
  idCounter = 0;

  // In-memory stores
  const bindings = new Map<string, Binding>();
  const grants = new Map<string, BindingGrant>();
  const claims = new Map<string, Claim>();
  const evidence = new Map<string, Evidence>();
  const observations = new Map<string, Observation>();
  const events: UserMemoryEvent[] = [];
  const tokenFamilies = new Map<string, TokenFamily>();
  const idempotencyKeys = new Map<string, Observation>();

  const bindingStore: BindingStore = {
    getBinding: async (id) => bindings.get(id) ?? null,
    getBindingByPassportAndApp: async (pid, appId) => {
      for (const b of bindings.values()) {
        if (b.passport_id === pid && b.app_principal_id === appId) return b;
      }
      return null;
    },
    createBinding: async (b) => { bindings.set(b.id, b); },
    updateBinding: async (b) => { bindings.set(b.id, b); },
  };

  const grantStore: GrantStore = {
    getGrant: async (id) => grants.get(id) ?? null,
    getActiveGrantForBinding: async (bid) => {
      for (const g of grants.values()) {
        if (g.binding_id === bid && g.active) return g;
      }
      return null;
    },
    createGrant: async (g) => { grants.set(g.id, g); },
    updateGrant: async (g) => { grants.set(g.id, g); },
  };

  const claimStore: ClaimStore = {
    getClaim: async (pid, cid) => {
      const c = claims.get(cid);
      if (!c || c.passport_id !== pid) return null;
      return c;
    },
    getClaims: async (pid, query) => {
      return Array.from(claims.values()).filter((c) => {
        if (c.passport_id !== pid) return false;
        if (query.categories && !query.categories.includes(c.category)) return false;
        if (query.sensitivity_ceiling) {
          const order: Record<string, number> = { public: 0, personal: 1, sensitive: 2, restricted: 3 };
          if (order[c.sensitivity] > order[query.sensitivity_ceiling]) return false;
        }
        if (!query.include_deleted && c.deleted) return false;
        return true;
      });
    },
    createClaim: async (pid, c) => { claims.set(c.id, c); },
    updateClaim: async (pid, c) => { claims.set(c.id, c); },
    getClaimVersions: async () => [],
    createClaimVersion: async () => {},
    findMatchingClaim: async (pid, subject, predicate, qualifiers) => {
      for (const c of claims.values()) {
        if (c.passport_id === pid && c.subject === subject && c.predicate === predicate && !c.deleted) {
          return c;
        }
      }
      return null;
    },
    countActiveClaimsByCategory: async (pid, category) => {
      let count = 0;
      for (const c of claims.values()) {
        if (c.passport_id === pid && c.category === category && !c.deleted) count++;
      }
      return count;
    },
    countNewClaimsToday: async () => 0,
    getLastObservationTime: async () => null,
  };

  const evidenceStore: EvidenceStore = {
    getEvidence: async (pid, eid) => evidence.get(eid) ?? null,
    getEvidenceForClaim: async (pid, cid, status) => {
      return Array.from(evidence.values()).filter(
        (e) => e.claim_id === cid && (!status || e.status === status)
      );
    },
    createEvidence: async (pid, e) => { evidence.set(e.id, e); },
    updateEvidence: async (pid, e) => { evidence.set(e.id, e); },
  };

  const observationStore: ObservationStore = {
    getObservation: async (pid, oid) => observations.get(oid) ?? null,
    createObservation: async (pid, o) => {
      observations.set(o.id, o);
      idempotencyKeys.set(`${o.binding_id}:${o.idempotency_key}`, o);
    },
    updateObservation: async (pid, o) => { observations.set(o.id, o); },
    findByIdempotencyKey: async (bid, key) => idempotencyKeys.get(`${bid}:${key}`) ?? null,
  };

  const eventStore: UserMemoryEventStore = {
    createEvent: async (pid, e) => { events.push(e); },
    getEventsForClaim: async (pid, cid) => events.filter((e) => e.claim_id === cid),
  };

  const tokenFamilyStore: TokenFamilyStore = {
    getFamily: async (fid) => tokenFamilies.get(fid) ?? null,
    compareAndSwapGeneration: async (fid, expected, newGen) => {
      const f = tokenFamilies.get(fid);
      if (!f || f.current_generation !== expected) return false;
      tokenFamilies.set(fid, { ...f, current_generation: newGen });
      return true;
    },
    revokeFamily: async (fid, at) => {
      const f = tokenFamilies.get(fid);
      if (f) tokenFamilies.set(fid, { ...f, revoked_at: at });
    },
  };

  const stores: Stores = {
    claims: claimStore,
    evidence: evidenceStore,
    observations: observationStore,
    events: eventStore,
    bindings: bindingStore,
    grants: grantStore,
    tokenFamilies: tokenFamilyStore,
  };

  const tokenValidator: TokenValidator = {
    validateAppToken: (token) => {
      // Format: app|<binding_id>|<family_id>|<generation>|<expires_at>
      if (!token.startsWith("app|")) return null;
      const parts = token.split("|");
      if (parts.length < 4) return null;
      return {
        binding_id: parts[1],
        family_id: parts[2],
        passport_id: "", // will be looked up from binding
        generation: parseInt(parts[3], 10),
        issued_at: "2026-10-01T00:00:00Z",
        expires_at: parts[4] ?? "2026-10-01T01:00:00Z",
      };
    },
    validateUserToken: (token) => {
      // Format: user|<passport_id>|<account_id>
      if (!token.startsWith("user|")) return null;
      const parts = token.split("|");
      if (parts.length < 3) return null;
      return {
        passport_id: parts[1],
        account_id: parts[2],
      };
    },
  };

  const refreshTokenDecoder: RefreshTokenDecoder = {
    decode: (token) => {
      // Format: refresh|<family_id>|<generation>
      if (!token.startsWith("refresh|")) return null;
      const parts = token.split("|");
      if (parts.length < 3) return null;
      return { family_id: parts[1], generation: parseInt(parts[2], 10) };
    },
  };

  const appContext: AppContext = {
    stores,
    tokenIssuer: {
      issueAccessToken: (familyId, bindingId) => ({
        token_hash: `access_${familyId}_${bindingId}_${Date.now()}`,
        family_id: familyId,
        binding_id: bindingId,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      }),
      issueRefreshToken: (familyId, generation) => ({
        token_hash: `refresh_${familyId}_gen_${generation}`,
        family_id: familyId,
        generation,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      }),
    },
    generateId: (prefix) => `${prefix}_${String(++idCounter).padStart(6, "0")}`,
    now: () => new Date().toISOString(),
  };

  const app = createApp({ appContext, tokenValidator, refreshTokenDecoder });

  return {
    app,
    stores,
    addBinding: (b) => bindings.set(b.id, b),
    addGrant: (g) => grants.set(g.id, g),
    addClaim: (c) => claims.set(c.id, c),
    addObservation: (o) => {
      observations.set(o.id, o);
      idempotencyKeys.set(`${o.binding_id}:${o.idempotency_key}`, o);
    },
    addEvidence: (e) => evidence.set(e.id, e),
    addTokenFamily: (f) => tokenFamilies.set(f.family_id, f),
  };
}

export function appToken(bindingId = "bnd_test_a", familyId = "fam_test_a", generation = 0): string {
  return `app|${bindingId}|${familyId}|${generation}|2099-12-31T23:59:59Z`;
}

export function userToken(passportId = "psp_default", accountId = "acct_default"): string {
  return `user|${passportId}|${accountId}`;
}

export function refreshToken(familyId = "fam_test_a", generation = 0): string {
  return `refresh|${familyId}|${generation}`;
}
