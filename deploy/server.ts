import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "../packages/api/src/app.js";
import type { AppContext, Stores, BindingStore, GrantStore } from "../packages/api/src/context.js";
import type { TokenValidator } from "../packages/api/src/middleware/auth.js";
import type { RefreshTokenDecoder } from "../packages/api/src/routes/tokens.js";
import { SupabaseClaimStore } from "../packages/persistence/src/claim-store.js";
import { SupabaseEvidenceStore } from "../packages/persistence/src/evidence-store.js";
import { SupabaseObservationStore } from "../packages/persistence/src/observation-store.js";
import { SupabaseUserMemoryEventStore } from "../packages/persistence/src/user-event-store.js";
import { SupabaseBindingStore, SupabaseGrantStore } from "../packages/persistence/src/binding-store.js";
import { SupabaseTokenFamilyStore } from "../packages/persistence/src/token-store.js";
import { randomUUID, webcrypto } from "node:crypto";

const subtle = webcrypto.subtle;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PORT = parseInt(process.env.PORT ?? "3000", 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const TOKEN_SECRET = process.env.TOKEN_SIGNING_SECRET || SUPABASE_SERVICE_KEY.slice(0, 32);

// ── Token signing utilities (HMAC-SHA256) ──

async function signToken(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await subtle.sign("HMAC", key, encoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
  return `${payload}|${sigHex}`;
}

async function verifyToken(token: string, secret: string): Promise<string | null> {
  const lastPipe = token.lastIndexOf("|");
  if (lastPipe === -1) return null;
  const payload = token.substring(0, lastPipe);
  const sig = token.substring(lastPipe + 1);

  const encoder = new TextEncoder();
  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = new Uint8Array(sig.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const valid = await subtle.verify("HMAC", key, sigBytes, encoder.encode(payload));
  return valid ? payload : null;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const sbBindingStore = new SupabaseBindingStore(supabase);
const sbGrantStore = new SupabaseGrantStore(supabase);

const apiBindingStore: BindingStore = {
  getBinding: (id) => sbBindingStore.getBinding(id),
  getBindingByPassportAndApp: (pid, appId) => sbBindingStore.getBindingForPassportAndApp(pid, appId),
  createBinding: (b) => sbBindingStore.createBinding(b),
  updateBinding: (b) => sbBindingStore.updateBinding(b),
};

const apiGrantStore: GrantStore = {
  getGrant: (id) => sbGrantStore.getGrant(id),
  getActiveGrantForBinding: async (bindingId) => {
    const grants = await sbGrantStore.getGrantsForBinding(bindingId);
    return grants.find((g) => g.active) ?? null;
  },
  createGrant: (g) => sbGrantStore.createGrant(g),
  updateGrant: async (g) => {
    if (!g.active) {
      await sbGrantStore.deactivateGrant(g.id);
    }
  },
};

const stores: Stores = {
  claims: new SupabaseClaimStore(supabase),
  evidence: new SupabaseEvidenceStore(supabase),
  observations: new SupabaseObservationStore(supabase),
  events: new SupabaseUserMemoryEventStore(supabase),
  bindings: apiBindingStore,
  grants: apiGrantStore,
  tokenFamilies: new SupabaseTokenFamilyStore(supabase),
};

// Token validation: same format as test-app.ts
// app|<binding_id>|<family_id>|<generation>|<expires_at>
// user|<passport_id>|<account_id>
const tokenValidator: TokenValidator = {
  validateAppToken: async (token) => {
    const verified = await verifyToken(token, TOKEN_SECRET);
    if (!verified) return null;
    const parts = verified.split("|");
    if (parts.length !== 5 || parts[0] !== "app") return null;
    const expiresAt = new Date(parts[4]);
    if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) return null;
    return {
      binding_id: parts[1],
      family_id: parts[2],
      passport_id: "",
      generation: parseInt(parts[3], 10),
      issued_at: new Date().toISOString(),
      expires_at: parts[4],
    };
  },
  validateUserToken: (token) => {
    if (!token.startsWith("user|")) return null;
    const parts = token.split("|");
    if (parts.length < 3) return null;
    return { passport_id: parts[1], account_id: parts[2] };
  },
};

const refreshTokenDecoder: RefreshTokenDecoder = {
  decode: async (token) => {
    const verified = await verifyToken(token, TOKEN_SECRET);
    if (!verified) return null;
    const parts = verified.split("|");
    if (parts.length !== 3 || parts[0] !== "refresh") return null;
    return { family_id: parts[1], generation: parseInt(parts[2], 10) };
  },
};

const appContext: AppContext = {
  stores,
  tokenIssuer: {
    issueAccessToken: async (familyId, bindingId) => {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      const payload = `app|${bindingId}|${familyId}|0|${expiresAt}`;
      const token = await signToken(payload, TOKEN_SECRET);
      return {
        token_hash: token,
        family_id: familyId,
        binding_id: bindingId,
        issued_at: new Date().toISOString(),
        expires_at: expiresAt,
      };
    },
    issueRefreshToken: async (familyId, generation) => {
      const payload = `refresh|${familyId}|${generation}`;
      const token = await signToken(payload, TOKEN_SECRET);
      return {
        token_hash: token,
        family_id: familyId,
        generation,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
    },
  },
  generateId: (prefix) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
  now: () => new Date().toISOString(),
};

const app = createApp({ appContext, tokenValidator, refreshTokenDecoder });

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Memory Layer API listening on port ${info.port}`);
});
