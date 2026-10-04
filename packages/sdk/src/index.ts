/**
 * @memory-layer/sdk
 *
 * Portable AI memory for any application.
 *
 * Quick start:
 *
 *   import { MemoryLayer } from "@memory-layer/sdk";
 *
 *   const memory = new MemoryLayer({
 *     apiKey: process.env.MEMORY_LAYER_KEY,
 *   });
 *
 *   // Read what you know about this user
 *   const ctx = await memory.context();
 *
 *   // Record something new
 *   await memory.observe({
 *     predicate: "learning",
 *     value: "Rust",
 *   });
 */

export type {
  // Config
  MemoryLayerConfig,

  // Layer 1: Simple API
  Category,
  Sensitivity,
  Confidence,
  ContextItem,
  ContextResponse,
  ContextOptions,
  ObserveInput,
  ObserveOutcome,
  ObserveResponse,
  RecallOptions,

  // Layer 2: Access Management
  PermissionCapability,
  PermissionStatus,
  PermissionRequest,
  PermissionGrant,

  // Layer 3: Advanced
  Passport,
  Binding,
  Grant,
  ClaimSummary,

  // Errors
  MemoryErrorCode,
  MemoryErrorDetails,

  // Client interface
  MemoryClient,
} from "./types.js";

export {
  MemoryError,
  MemoryAuthError,
  MemoryPermissionError,
  MemoryValidationError,
  MemoryConflictError,
  MemoryRateLimitError,
} from "./errors.js";

export { MemoryLayer } from "./client.js";
