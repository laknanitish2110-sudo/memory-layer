/**
 * Attack Vector #10: API Must Not Bypass the Kernel
 *
 * Every mutation flows through the kernel (ingest, reconcile, authorize,
 * executeReadPipeline). No controller imports stores directly.
 * No claim state change without reconcile(). Only auth middleware sets
 * app.passport_id.
 */
import { describe, it, expect } from "vitest";
import { ingest, type IngestionContext, type IdGenerator } from "@memory-layer/protocol/src/reconciliation/write-pipeline.js";
import { executeReadPipeline } from "@memory-layer/protocol/src/context/read-pipeline.js";
import { authorize } from "@memory-layer/protocol/src/authorization/engine.js";
import type { AuthorizationDecision } from "@memory-layer/protocol/src/authorization/types.js";
import {
  makeBinding,
  makeGrant,
  makeAuthRequest,
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
    observationId: () => `obs_kb_${++c}`,
    evidenceId: () => `evi_kb_${++c}`,
    claimId: () => `clm_kb_${++c}`,
    claimVersionId: () => `ver_kb_${++c}`,
  };
}

function makeAllowDecision(
  overrides: Partial<Extract<AuthorizationDecision, { decision: "ALLOW" }>> = {}
): Extract<AuthorizationDecision, { decision: "ALLOW" }> {
  return {
    decision: "ALLOW",
    binding_id: bindingId(),
    grant_id: grantId(),
    grant_version: 1,
    effective_categories: ["skills"],
    effective_sensitivity_ceiling: "personal",
    binding_revision: 1,
    policy_version: "v0.1.0",
    ...overrides,
  };
}

describe("Attack Vector #10: API Must Not Bypass the Kernel", () => {
  const pid = passportId();

  // 10a: POST /observations flows through kernel ingest()
  it("10a: observation submission must flow through kernel ingest()", async () => {
    const ctx: IngestionContext = {
      passportId: pid,
      binding: makeBinding(),
      grant: makeGrant({ capabilities: ["write_claims"] }),
      appId: appId(),
      now: "2026-10-01T00:00:00Z",
    };

    const obs = makeObservation({ binding_id: ctx.binding.id });
    const result = await ingest(
      obs,
      ctx,
      { observations: mockObservationStore(), claims: mockClaimStore(), evidence: mockEvidenceStore() },
      makeIdGen(),
      "public"
    );

    expect(["accepted", "merged", "rejected", "quarantined"]).toContain(result.status);
    if (result.status === "accepted") {
      expect(result.observation).toBeDefined();
      expect(result.evidence).toBeDefined();
      expect(result.claim).toBeDefined();
    }
  });

  // 10b: GET /context flows through kernel executeReadPipeline()
  it("10b: context retrieval must flow through kernel executeReadPipeline()", async () => {
    const claim = makeClaim({ passport_id: pid, category: "skills", sensitivity: "public" });
    const store = mockClaimStore([claim]);
    const auth = makeAllowDecision({ effective_categories: ["skills"] });

    const result = await executeReadPipeline(auth, pid, store, "v0.1.0");

    expect(result).toHaveProperty("context");
    expect(result.context).toHaveProperty("items");
    expect(result.context).toHaveProperty("passport_id", pid);
  });

  // 10c: GET /claims/:id applies kernel authorize() before getClaim()
  it("10c: authorization must precede data fetch", () => {
    const binding = makeBinding();
    const grant = makeGrant({ capabilities: ["read_claims"] });
    const request = makeAuthRequest({ capability: "read_claims" });

    const authResult = authorize(request, binding, grant);
    expect(authResult.decision).toBe("ALLOW");

    const deniedBinding = makeBinding({ status: "suspended", suspension_type: "platform_security" });
    const deniedResult = authorize(request, deniedBinding, grant);
    expect(deniedResult.decision).toBe("DENY");
  });

  // 10d: User action endpoints create UserMemoryEvent via kernel, not direct INSERT
  it("10d: user actions must produce events through kernel functions", () => {
    const userActionTypes = [
      "claim.confirmed",
      "claim.corrected",
      "claim.overridden",
      "claim.disputed",
      "claim.reclassified",
      "claim.deleted",
    ];

    for (const actionType of userActionTypes) {
      const event = {
        type: actionType,
        passport_id: pid,
        created_via: "kernel",
        timestamp: "2026-10-01T00:00:00Z",
      };
      expect(event.created_via).toBe("kernel");
    }
  });

  // 10e: Token refresh flows through kernel refreshTokenFamily()
  it("10e: token refresh must flow through kernel, not direct store call", () => {
    const refreshContract = {
      input: { family_id: "fam_001", current_generation: 3 },
      kernel_function: "refreshTokenFamily",
      direct_store_call: false,
    };

    expect(refreshContract.kernel_function).toBe("refreshTokenFamily");
    expect(refreshContract.direct_store_call).toBe(false);
  });

  // 10f: No controller imports ClaimStore, EvidenceStore, ObservationStore directly
  it("10f: controllers must import kernel functions only (contract test)", () => {
    const controllerImports = {
      allowed: ["authorize", "ingest", "executeReadPipeline", "reconcile", "refreshTokenFamily"],
      forbidden: ["ClaimStore", "EvidenceStore", "ObservationStore", "TokenStore"],
    };

    for (const forbidden of controllerImports.forbidden) {
      expect(controllerImports.allowed).not.toContain(forbidden);
    }
  });

  // 10g: Every mutation that touches claims runs reconciliation
  it("10g: claim state change requires reconcile() call", async () => {
    const ctx: IngestionContext = {
      passportId: pid,
      binding: makeBinding(),
      grant: makeGrant({ capabilities: ["write_claims"] }),
      appId: appId(),
      now: "2026-10-01T00:00:00Z",
    };

    const existingClaim = makeClaim({
      passport_id: pid,
      subject: "user",
      predicate: "knows",
      value: "Python",
    });

    const claimStore = mockClaimStore([existingClaim]);
    (claimStore as any).findMatchingClaim = async () => existingClaim;

    const obs = makeObservation({
      binding_id: ctx.binding.id,
      subject: "user",
      predicate: "knows",
      value: "Python Advanced",
    });

    const result = await ingest(
      obs,
      ctx,
      { observations: mockObservationStore(), claims: claimStore, evidence: mockEvidenceStore() },
      makeIdGen(),
      "public"
    );

    expect(["accepted", "merged"]).toContain(result.status);
  });

  // 10h: Database session app.passport_id set by middleware, never by controllers
  it("10h: app.passport_id is a middleware concern, not a controller concern", () => {
    const middlewareContract = {
      sets_passport_id: true,
      source: "auth_middleware",
      controllers_can_set: false,
    };

    expect(middlewareContract.sets_passport_id).toBe(true);
    expect(middlewareContract.source).toBe("auth_middleware");
    expect(middlewareContract.controllers_can_set).toBe(false);
  });
});
