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
  private readonly config: Required<Pick<MemoryLayerConfig, "baseUrl" | "timeout">> & MemoryLayerConfig;

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

    this.config = {
      baseUrl: "https://api.memorylayer.dev/v1",
      timeout: 10_000,
      ...config,
    };
  }

  // --- Layer 1: Simple API ---

  async context(options?: ContextOptions): Promise<ContextResponse> {
    throw new Error("Not implemented — M3.1");
  }

  async observe(input: ObserveInput): Promise<ObserveResponse> {
    throw new Error("Not implemented — M3.1");
  }

  async recall(options?: RecallOptions): Promise<ContextResponse> {
    throw new Error("Not implemented — M3.1");
  }

  // --- Layer 2: Access Management ---

  readonly permissions = {
    status: async (): Promise<PermissionStatus> => {
      throw new Error("Not implemented — M3.1");
    },
    request: async (request: PermissionRequest): Promise<PermissionGrant> => {
      throw new Error("Not implemented — M3.1");
    },
    revoke: async (): Promise<void> => {
      throw new Error("Not implemented — M3.1");
    },
  };

  // --- Layer 3: Advanced Protocol ---

  readonly advanced = {
    passports: {
      get: async (id: string): Promise<Passport> => {
        throw new Error("Not implemented — M3.1");
      },
      list: async (): Promise<Passport[]> => {
        throw new Error("Not implemented — M3.1");
      },
    },
    bindings: {
      get: async (id: string): Promise<Binding> => {
        throw new Error("Not implemented — M3.1");
      },
      list: async (): Promise<Binding[]> => {
        throw new Error("Not implemented — M3.1");
      },
    },
    grants: {
      get: async (id: string): Promise<Grant> => {
        throw new Error("Not implemented — M3.1");
      },
      consent: async (grantId: string, approved: boolean): Promise<void> => {
        throw new Error("Not implemented — M3.1");
      },
    },
    claims: {
      get: async (id: string): Promise<ClaimSummary> => {
        throw new Error("Not implemented — M3.1");
      },
      list: async (options?: { category?: Category }): Promise<ClaimSummary[]> => {
        throw new Error("Not implemented — M3.1");
      },
      confirm: async (id: string): Promise<void> => {
        throw new Error("Not implemented — M3.1");
      },
      correct: async (id: string, newValue: string): Promise<void> => {
        throw new Error("Not implemented — M3.1");
      },
      dispute: async (id: string): Promise<void> => {
        throw new Error("Not implemented — M3.1");
      },
      delete: async (id: string): Promise<void> => {
        throw new Error("Not implemented — M3.1");
      },
    },
  };
}
