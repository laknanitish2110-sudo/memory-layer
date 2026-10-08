import type {
  MemoryLayerConfig,
  MemoryClient,
  ContextOptions,
  ContextResponse,
  ObserveInput,
  ObserveResponse,
  RecallOptions,
  PermissionStatus,
  PermissionRequest,
  PermissionGrant,
  Passport,
  Binding,
  Grant,
  ClaimSummary,
  Category,
} from "./types.js";
import { MemoryValidationError } from "./errors.js";
import { request, type HttpConfig } from "./http.js";

let idCounter = 0;
function generateIdempotencyKey(): string {
  return `sdk_${Date.now()}_${++idCounter}`;
}

/**
 * Memory Layer client.
 *
 * Server-side (Node.js, edge runtimes):
 *   const memory = new MemoryLayer({ apiKey: process.env.MEMORY_LAYER_KEY });
 *
 * Browser-side (after user authorization):
 *   const memory = new MemoryLayer({ sessionToken: token });
 *
 * Never put an API key in client-side code.
 */
export class MemoryLayer implements MemoryClient {
  private readonly http: HttpConfig;

  constructor(config: MemoryLayerConfig) {
    if (!config.apiKey && !config.sessionToken) {
      throw new MemoryValidationError({
        message: "Either apiKey or sessionToken is required.",
        suggestion: "Server-side: pass apiKey. Browser-side: pass sessionToken from the auth flow.",
      });
    }
    if (config.apiKey && config.sessionToken) {
      throw new MemoryValidationError({
        message: "Pass either apiKey or sessionToken, not both.",
        suggestion: "Server-side: use apiKey. Browser-side: use sessionToken.",
      });
    }
    if (config.apiKey && typeof globalThis.window !== "undefined") {
      console.warn(
        "[MemoryLayer] WARNING: Using an API key in a browser environment exposes it to users. " +
        "Use sessionToken for browser-side integrations."
      );
    }

    const baseUrl = config.baseUrl ?? "https://fqizvwkurlwwzchftqnx.supabase.co/functions/v1/memory-layer-api";
    const token = config.apiKey ?? config.sessionToken!;

    this.http = {
      baseUrl,
      timeout: config.timeout ?? 10_000,
      fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
      getAuthHeader: () => `Bearer ${token}`,
    };
  }

  // ─── Layer 1: Simple API ─────────────────────────────────

  async context(options?: ContextOptions): Promise<ContextResponse> {
    const query: Record<string, string> = {};
    if (options?.categories?.length) {
      query.categories = options.categories.join(",");
    }
    if (options?.purpose) {
      query.purpose = options.purpose;
    }

    const res = await request<{
      items: Array<{
        claim_id: string;
        category: Category;
        sensitivity: string;
        summary: string;
        confidence_band: string;
      }>;
      generated_at: string;
    }>(this.http, "GET", "/v1/context", undefined, query);

    return {
      items: res.data.items.map((item) => ({
        id: item.claim_id,
        category: item.category,
        sensitivity: item.sensitivity as ContextResponse["items"][0]["sensitivity"],
        summary: item.summary,
        confidence: item.confidence_band as ContextResponse["items"][0]["confidence"],
      })),
      generatedAt: res.data.generated_at,
    };
  }

  async observe(input: ObserveInput): Promise<ObserveResponse> {
    if (!input.predicate || !input.value) {
      throw new MemoryValidationError({
        message: "predicate and value are required.",
        suggestion: 'memory.observe({ predicate: "learning", value: "Rust" })',
      });
    }

    const res = await request<{
      observation_id: string;
      outcome: {
        status: string;
        claim_id?: string;
        evidence_id?: string;
        existing_claim_id?: string;
      };
    }>(this.http, "POST", "/v1/observations", {
      idempotency_key: input.idempotencyKey ?? generateIdempotencyKey(),
      subject: input.subject ?? "user",
      predicate: input.predicate,
      value: input.value,
      qualifiers: input.qualifiers ?? {},
      declared_category: input.category ?? "skills",
      declared_sensitivity: input.sensitivity ?? "public",
      extraction_method: input.method ?? "app_measured",
      raw_context: input.context ?? `${input.predicate}: ${input.value}`,
    });

    return {
      outcome: res.data.outcome.status as ObserveResponse["outcome"],
      observationId: res.data.observation_id,
      claimId: res.data.outcome.claim_id ?? res.data.outcome.existing_claim_id,
      evidenceId: res.data.outcome.evidence_id,
    };
  }

  async recall(options?: RecallOptions): Promise<ContextResponse> {
    return this.context({
      categories: options?.categories,
    });
  }

  // ─── Layer 2: Access Management ──────────────────────────

  readonly permissions = {
    status: async (): Promise<PermissionStatus> => {
      try {
        const res = await request<{
          id: string;
          status: string;
          current_grant_id: string;
        }>(this.http, "GET", "/v1/bindings");

        return {
          connected: true,
          capabilities: ["read_context"],
          readCategories: ["skills"],
          writeCategories: [],
          sensitivityCeiling: "personal",
        };
      } catch {
        return {
          connected: false,
          capabilities: [],
          readCategories: [],
          writeCategories: [],
          sensitivityCeiling: "public",
        };
      }
    },

    request: async (req: PermissionRequest): Promise<PermissionGrant> => {
      const res = await request<{
        binding: { id: string };
        grant: {
          id: string;
          version: number;
          capabilities: string[];
          data_policy: {
            read: { categories: string[]; sensitivity_ceiling: string };
            write: { categories: string[] };
          };
          active: boolean;
        };
      }>(this.http, "POST", "/v1/bindings", {
        passport_id: "psp_default",
        app_principal_id: "app_sdk",
        requested_capabilities: req.capabilities,
        purposes: req.purposes,
        requested_read_categories: req.readCategories,
        requested_write_categories: req.writeCategories,
      });

      const grant = res.data.grant;
      return {
        grantId: grant.id,
        capabilities: grant.capabilities as PermissionGrant["capabilities"],
        readCategories: grant.data_policy.read.categories as Category[],
        writeCategories: grant.data_policy.write.categories as Category[],
        sensitivityCeiling: grant.data_policy.read.sensitivity_ceiling as PermissionGrant["sensitivityCeiling"],
        consentedAt: new Date().toISOString(),
      };
    },

    revoke: async (): Promise<void> => {
      const bindingRes = await request<{ id: string }>(
        this.http, "GET", "/v1/bindings"
      );
      await request(
        this.http, "POST", `/v1/bindings/${bindingRes.data.id}/revoke`, {}
      );
    },
  };

  // ─── Layer 3: Advanced Protocol ──────────────────────────

  readonly advanced = {
    passports: {
      get: async (id: string): Promise<Passport> => {
        const res = await request<{ id: string; created_at: string }>(
          this.http, "GET", `/v1/passports/${id}`
        );
        return { id: res.data.id, createdAt: res.data.created_at };
      },
      list: async (): Promise<Passport[]> => {
        const res = await request<Array<{ id: string; created_at: string }>>(
          this.http, "GET", "/v1/passports"
        );
        return (Array.isArray(res.data) ? res.data : []).map((p) => ({
          id: p.id,
          createdAt: p.created_at,
        }));
      },
    },

    bindings: {
      get: async (id: string): Promise<Binding> => {
        const res = await request<{
          id: string; passport_id?: string; status: string; created_at: string;
        }>(this.http, "GET", "/v1/bindings");
        return {
          id: res.data.id,
          passportId: res.data.passport_id ?? "",
          status: res.data.status as Binding["status"],
          createdAt: res.data.created_at,
        };
      },
      list: async (): Promise<Binding[]> => {
        const res = await request<{
          id: string; passport_id?: string; status: string; created_at: string;
        }>(this.http, "GET", "/v1/bindings");
        return [{
          id: res.data.id,
          passportId: res.data.passport_id ?? "",
          status: res.data.status as Binding["status"],
          createdAt: res.data.created_at,
        }];
      },
    },

    grants: {
      get: async (id: string): Promise<Grant> => {
        const res = await request<{
          grant: { id: string; binding_id?: string; capabilities: string[]; active: boolean; consented_at?: string };
        }>(this.http, "GET", `/v1/grants/${id}`);
        const g = res.data.grant;
        return {
          id: g.id,
          bindingId: g.binding_id ?? "",
          capabilities: g.capabilities as Grant["capabilities"],
          active: g.active,
          consentedAt: g.consented_at ?? "",
        };
      },
      consent: async (grantId: string, approved: boolean): Promise<void> => {
        await request(
          this.http, "POST", `/v1/grants/${grantId}/consent`, { approved }
        );
      },
    },

    claims: {
      get: async (id: string): Promise<ClaimSummary> => {
        const res = await request<{
          id: string; category: string; subject: string; predicate: string;
          value: string; state: string; sensitivity: string;
          confidence_band?: string; created_at: string; updated_at: string;
        }>(this.http, "GET", `/v1/claims/${id}`);
        const c = res.data;
        return {
          id: c.id,
          category: c.category as Category,
          subject: c.subject,
          predicate: c.predicate,
          value: c.value,
          state: c.state,
          sensitivity: c.sensitivity as ClaimSummary["sensitivity"],
          confidence: (c.confidence_band ?? "medium") as ClaimSummary["confidence"],
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        };
      },
      list: async (options?: { category?: Category }): Promise<ClaimSummary[]> => {
        const ctx = await this.context({
          categories: options?.category ? [options.category] : undefined,
        });
        return ctx.items.map((item) => ({
          id: item.id,
          category: item.category,
          subject: "",
          predicate: "",
          value: "",
          state: "",
          sensitivity: item.sensitivity,
          confidence: item.confidence,
          createdAt: "",
          updatedAt: "",
        }));
      },
      confirm: async (id: string): Promise<void> => {
        await request(this.http, "POST", `/v1/claims/${id}/confirm`, {});
      },
      correct: async (id: string, newValue: string): Promise<void> => {
        await request(this.http, "POST", `/v1/claims/${id}/correct`, { new_value: newValue });
      },
      dispute: async (id: string): Promise<void> => {
        await request(this.http, "POST", `/v1/claims/${id}/dispute`, {});
      },
      delete: async (id: string): Promise<void> => {
        await request(this.http, "POST", `/v1/claims/${id}/delete`, {});
      },
    },
  };
}
