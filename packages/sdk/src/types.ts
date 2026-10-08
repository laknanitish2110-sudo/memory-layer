/**
 * @memory-layer/sdk — Public Type Contract
 *
 * These types define the developer-facing surface of Memory Layer.
 * The protocol has ~40 internal types; the SDK exposes ~12.
 *
 * Design rules:
 *   1. SDK is a thin HTTP client — kernel is authoritative
 *   2. No protocol internals leak into Layer 1
 *   3. Intent-based methods (observe, not createObservation)
 *   4. Errors are human-readable with machine-readable .code
 */

// ─── Configuration ───────────────────────────────────────────

export interface MemoryLayerConfig {
  /** Server-side API key. Never use in browser code. */
  apiKey?: string;

  /** Browser-side session token from the authorization flow. */
  sessionToken?: string;

  /** API base URL. Defaults to Memory Layer cloud. */
  baseUrl?: string;

  /** Request timeout in milliseconds. Default: 10_000. */
  timeout?: number;

  /** Custom fetch implementation (for testing or edge runtimes). */
  fetch?: typeof globalThis.fetch;

  /** Set to true to suppress the hard error when using an API key in a browser. */
  dangerouslyAllowApiKeyInBrowser?: boolean;
}

// ─── Layer 1: Simple API ─────────────────────────────────────

export type Category =
  | "skills"
  | "preferences"
  | "goals"
  | "projects"
  | "behavioral_patterns"
  | "emotional_patterns"
  | "personal_context";

export type Sensitivity = "public" | "personal" | "sensitive" | "restricted";

export type Confidence = "high" | "medium" | "low";

/** A single piece of context the AI application can use. */
export interface ContextItem {
  id: string;
  category: Category;
  sensitivity: Sensitivity;
  summary: string;
  confidence: Confidence;
}

/** Result from memory.context(). */
export interface ContextResponse {
  items: ContextItem[];
  generatedAt: string;
}

/** Options for filtering context retrieval. */
export interface ContextOptions {
  /** Only return items in these categories. */
  categories?: Category[];
  /** Purpose hint for audit logging. */
  purpose?: string;
}

/** What the developer submits when observing something about the user. */
export interface ObserveInput {
  /** What the user did/said/demonstrated. e.g. "learning" */
  predicate: string;
  /** The specific value. e.g. "Rust" */
  value: string;
  /** Memory category. Default: "skills". */
  category?: Category;
  /** Data sensitivity. Default: "public". */
  sensitivity?: Sensitivity;
  /** How this was observed. Default: "app_measured". */
  method?: "user_stated" | "app_measured" | "model_inferred";
  /** Raw context for evidence trail. */
  context?: string;
  /** Subject of the observation. Default: "user". */
  subject?: string;
  /** Additional qualifiers. */
  qualifiers?: Record<string, string>;
  /** Client-generated idempotency key. Auto-generated if omitted. */
  idempotencyKey?: string;
}

export type ObserveOutcome = "accepted" | "merged" | "quarantined";

/** Result from memory.observe(). */
export interface ObserveResponse {
  outcome: ObserveOutcome;
  observationId: string;
  claimId?: string;
  evidenceId?: string;
}

/** Options for searching/filtering recalled context. */
export interface RecallOptions {
  /** Free-text query to match against summaries. */
  query?: string;
  /** Only return items in these categories. */
  categories?: Category[];
  /** Maximum number of items to return. */
  limit?: number;
}

// ─── Layer 2: Access Management ──────────────────────────────

export type PermissionCapability =
  | "read_context"
  | "read_claims"
  | "write_claims";

export interface PermissionStatus {
  connected: boolean;
  capabilities: PermissionCapability[];
  readCategories: Category[];
  writeCategories: Category[];
  sensitivityCeiling: Sensitivity;
}

export interface PermissionRequest {
  capabilities: PermissionCapability[];
  purposes: string[];
  readCategories?: Category[];
  writeCategories?: Category[];
}

export interface PermissionGrant {
  grantId: string;
  capabilities: PermissionCapability[];
  readCategories: Category[];
  writeCategories: Category[];
  sensitivityCeiling: Sensitivity;
  consentedAt: string;
}

// ─── Layer 3: Advanced Protocol Access ───────────────────────

export interface Passport {
  id: string;
  createdAt: string;
}

export interface Binding {
  id: string;
  passportId: string;
  status: "active" | "suspended" | "revoked";
  createdAt: string;
}

export interface Grant {
  id: string;
  bindingId: string;
  capabilities: PermissionCapability[];
  active: boolean;
  consentedAt: string;
}

export interface ClaimSummary {
  id: string;
  category: Category;
  subject: string;
  predicate: string;
  value: string;
  state: string;
  sensitivity: Sensitivity;
  confidence: Confidence;
  createdAt: string;
  updatedAt: string;
}

// ─── Errors ──────────────────────────────────────────────────

export type MemoryErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "PERMISSION_DENIED"
  | "CATEGORY_DENIED"
  | "SENSITIVITY_DENIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "VALIDATION"
  | "SERVER_ERROR"
  | "NETWORK_ERROR";

export interface MemoryErrorDetails {
  /** Machine-readable error code. */
  code: MemoryErrorCode;
  /** Human-readable explanation of what went wrong. */
  message: string;
  /** What the developer can do about it. */
  suggestion?: string;
  /** Allowed values when the error is about a denied category/capability. */
  allowed?: string[];
  /** The original API error code for debugging. */
  apiCode?: string;
  /** Server request ID for support. */
  requestId?: string;
}

// ─── Client Interface ────────────────────────────────────────

export interface MemoryClient {
  // --- Layer 1: Simple API (80% of developers) ---

  /** Retrieve the user's context for this application. */
  context(options?: ContextOptions): Promise<ContextResponse>;

  /** Record an observation about the user. */
  observe(input: ObserveInput): Promise<ObserveResponse>;

  /** Search and filter recalled context. */
  recall(options?: RecallOptions): Promise<ContextResponse>;

  // --- Layer 2: Access Management ---

  permissions: {
    /** Check what this application is currently authorized to do. */
    status(): Promise<PermissionStatus>;

    /** Request broader access (triggers user consent flow). */
    request(request: PermissionRequest): Promise<PermissionGrant>;

    /** Revoke this application's access. */
    revoke(): Promise<void>;
  };

  // --- Layer 3: Advanced Protocol (escape hatch) ---

  advanced: {
    passports: {
      get(id: string): Promise<Passport>;
      list(): Promise<Passport[]>;
    };
    bindings: {
      get(id: string): Promise<Binding>;
      list(): Promise<Binding[]>;
    };
    grants: {
      get(id: string): Promise<Grant>;
      consent(grantId: string, approved: boolean): Promise<void>;
    };
    claims: {
      get(id: string): Promise<ClaimSummary>;
      list(options?: { category?: Category }): Promise<ClaimSummary[]>;
      confirm(id: string): Promise<void>;
      correct(id: string, newValue: string): Promise<void>;
      dispute(id: string): Promise<void>;
      delete(id: string): Promise<void>;
    };
  };
}
