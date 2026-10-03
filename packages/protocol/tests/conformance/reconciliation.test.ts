import { describe, it, expect } from "vitest";
import { reconcile, countIndependentLineages } from "../../src/reconciliation/state-machine.js";
import { makeClaim, makeEvidence } from "../helpers.js";

describe("Reconciliation State Machine", () => {
  describe("no evidence", () => {
    it("→ UNSUPPORTED when no declared_state", () => {
      const result = reconcile({
        claim: makeClaim({ declared_state: null }),
        activeEvidence: [],
      });
      expect(result.newState).toBe("UNSUPPORTED");
      expect(result.observedState).toBe("UNSUPPORTED");
    });

    it("preserves declared_state when evidence is gone", () => {
      const result = reconcile({
        claim: makeClaim({ declared_state: "DECLARED" }),
        activeEvidence: [],
      });
      expect(result.newState).toBe("DECLARED");
      expect(result.observedState).toBe("UNSUPPORTED");
    });
  });

  describe("single observation", () => {
    it("single app observation → OBSERVED", () => {
      const result = reconcile({
        claim: makeClaim(),
        activeEvidence: [makeEvidence({ source_type: 4 })],
      });
      expect(result.observedState).toBe("OBSERVED");
    });
  });

  describe("user evidence", () => {
    it("tier 1 (user correction) → DECLARED", () => {
      const result = reconcile({
        claim: makeClaim(),
        activeEvidence: [makeEvidence({ source_type: 1 })],
      });
      expect(result.observedState).toBe("DECLARED");
    });

    it("tier 2 (user statement) → DECLARED", () => {
      const result = reconcile({
        claim: makeClaim(),
        activeEvidence: [makeEvidence({ source_type: 2 })],
      });
      expect(result.observedState).toBe("DECLARED");
    });
  });

  describe("multi-app consensus", () => {
    it("3+ independent lineages → SUPPORTED", () => {
      const evidence = [
        makeEvidence({
          id: "e1",
          source_type: 4,
          lineage: { origin_app_id: "app_1", origin_experience_id: "", chain: ["app_1"] },
        }),
        makeEvidence({
          id: "e2",
          source_type: 4,
          lineage: { origin_app_id: "app_2", origin_experience_id: "", chain: ["app_2"] },
        }),
        makeEvidence({
          id: "e3",
          source_type: 4,
          lineage: { origin_app_id: "app_3", origin_experience_id: "", chain: ["app_3"] },
        }),
      ];
      const result = reconcile({
        claim: makeClaim(),
        activeEvidence: evidence,
      });
      expect(result.observedState).toBe("SUPPORTED");
    });

    it("3 from same app (same lineage) → OBSERVED, not SUPPORTED", () => {
      const evidence = [
        makeEvidence({
          id: "e1",
          source_type: 4,
          lineage: { origin_app_id: "app_1", origin_experience_id: "", chain: ["app_1"] },
        }),
        makeEvidence({
          id: "e2",
          source_type: 4,
          lineage: { origin_app_id: "app_1", origin_experience_id: "", chain: ["app_1"] },
        }),
        makeEvidence({
          id: "e3",
          source_type: 4,
          lineage: { origin_app_id: "app_1", origin_experience_id: "", chain: ["app_1"] },
        }),
      ];
      const result = reconcile({
        claim: makeClaim(),
        activeEvidence: evidence,
      });
      expect(result.observedState).toBe("OBSERVED");
    });
  });

  describe("evidence lineage counting", () => {
    it("counts unique origin_app_id as independent", () => {
      const evidence = [
        makeEvidence({
          id: "e1",
          lineage: { origin_app_id: "app_1", origin_experience_id: "", chain: ["app_1"] },
        }),
        makeEvidence({
          id: "e2",
          lineage: { origin_app_id: "app_2", origin_experience_id: "", chain: ["app_2"] },
        }),
      ];
      expect(countIndependentLineages(evidence)).toBe(2);
    });

    it("deduplicates same origin", () => {
      const evidence = [
        makeEvidence({
          id: "e1",
          lineage: { origin_app_id: "app_1", origin_experience_id: "", chain: ["app_1"] },
        }),
        makeEvidence({
          id: "e2",
          lineage: { origin_app_id: "app_1", origin_experience_id: "", chain: ["app_1", "app_2"] },
        }),
      ];
      expect(countIndependentLineages(evidence)).toBe(1);
    });

    it("excludes retracted evidence", () => {
      const evidence = [
        makeEvidence({
          id: "e1",
          status: "active",
          lineage: { origin_app_id: "app_1", origin_experience_id: "", chain: ["app_1"] },
        }),
        makeEvidence({
          id: "e2",
          status: "retracted",
          lineage: { origin_app_id: "app_2", origin_experience_id: "", chain: ["app_2"] },
        }),
      ];
      expect(countIndependentLineages(evidence)).toBe(1);
    });
  });

  describe("contradiction resolution", () => {
    it("tier 1 wins over tier 4", () => {
      const evidence = [
        makeEvidence({
          id: "e1",
          source_type: 1,
          raw_observation: "Python",
        }),
        makeEvidence({
          id: "e2",
          source_type: 4,
          raw_observation: "JavaScript",
        }),
      ];
      const result = reconcile({
        claim: makeClaim(),
        activeEvidence: evidence,
      });
      expect(result.observedState).toBe("DECLARED");
      expect(result.reason).toContain("tier 1");
    });

    it("tier 2 beats tier 4", () => {
      const evidence = [
        makeEvidence({
          id: "e1",
          source_type: 2,
          raw_observation: "Python",
        }),
        makeEvidence({
          id: "e2",
          source_type: 4,
          raw_observation: "JavaScript",
        }),
      ];
      const result = reconcile({
        claim: makeClaim(),
        activeEvidence: evidence,
      });
      expect(result.observedState).toBe("DECLARED");
    });

    it("unresolvable contradiction → CONTESTED", () => {
      const evidence = [
        makeEvidence({
          id: "e1",
          source_type: 4,
          raw_observation: "Python",
          observed_at: "2024-01-01T00:00:00Z",
          lineage: { origin_app_id: "app_1", origin_experience_id: "", chain: ["app_1"] },
        }),
        makeEvidence({
          id: "e2",
          source_type: 4,
          raw_observation: "JavaScript",
          observed_at: "2024-01-01T00:00:00Z",
          lineage: { origin_app_id: "app_2", origin_experience_id: "", chain: ["app_2"] },
        }),
      ];
      const result = reconcile({
        claim: makeClaim(),
        activeEvidence: evidence,
      });
      expect(result.observedState).toBe("CONTESTED");
    });
  });

  describe("retraction → reconciliation", () => {
    it("retract sole evidence → UNSUPPORTED", () => {
      const result = reconcile({
        claim: makeClaim(),
        activeEvidence: [],
      });
      expect(result.observedState).toBe("UNSUPPORTED");
    });

    it("retract one of two → surviving evidence determines state", () => {
      const result = reconcile({
        claim: makeClaim(),
        activeEvidence: [makeEvidence({ source_type: 4 })],
      });
      expect(result.observedState).toBe("OBSERVED");
    });

    it("user evidence survives app retraction", () => {
      const result = reconcile({
        claim: makeClaim(),
        activeEvidence: [makeEvidence({ source_type: 1 })],
      });
      expect(result.observedState).toBe("DECLARED");
    });
  });
});
