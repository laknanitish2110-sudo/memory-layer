import type { MemoryLayerConfig } from "./types.js";
import { MemoryError, MemoryAuthError, fromApiError } from "./errors.js";

export interface HttpConfig {
  baseUrl: string;
  timeout: number;
  fetch: typeof globalThis.fetch;
  getAuthHeader: () => string;
}

export interface ApiResponse<T = unknown> {
  data: T;
  meta: { request_id: string; policy_version: string };
}

export async function request<T>(
  config: HttpConfig,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>
): Promise<ApiResponse<T>> {
  const url = new URL(path, config.baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Authorization: config.getAuthHeader(),
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeout);

  let res: Response;
  try {
    res = await config.fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new MemoryError({
        code: "NETWORK_ERROR",
        message: `Request timed out after ${config.timeout}ms`,
        suggestion: "Increase the timeout in MemoryLayer config, or check network connectivity.",
      });
    }
    throw new MemoryError({
      code: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "Network request failed",
      suggestion: "Check network connectivity and the baseUrl in MemoryLayer config.",
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) {
    return (await res.json()) as ApiResponse<T>;
  }

  let errorBody: { error?: { code?: string; message?: string; request_id?: string } };
  try {
    errorBody = await res.json();
  } catch {
    throw new MemoryError({
      code: "SERVER_ERROR",
      message: `HTTP ${res.status}: ${res.statusText}`,
    });
  }

  const apiCode = errorBody.error?.code ?? "INTERNAL_ERROR";
  const apiMessage = errorBody.error?.message ?? `HTTP ${res.status}`;
  const requestId = errorBody.error?.request_id;

  throw fromApiError(apiCode, apiMessage, requestId);
}

export function requestNoAuth<T>(
  config: Omit<HttpConfig, "getAuthHeader">,
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  return request<T>(
    { ...config, getAuthHeader: () => "" },
    method,
    path,
    body
  );
}
