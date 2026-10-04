import type { MemoryErrorCode, MemoryErrorDetails } from "./types.js";

/**
 * Base error for all Memory Layer SDK errors.
 * Always has a human-readable message and a machine-readable code.
 */
export class MemoryError extends Error {
  readonly code: MemoryErrorCode;
  readonly suggestion?: string;
  readonly allowed?: string[];
  readonly apiCode?: string;
  readonly requestId?: string;

  constructor(details: MemoryErrorDetails) {
    super(details.message);
    this.name = "MemoryError";
    this.code = details.code;
    this.suggestion = details.suggestion;
    this.allowed = details.allowed;
    this.apiCode = details.apiCode;
    this.requestId = details.requestId;
  }
}

/** Token is missing, invalid, or expired. */
export class MemoryAuthError extends MemoryError {
  constructor(details: Omit<MemoryErrorDetails, "code"> & { code?: "AUTH_REQUIRED" | "AUTH_EXPIRED" }) {
    super({ code: details.code ?? "AUTH_REQUIRED", ...details });
    this.name = "MemoryAuthError";
  }
}

/** Application lacks the required capability, category, or sensitivity level. */
export class MemoryPermissionError extends MemoryError {
  constructor(details: Omit<MemoryErrorDetails, "code"> & { code?: "PERMISSION_DENIED" | "CATEGORY_DENIED" | "SENSITIVITY_DENIED" }) {
    super({ code: details.code ?? "PERMISSION_DENIED", ...details });
    this.name = "MemoryPermissionError";
  }
}

/** Input validation failed. */
export class MemoryValidationError extends MemoryError {
  constructor(details: Omit<MemoryErrorDetails, "code">) {
    super({ code: "VALIDATION", ...details });
    this.name = "MemoryValidationError";
  }
}

/** Idempotency conflict — observation was already processed. */
export class MemoryConflictError extends MemoryError {
  constructor(details: Omit<MemoryErrorDetails, "code">) {
    super({ code: "CONFLICT", ...details });
    this.name = "MemoryConflictError";
  }
}

/** Rate limit exceeded. */
export class MemoryRateLimitError extends MemoryError {
  constructor(details: Omit<MemoryErrorDetails, "code">) {
    super({ code: "RATE_LIMITED", ...details });
    this.name = "MemoryRateLimitError";
  }
}

const API_CODE_MAP: Record<string, (msg: string, reqId?: string) => MemoryError> = {
  TOKEN_INVALID: (msg, reqId) => new MemoryAuthError({
    message: "Invalid API key or session token.",
    suggestion: "Check your apiKey or sessionToken in MemoryLayer config.",
    apiCode: "TOKEN_INVALID",
    requestId: reqId,
  }),
  TOKEN_EXPIRED: (msg, reqId) => new MemoryAuthError({
    code: "AUTH_EXPIRED",
    message: "Your session has expired.",
    suggestion: "Re-authenticate or refresh your session token.",
    apiCode: "TOKEN_EXPIRED",
    requestId: reqId,
  }),
  CAPABILITY_NOT_GRANTED: (msg, reqId) => new MemoryPermissionError({
    message: "This application doesn't have the required capability.",
    suggestion: "Request broader access with memory.permissions.request().",
    apiCode: "CAPABILITY_NOT_GRANTED",
    requestId: reqId,
  }),
  CATEGORY_NOT_GRANTED: (msg, reqId) => new MemoryPermissionError({
    code: "CATEGORY_DENIED",
    message: msg || "This application isn't authorized for that memory category.",
    suggestion: "Request access to additional categories with memory.permissions.request().",
    apiCode: "CATEGORY_NOT_GRANTED",
    requestId: reqId,
  }),
  SENSITIVITY_EXCEEDS_CEILING: (msg, reqId) => new MemoryPermissionError({
    code: "SENSITIVITY_DENIED",
    message: "Data sensitivity exceeds this application's ceiling.",
    suggestion: "Lower the sensitivity level, or request elevated access.",
    apiCode: "SENSITIVITY_EXCEEDS_CEILING",
    requestId: reqId,
  }),
  BINDING_REVOKED: (msg, reqId) => new MemoryPermissionError({
    message: "This application's access has been revoked by the user.",
    suggestion: "The user must re-authorize this application.",
    apiCode: "BINDING_REVOKED",
    requestId: reqId,
  }),
  BINDING_SUSPENDED: (msg, reqId) => new MemoryPermissionError({
    message: "This application's access is temporarily suspended.",
    suggestion: "Contact support or wait for suspension to be lifted.",
    apiCode: "BINDING_SUSPENDED",
    requestId: reqId,
  }),
  DUPLICATE_OBSERVATION: (msg, reqId) => new MemoryConflictError({
    message: "This observation was already submitted.",
    suggestion: "Use a unique idempotencyKey for each distinct observation.",
    apiCode: "DUPLICATE_OBSERVATION",
    requestId: reqId,
  }),
  RATE_LIMITED: (msg, reqId) => new MemoryRateLimitError({
    message: "Too many requests. Slow down.",
    suggestion: "Reduce observation frequency or request a higher rate limit.",
    apiCode: "RATE_LIMITED",
    requestId: reqId,
  }),
  VALIDATION_ERROR: (msg, reqId) => new MemoryValidationError({
    message: msg || "Invalid request.",
    apiCode: "VALIDATION_ERROR",
    requestId: reqId,
  }),
};

export function fromApiError(apiCode: string, message: string, requestId?: string): MemoryError {
  const factory = API_CODE_MAP[apiCode];
  if (factory) return factory(message, requestId);
  return new MemoryError({
    code: "SERVER_ERROR",
    message: message || "An unexpected error occurred.",
    apiCode,
    requestId,
  });
}
