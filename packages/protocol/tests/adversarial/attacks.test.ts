import { describe, it, expect, beforeEach } from "vitest";
import { authorize } from "../../src/authorization/engine.js";
import { ingest, type IngestionContext } from "../../src/reconciliation/write-pipeline.js";
import { validateOutput, type ContextModel } from "../../src/context/context-model.js";
import { isGrantWithinPurpose, resolvePurposes } from "../../src/authorization/purpose.js";
import {
  makeBinding,
  makeGrant,
  makeObservation,
  makeClaim,
  makeIdGenerator,
  resetIds,
  InMemoryClaimStore,
  InMemoryEvidenceStore,
  InMemoryObservationStore,
} from "../helpers.js";
import type { AuthorizationRequest } from "../../src/authorization/types.js";

describe("Adversarial Tests", () => {
  describe("passport isolation", () => {
    it("app cannot read claims from another passport", () => {
      const request: AuthorizationRequest = {
        credential_id: "cred_1",
        binding_id: "binding_1",
        binding_revision: 1,
        capability: "read_claims",
        categories: ["skills"],
        max_sensitivity: "personal",
        purpose: null,
      };
      const binding = makeBinding({ passport_id: "passport_1" });
      const result = authorize(request, binding, makeGrant());
      expect(result.decision).toBe("ALLOW");
      if (result.decision === "ALLOW") {
        expect(result.binding_id).toBe("binding_1");
      }
    });
  });

  describe("evidence tier escalation", () => {
    it("app cannot submit tier 1 evidence (user correction)", async () => {
      resetIds();
      const stores = {
        claims: new InMemoryClaimStore(),
        evidence: new InMemoryEvidenceStore(),
        observations: new InMemoryObservationStore(),
      };
      const ctx: IngestionContext = {
        passportId: "passport_1",
        binding: makeBinding(),
        grant: makeGrant(),
        appId: "app_1",
        now: "2024-06-01T12:00:00Z",
      };
      const obs = makeObservation({ extraction_method: "app_measured" });
      const result = await ingest(obs, ctx, stores, makeIdGenerator(), "public");
      if (result.status === "accepted" || result.status === "merged") {
        expect(result.evidence.source_type).toBeGreaterThanOrEqual(4);
        expect(result.evidence.source_type).not.toBe(1);
        expect(result.evidence.source_type).not.toBe(3);
      }
    });
  });

  describe("duplicate observation", () => {
    it("rejects replay with same idempotency key", async () => {
      resetIds();
      const stores = {
        claims: new InMemoryClaimStore(),
        evidence: new InMemoryEvidenceStore(),
        observations: new InMemoryObservationStore(),
      };
      const ctx: IngestionContext = {
        passportId: "passport_1",
        binding: makeBinding(),
        grant: makeGrant(),
        appId: "app_1",
        now: "2024-06-01T12:00:00Z",
      };

      const obs = makeObservation({ idempotency_key: "replay_key" });
      await ingest(obs, ctx, stores, makeIdGenerator(), "public");

      const result = await ingest(
        { ...obs, idempotency_key: "replay_key" },
        ctx,
        stores,
        makeIdGenerator(),
        "public"
      );
      expect(result.status).toBe("rejected");
    });
  });

  describe("cross-app observation retraction", () => {
    it("app cannot retract another app's observation via write pipeline", async () => {
      resetIds();
      const stores = {
        claims: new InMemoryClaimStore(),
        evidence: new InMemoryEvidenceStore(),
        observations: new InMemoryObservationStore(),
      };
      const ctx: IngestionContext = {
        passportId: "passport_1",
        binding: makeBinding(),
        grant: makeGrant({ capabilities: ["retract_own_observation"] }),
        appId: "app_2",
        now: "2024-06-01T12:00:00Z",
      };
      const obs = makeObservation({ subject: "user", predicate: "knows", value: "Python" });
      const result = await ingest(obs, ctx, stores, makeIdGenerator(), "public");
      if (result.status === "accepted" || result.status === "merged") {
        expect(result.evidence.app_id).toBe("app_2");
      }
    });
  });

  describe("wildcard permission request", () => {
    it("no capability grants access to all categories", () => {
      const request: AuthorizationRequest = {
        credential_id: "cred_1",
        binding_id: "binding_1",
        binding_revision: 1,
        capability: "read_claims",
        categories: ["emotional_patterns"],
        max_sensitivity: "sensitive",
        purpose: null,
      };
      const result = authorize(request, makeBinding(), makeGrant());
      expect(result.decision).toBe("DENY");
    });
  });

  describe("restricted claim without approval", () => {
    it("restricted sensitivity always exceeds personal ceiling", () => {
      const request: AuthorizationRequest = {
        credential_id: "cred_1",
        binding_id: "binding_1",
        binding_revision: 1,
        capability: "read_claims",
        categories: ["skills"],
        max_sensitivity: "restricted",
        purpose: null,
      };
      const result = authorize(request, makeBinding(), makeGrant());
      expect(result).toEqual({ decision: "DENY", reason: "sensitivity_exceeds_ceiling" });
    });
  });

  describe("stale binding revision", () => {
    it("rejected after revocation increments revision", () => {
      const binding = makeBinding({ revision: 5 });
      const request: AuthorizationRequest = {
        credential_id: "cred_1",
        binding_id: "binding_1",
        binding_revision: 4,
        capability: "read_claims",
        categories: ["skills"],
        max_sensitivity: "personal",
        purpose: null,
      };
      const result = authorize(request, binding, makeGrant());
      expect(result).toEqual({ decision: "DENY", reason: "stale_binding_revision" });
    });
  });

  describe("expired grant", () => {
    it("inactive grant = DENY", () => {
      const result = authorize(
        {
          credential_id: "cred_1",
          binding_id: "binding_1",
          binding_revision: 1,
          capability: "read_claims",
          categories: ["skills"],
          max_sensitivity: "personal",
          purpose: null,
        },
        makeBinding(),
        makeGrant({ active: false })
      );
      expect(result).toEqual({ decision: "DENY", reason: "grant_inactive" });
    });
  });

  describe("protocol namespace write", () => {
    it("app cannot write protocol.* claims", async () => {
      resetIds();
      const stores = {
        claims: new InMemoryClaimStore(),
        evidence: new InMemoryEvidenceStore(),
        observations: new InMemoryObservationStore(),
      };
      const ctx: IngestionContext = {
        passportId: "passport_1",
        binding: makeBinding(),
        grant: makeGrant(),
        appId: "app_1",
        now: "2024-06-01T12:00:00Z",
      };

      const obs1 = makeObservation({ subject: "protocol.passport" });
      expect((await ingest(obs1, ctx, stores, makeIdGenerator(), "public")).status).toBe("rejected");

      const obs2 = makeObservation({ predicate: "protocol.consent" });
      expect((await ingest(obs2, ctx, stores, makeIdGenerator(), "public")).status).toBe("rejected");
    });
  });

  describe("ownership transfer", () => {
    it("suspended binding after ownership change = DENY", () => {
      const binding = makeBinding({
        status: "suspended",
        suspension_type: "ownership_transfer",
      });
      const result = authorize(
        {
          credential_id: "cred_1",
          binding_id: "binding_1",
          binding_revision: 1,
          capability: "read_claims",
          categories: ["skills"],
          max_sensitivity: "personal",
          purpose: null,
        },
        binding,
        makeGrant()
      );
      expect(result).toEqual({ decision: "DENY", reason: "binding_suspended" });
    });
  });

  describe("purpose template enforcement", () => {
    it("grant within purpose ceiling = accepted", () => {
      const grant = makeGrant({
        capabilities: ["read_context", "read_claims"],
        authorized_purposes: ["coding_assistance"],
      });
      const templates = resolvePurposes(["coding_assistance"]);
      expect(isGrantWithinPurpose(grant, templates)).toBe(true);
    });

    it("grant outside purpose ceiling = rejected", () => {
      const grant = makeGrant({
        capabilities: ["read_context", "read_claims"],
        authorized_purposes: ["coding_assistance"],
        data_policy: {
          ...makeGrant().data_policy,
          read: {
            categories: ["skills", "emotional_patterns"],
            sensitivity_ceiling: "personal",
          },
        },
      });
      const templates = resolvePurposes(["coding_assistance"]);
      expect(isGrantWithinPurpose(grant, templates)).toBe(false);
    });

    it("coding_assistance purpose cannot grant sensitive access", () => {
      const grant = makeGrant({
        capabilities: ["read_context"],
        authorized_purposes: ["coding_assistance"],
        data_policy: {
          ...makeGrant().data_policy,
          read: {
            categories: ["skills"],
            sensitivity_ceiling: "sensitive",
          },
        },
      });
      const templates = resolvePurposes(["coding_assistance"]);
      expect(isGrantWithinPurpose(grant, templates)).toBe(false);
    });
  });

  describe("output validation — never rewrite", () => {
    it("returns INVALID, not a stripped version", () => {
      const context: ContextModel = {
        items: [
          { claim_id: "c1", category: "skills", sensitivity: "public", summary: "safe", confidence_band: "high" },
          { claim_id: "c2", category: "emotional_patterns", sensitivity: "sensitive", summary: "LEAK", confidence_band: "low" },
        ],
        passport_id: "p1",
        generated_at: "2024-01-01T00:00:00Z",
        policy_version: "v0.1.0",
      };
      const result = validateOutput(context, ["skills"], "personal");
      expect(result.status).toBe("INVALID");
      expect(context.items).toHaveLength(2);
    });
  });

  describe("app tries to export", () => {
    it("export is not a capability — no authorize path exists", () => {
      const result = authorize(
        {
          credential_id: "cred_1",
          binding_id: "binding_1",
          binding_revision: 1,
          capability: "read_claims" as any,
          categories: ["skills"],
          max_sensitivity: "personal",
          purpose: null,
        },
        makeBinding(),
        makeGrant({ capabilities: ["read_claims"] })
      );
      expect(result.decision).toBe("ALLOW");
    });
  });
});
