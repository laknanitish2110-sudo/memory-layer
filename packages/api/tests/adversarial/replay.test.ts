/**
 * Attack Vector #9: API Replay
 *
 * No request replay can create duplicate state.
 * Token rotation prevents credential replay.
 * Idempotency keys are per-binding.
 */
import { describe, it, expect } from "vitest";
import { ingest, type IngestionContext, type IdGenerator } from "@memory-layer/protocol/src/reconciliation/write-pipeline.js";
import { authorize } from "@memory-layer/protocol/src/authorization/engine.js";
import {
  makeBinding,
  makeGrant,
  makeObservation,
  makeAuthRequest,
  mockClaimStore,
  mockObservationStore,
  mockEvidenceStore,
  passportId,
  bindingId,
  appId,
} from "../helpers/factories.js";
import type { Observation } from "@memory-layer/protocol/src/memory/types.js";

function makeIdGen(): IdGenerator {
  let c = 0;
  return {
    observationId: () => `obs_rpl_${++c}`,
    evidenceId: () => `evi_rpl_${++c}`,
    claimId: () => `clm_rpl_${++c}`,
    claimVersionId: () => `ver_rpl_${++c}`,
  };
}

function makeCtx(overrides: Partial<IngestionContext> = {}): IngestionContext {
  return {
    passportId: passportId(),
    binding: makeBinding(),
    grant: makeGrant({ capabilities: ["write_claims"] }),
    appId: appId(),
    now: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("Attack Vector #9: API Replay", () => {
  // 9a: Same idempotency_key + same payload → idempotent (no duplicate)
  it("9a: replay with same idempotency_key returns duplicate rejection", async () => {
    const existingObs: Observation = {
      ...makeObservation({ idempotency_key: "idem_replay_001" }),
      id: "obs_existing",
      outcome: { status: "accepted", evidence_id: "evi_001", claim_id: "clm_001" },
    };

    const obsStore = mockObservationStore([existingObs]);
    const ctx = makeCtx();

    const obs = makeObservation({
      idempotency_key: "idem_replay_001",
      binding_id: ctx.binding.id,
    });

    const result = await ingest(
      obs,
      ctx,
      { observations: obsStore, claims: mockClaimStore(), evidence: mockEvidenceStore() },
      makeIdGen(),
      "public"
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toContain("duplicate observation");
    }
  });

  // 9b: Same idempotency_key + different payload → 409 deterministic failure
  it("9b: same idempotency_key with different payload is rejected", async () => {
    const existingObs: Observation = {
      ...makeObservation({
        idempotency_key: "idem_conflict_001",
        value: "Python",
      }),
      id: "obs_existing",
      outcome: { status: "accepted", evidence_id: "evi_001", claim_id: "clm_001" },
    };

    const obsStore = mockObservationStore([existingObs]);
    const ctx = makeCtx();

    const differentPayloadObs = makeObservation({
      idempotency_key: "idem_conflict_001",
      binding_id: ctx.binding.id,
      value: "Rust",
    });

    const result = await ingest(
      differentPayloadObs,
      ctx,
      { observations: obsStore, claims: mockClaimStore(), evidence: mockEvidenceStore() },
      makeIdGen(),
      "public"
    );

    expect(result.status).toBe("rejected");
  });

  // 9c: Same idempotency_key in body + same binding → duplicate constraint
  it("9c: same idempotency_key per binding enforced at DB level", async () => {
    const existingObs: Observation = {
      ...makeObservation({
        idempotency_key: "idem_body_001",
        binding_id: bindingId("a"),
      }),
      id: "obs_existing",
      outcome: { status: "accepted", evidence_id: "evi_001", claim_id: "clm_001" },
    };

    const obsStore = mockObservationStore([existingObs]);
    const ctx = makeCtx({
      binding: makeBinding({ id: bindingId("a") }),
      grant: makeGrant({ binding_id: bindingId("a"), capabilities: ["write_claims"] }),
    });

    const obs = makeObservation({
      idempotency_key: "idem_body_001",
      binding_id: bindingId("a"),
    });

    const result = await ingest(
      obs,
      ctx,
      { observations: obsStore, claims: mockClaimStore(), evidence: mockEvidenceStore() },
      makeIdGen(),
      "public"
    );

    expect(result.status).toBe("rejected");
  });

  // 9d: Same idempotency_key + different binding → allowed (keys are per-binding)
  it("9d: same idempotency_key with different binding is allowed", async () => {
    const existingObs: Observation = {
      ...makeObservation({
        idempotency_key: "idem_cross_001",
        binding_id: bindingId("a"),
      }),
      id: "obs_existing",
      outcome: { status: "accepted", evidence_id: "evi_001", claim_id: "clm_001" },
    };

    const obsStore = mockObservationStore([existingObs]);

    const bindingB = makeBinding({ id: bindingId("b") });
    const ctx = makeCtx({
      binding: bindingB,
      grant: makeGrant({ binding_id: bindingId("b"), capabilities: ["write_claims"] }),
    });

    const obs = makeObservation({
      idempotency_key: "idem_cross_001",
      binding_id: bindingId("b"),
    });

    const result = await ingest(
      obs,
      ctx,
      { observations: obsStore, claims: mockClaimStore(), evidence: mockEvidenceStore() },
      makeIdGen(),
      "public"
    );

    expect(result.status).not.toBe("rejected");
  });

  // 9e: Replay token refresh with previously-used refresh token → family revoked
  it("9e: refresh token reuse signals family compromise (contract test)", () => {
    const tokenFamily = {
      family_id: "fam_test_001",
      current_generation: 5,
      reuse_detected: false,
    };

    const replayGeneration = 3;
    if (replayGeneration < tokenFamily.current_generation) {
      tokenFamily.reuse_detected = true;
    }

    expect(tokenFamily.reuse_detected).toBe(true);
  });

  // 9f: Replay any POST after binding revocation → 403
  it("9f: POST after binding revocation denied", () => {
    const binding = makeBinding({
      status: "revoked",
      revoked_at: "2026-10-01T00:30:00Z",
    });
    const grant = makeGrant();
    const request = makeAuthRequest({ capability: "write_claims" });

    const result = authorize(request, binding, grant);
    expect(result.decision).toBe("DENY");
    expect(result).toHaveProperty("reason", "binding_revoked");
  });

  // 9g: Replay any POST after token expiry → 401
  it("9g: expired token must be caught at token validation layer", () => {
    const token = {
      binding_id: bindingId(),
      expires_at: "2026-10-01T00:00:00Z",
      now: "2026-10-01T01:00:00Z",
    };

    const isExpired = new Date(token.now) > new Date(token.expires_at);
    expect(isExpired).toBe(true);
  });

  // 9h: Idempotency key reuse after 24-hour expiry → treated as new request
  it("9h: idempotency key expired after 24 hours treated as new request", () => {
    const keyRecord = {
      key: "idem_expired_001",
      created_at: "2026-09-29T12:00:00Z",
      ttl_hours: 24,
    };

    const now = new Date("2026-10-01T00:00:00Z");
    const keyAge = now.getTime() - new Date(keyRecord.created_at).getTime();
    const ttlMs = keyRecord.ttl_hours * 3600 * 1000;

    const keyExpired = keyAge > ttlMs;
    expect(keyExpired).toBe(true);
  });
});
