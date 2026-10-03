export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "IDEMPOTENCY_CONFLICT"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "TOKEN_REUSE_DETECTED"
  | "BINDING_SUSPENDED"
  | "BINDING_REVOKED"
  | "CAPABILITY_NOT_GRANTED"
  | "CATEGORY_NOT_GRANTED"
  | "SENSITIVITY_EXCEEDS_CEILING"
  | "PURPOSE_NOT_AUTHORIZED"
  | "STALE_BINDING_REVISION"
  | "GRANT_EXPIRED"
  | "NOT_FOUND"
  | "DUPLICATE_OBSERVATION"
  | "PROTOCOL_NAMESPACE"
  | "QUARANTINED"
  | "SEMANTIC_LIMIT"
  | "RATE_LIMITED"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        request_id: this.requestId ?? null,
      },
    };
  }
}

export function mapKernelDenyToApiError(
  reason: string,
  requestId: string
): ApiError {
  switch (reason) {
    case "binding_not_found":
      return new ApiError(404, "NOT_FOUND", "Binding not found", requestId);
    case "binding_revoked":
      return new ApiError(403, "BINDING_REVOKED", "Binding has been revoked", requestId);
    case "binding_suspended":
      return new ApiError(403, "BINDING_SUSPENDED", "Binding is suspended", requestId);
    case "stale_binding_revision":
      return new ApiError(403, "STALE_BINDING_REVISION", "Binding revision is stale", requestId);
    case "grant_not_found":
      return new ApiError(404, "NOT_FOUND", "Grant not found", requestId);
    case "grant_inactive":
    case "grant_expired":
      return new ApiError(403, "GRANT_EXPIRED", "Grant requires reauthorization", requestId);
    case "capability_not_granted":
      return new ApiError(403, "CAPABILITY_NOT_GRANTED", "Missing required capability", requestId);
    case "category_not_granted":
      return new ApiError(403, "CATEGORY_NOT_GRANTED", "Category outside grant", requestId);
    case "sensitivity_exceeds_ceiling":
      return new ApiError(403, "SENSITIVITY_EXCEEDS_CEILING", "Sensitivity above binding ceiling", requestId);
    case "purpose_not_authorized":
      return new ApiError(403, "PURPOSE_NOT_AUTHORIZED", "Purpose template violation", requestId);
    case "credential_invalid":
      return new ApiError(401, "TOKEN_INVALID", "Invalid credentials", requestId);
    case "credential_expired":
      return new ApiError(401, "TOKEN_EXPIRED", "Credentials expired", requestId);
    default:
      return new ApiError(403, "CAPABILITY_NOT_GRANTED", "Authorization denied", requestId);
  }
}

export function mapIngestionReasonToApiError(
  reason: string,
  requestId: string
): ApiError {
  if (reason.includes("idempotency_key") || reason.includes("duplicate")) {
    return new ApiError(409, "DUPLICATE_OBSERVATION", reason, requestId);
  }
  if (reason.includes("protocol namespace")) {
    return new ApiError(422, "PROTOCOL_NAMESPACE", reason, requestId);
  }
  if (reason.includes("capability")) {
    return new ApiError(403, "CAPABILITY_NOT_GRANTED", reason, requestId);
  }
  if (reason.includes("category")) {
    return new ApiError(403, "CATEGORY_NOT_GRANTED", reason, requestId);
  }
  if (reason.includes("sensitivity") && reason.includes("ceiling")) {
    return new ApiError(403, "SENSITIVITY_EXCEEDS_CEILING", reason, requestId);
  }
  if (reason.includes("limit") || reason.includes("interval")) {
    return new ApiError(422, "SEMANTIC_LIMIT", reason, requestId);
  }
  if (reason.includes("evidence required")) {
    return new ApiError(400, "VALIDATION_ERROR", reason, requestId);
  }
  return new ApiError(422, "VALIDATION_ERROR", reason, requestId);
}
