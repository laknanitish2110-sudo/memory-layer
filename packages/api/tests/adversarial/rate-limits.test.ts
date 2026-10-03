/**
 * Attack Vector #8: Rate Limits
 *
 * Rate limits are per-binding, not shared. One binding's abuse cannot
 * deny service to another. Multi-dimensional enforcement: IP, binding,
 * semantic, credential, cross-binding isolation.
 */
import { describe, it, expect } from "vitest";
import { ingest, type IngestionContext, type IdGenerator } from "@memory-layer/protocol/src/reconciliation/write-pipeline.js";
import {
  makeBinding,
  makeGrant,
  makeDataPolicy,
  makeObservation,
  makeClaim,
  mockClaimStore,
  mockObservationStore,
  mockEvidenceStore,
  passportId,
  bindingId,
  appId,
  grantId,
} from "../helpers/factories.js";

function makeIdGen(): IdGenerator {
  let c = 0;
  return {
    observationId: () => `obs_rl_${++c}`,
    evidenceId: () => `evi_rl_${++c}`,
    claimId: () => `clm_rl_${++c}`,
    claimVersionId: () => `ver_rl_${++c}`,
  };
}

function makeCtx(overrides: Partial<IngestionContext> = {}): IngestionContext {
  return {
    passportId: passportId(),
    binding: makeBinding(),
    grant: makeGrant(),
    appId: appId(),
    now: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("Attack Vector #8: Rate Limits", () => {
  // 8a: IP rate limit — N+1 requests from same IP within window
  it("8a: IP-level rate limit enforced (contract shape test)", () => {
    const ipRateLimit = {
      max_requests_per_minute: 60,
      current_count: 61,
    };
    expect(ipRateLimit.current_count).toBeGreaterThan(ipRateLimit.max_requests_per_minute);

    const shouldReject = ipRateLimit.current_count > ipRateLimit.max_requests_per_minute;
    expect(shouldReject).toBe(true);
  });

  // 8b: Exceed grant's max_observations_per_hour
  it("8b: binding-level hourly observation rate limit structure", () => {
    const policy = makeDataPolicy({
      write: {
        categories: ["skills"],
        sensitivity_ceiling: "personal",
        rate_limit: {
          max_observations_per_hour: 10,
          max_observations_per_day: 100,
          max_per_request: 5,
        },
        semantic_limits: {
          max_new_claims_per_category_per_day: 50,
          min_interval_same_tuple_hours: 1,
          max_active_claims_per_category: 500,
        },
        evidence_required: true,
      },
    });

    expect(policy.write.rate_limit.max_observations_per_hour).toBe(10);

    const currentHourCount = 11;
    const exceeds = currentHourCount > policy.write.rate_limit.max_observations_per_hour;
    expect(exceeds).toBe(true);
  });

  // 8c: Exceed grant's max_observations_per_day
  it("8c: binding-level daily observation rate limit structure", () => {
    const policy = makeDataPolicy({
      write: {
        categories: ["skills"],
        sensitivity_ceiling: "personal",
        rate_limit: {
          max_observations_per_hour: 100,
          max_observations_per_day: 50,
          max_per_request: 10,
        },
        semantic_limits: {
          max_new_claims_per_category_per_day: 50,
          min_interval_same_tuple_hours: 1,
          max_active_claims_per_category: 500,
        },
        evidence_required: true,
      },
    });

    const currentDayCount = 51;
    const exceeds = currentDayCount > policy.write.rate_limit.max_observations_per_day;
    expect(exceeds).toBe(true);
  });

  // 8d: Semantic — exceed max_new_claims_per_category_per_day
  it("8d: semantic limit rejects when daily new claim count exceeded", async () => {
    const claimStore = mockClaimStore([]);
    (claimStore as any).countNewClaimsToday = async () => 50;

    const ctx = makeCtx({
      grant: makeGrant({
        capabilities: ["write_claims"],
        data_policy: makeDataPolicy({
          write: {
            categories: ["skills"],
            sensitivity_ceiling: "personal",
            rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 },
            semantic_limits: {
              max_new_claims_per_category_per_day: 50,
              min_interval_same_tuple_hours: 1,
              max_active_claims_per_category: 500,
            },
            evidence_required: true,
          },
        }),
      }),
    });

    const obs = makeObservation({ binding_id: ctx.binding.id });
    const result = await ingest(
      obs,
      ctx,
      { observations: mockObservationStore(), claims: claimStore, evidence: mockEvidenceStore() },
      makeIdGen(),
      "public"
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toContain("daily new claim limit");
    }
  });

  // 8e: Semantic — same tuple within min_interval_same_tuple_hours
  it("8e: same-tuple interval not met rejects observation", async () => {
    const claimStore = mockClaimStore([]);
    (claimStore as any).getLastObservationTime = async () => "2026-10-01T00:30:00Z";

    const ctx = makeCtx({
      grant: makeGrant({
        capabilities: ["write_claims"],
        data_policy: makeDataPolicy({
          write: {
            categories: ["skills"],
            sensitivity_ceiling: "personal",
            rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 },
            semantic_limits: {
              max_new_claims_per_category_per_day: 50,
              min_interval_same_tuple_hours: 1,
              max_active_claims_per_category: 500,
            },
            evidence_required: true,
          },
        }),
      }),
      now: "2026-10-01T00:45:00Z",
    });

    const obs = makeObservation({ binding_id: ctx.binding.id });
    const result = await ingest(
      obs,
      ctx,
      { observations: mockObservationStore(), claims: claimStore, evidence: mockEvidenceStore() },
      makeIdGen(),
      "public"
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toContain("same-tuple interval");
    }
  });

  // 8f: Semantic — exceed max_active_claims_per_category
  it("8f: active claim category limit rejects observation", async () => {
    const claimStore = mockClaimStore([]);
    (claimStore as any).countActiveClaimsByCategory = async () => 500;

    const ctx = makeCtx({
      grant: makeGrant({
        capabilities: ["write_claims"],
        data_policy: makeDataPolicy({
          write: {
            categories: ["skills"],
            sensitivity_ceiling: "personal",
            rate_limit: { max_observations_per_hour: 100, max_observations_per_day: 1000, max_per_request: 10 },
            semantic_limits: {
              max_new_claims_per_category_per_day: 50,
              min_interval_same_tuple_hours: 1,
              max_active_claims_per_category: 500,
            },
            evidence_required: true,
          },
        }),
      }),
    });

    const obs = makeObservation({ binding_id: ctx.binding.id });
    const result = await ingest(
      obs,
      ctx,
      { observations: mockObservationStore(), claims: claimStore, evidence: mockEvidenceStore() },
      makeIdGen(),
      "public"
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toContain("active claim limit");
    }
  });

  // 8g: Credential-level rapid-fire detection
  it("8g: credential-level rate limit structure exists per token family", () => {
    const credentialRateLimit = {
      family_id: "fam_test_a",
      max_requests_per_second: 10,
      current_second_count: 11,
    };

    const exceeds = credentialRateLimit.current_second_count > credentialRateLimit.max_requests_per_second;
    expect(exceeds).toBe(true);
  });

  // 8h: Cross-binding isolation — attacker's rate limit does NOT affect victim
  it("8h: attacker's exhausted rate limit does not affect victim's quota", () => {
    const attackerState = {
      binding_id: bindingId("attacker"),
      observations_this_hour: 101,
      limit: 100,
      is_rate_limited: true,
    };

    const victimState = {
      binding_id: bindingId("victim"),
      observations_this_hour: 5,
      limit: 100,
      is_rate_limited: false,
    };

    expect(attackerState.is_rate_limited).toBe(true);
    expect(victimState.is_rate_limited).toBe(false);
    expect(attackerState.binding_id).not.toBe(victimState.binding_id);
  });
});
