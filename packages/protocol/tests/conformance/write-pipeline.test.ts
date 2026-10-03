import { describe, it, expect, beforeEach } from "vitest";
import { ingest, type IngestionContext } from "../../src/reconciliation/write-pipeline.js";
import {
  makeBinding,
  makeGrant,
  makeObservation,
  makeIdGenerator,
  resetIds,
  InMemoryClaimStore,
  InMemoryEvidenceStore,
  InMemoryObservationStore,
} from "../helpers.js";

describe("Write Pipeline (Observation → Evidence → Claim)", () => {
  let stores: {
    claims: InMemoryClaimStore;
    evidence: InMemoryEvidenceStore;
    observations: InMemoryObservationStore;
  };
  let ctx: IngestionContext;
  let ids: ReturnType<typeof makeIdGenerator>;

  beforeEach(() => {
    resetIds();
    stores = {
      claims: new InMemoryClaimStore(),
      evidence: new InMemoryEvidenceStore(),
      observations: new InMemoryObservationStore(),
    };
    ctx = {
      passportId: "passport_1",
      binding: makeBinding(),
      grant: makeGrant(),
      appId: "app_1",
      now: "2024-06-01T12:00:00Z",
    };
    ids = makeIdGenerator();
  });

  it("accepts a valid observation and creates claim + evidence", async () => {
    const obs = makeObservation();
    const result = await ingest(obs, ctx, stores, ids, "public");
    expect(result.status).toBe("accepted");
    if (result.status === "accepted") {
      expect(result.claim.subject).toBe("user");
      expect(result.claim.predicate).toBe("knows");
      expect(result.claim.value).toBe("Python");
      expect(result.claim.state).toBe("OBSERVED");
      expect(result.evidence.source_type).toBe(5);
      expect(result.evidence.first_party).toBe(true);
    }
  });

  describe("idempotency", () => {
    it("rejects duplicate idempotency key", async () => {
      const obs = makeObservation({ idempotency_key: "same_key" });
      await ingest(obs, ctx, stores, ids, "public");

      const result2 = await ingest(
        { ...obs, idempotency_key: "same_key" },
        ctx,
        stores,
        ids,
        "public"
      );
      expect(result2.status).toBe("rejected");
      if (result2.status === "rejected") {
        expect(result2.reason).toContain("idempotency");
      }
    });
  });

  describe("protocol namespace", () => {
    it("rejects observation with protocol.* subject", async () => {
      const obs = makeObservation({ subject: "protocol.binding" });
      const result = await ingest(obs, ctx, stores, ids, "public");
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toContain("protocol namespace");
      }
    });

    it("rejects observation with protocol.* predicate", async () => {
      const obs = makeObservation({ predicate: "protocol.authorized" });
      const result = await ingest(obs, ctx, stores, ids, "public");
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toContain("protocol namespace");
      }
    });
  });

  describe("capability enforcement", () => {
    it("rejects when binding lacks write_claims", async () => {
      ctx.grant = makeGrant({ capabilities: ["read_context"] });
      const obs = makeObservation();
      const result = await ingest(obs, ctx, stores, ids, "public");
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toContain("write_claims");
      }
    });
  });

  describe("category enforcement", () => {
    it("rejects when category not in write policy", async () => {
      const obs = makeObservation({ declared_category: "emotional_patterns" });
      const result = await ingest(obs, ctx, stores, ids, "public");
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toContain("category");
      }
    });
  });

  describe("sensitivity classification", () => {
    it("applies most-restrictive-wins classification", async () => {
      const obs = makeObservation({
        declared_sensitivity: "public",
        declared_category: "goals",
      });
      ctx.grant = makeGrant({
        data_policy: {
          ...makeGrant().data_policy,
          write: {
            ...makeGrant().data_policy.write,
            categories: ["goals"],
            sensitivity_ceiling: "personal",
          },
        },
      });
      const result = await ingest(obs, ctx, stores, ids, "public");
      if (result.status === "accepted") {
        expect(result.claim.sensitivity).toBe("personal");
      }
    });

    it("quarantines when classified as restricted", async () => {
      const obs = makeObservation({ declared_sensitivity: "public" });
      const result = await ingest(obs, ctx, stores, ids, "restricted");
      expect(result.status).toBe("quarantined");
    });

    it("rejects when post-classification exceeds ceiling", async () => {
      const obs = makeObservation({ declared_sensitivity: "sensitive" });
      const result = await ingest(obs, ctx, stores, ids, "public");
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toContain("exceeds ceiling");
      }
    });
  });

  describe("evidence validation", () => {
    it("rejects when raw_context is empty", async () => {
      const obs = makeObservation({ raw_context: "" });
      const result = await ingest(obs, ctx, stores, ids, "public");
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toContain("evidence required");
      }
    });
  });

  describe("deduplication / merge", () => {
    it("merges evidence into existing claim with matching triple", async () => {
      const obs1 = makeObservation({ value: "Python" });
      await ingest(obs1, ctx, stores, ids, "public");

      const obs2 = makeObservation({ value: "Python" });
      const result = await ingest(obs2, ctx, stores, ids, "public");
      expect(result.status).toBe("merged");
      if (result.status === "merged") {
        expect(result.claim.evidence_ids.length).toBe(2);
      }
    });
  });

  describe("semantic limits", () => {
    it("rejects when active claim limit reached", async () => {
      ctx.grant = makeGrant({
        data_policy: {
          ...makeGrant().data_policy,
          write: {
            ...makeGrant().data_policy.write,
            semantic_limits: {
              max_new_claims_per_category_per_day: 50,
              min_interval_same_tuple_hours: 1,
              max_active_claims_per_category: 1,
            },
          },
        },
      });

      await ingest(makeObservation({ value: "Python" }), ctx, stores, ids, "public");

      const obs2 = makeObservation({
        value: "JavaScript",
        subject: "user",
        predicate: "also_knows",
      });
      const result = await ingest(obs2, ctx, stores, ids, "public");
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toContain("active claim limit");
      }
    });
  });
});
