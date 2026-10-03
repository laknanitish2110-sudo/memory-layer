import { describe, it, expect } from "vitest";
import {
  computeGrantDelta,
  isExpansion,
  isExpirationExpansion,
} from "../../src/authorization/expansion.js";
import { makeGrant, makeDataPolicy } from "../helpers.js";

describe("isExpansion()", () => {
  describe("duration changes", () => {
    it("90d → 30d = REDUCTION", () => {
      expect(
        isExpirationExpansion(
          { type: "periodic", interval_days: 90 },
          { type: "periodic", interval_days: 30 }
        )
      ).toBe(false);
    });

    it("90d → until_revoked = EXPANSION", () => {
      expect(
        isExpirationExpansion(
          { type: "periodic", interval_days: 90 },
          { type: "until_revoked" }
        )
      ).toBe(true);
    });

    it("one_time → periodic = EXPANSION", () => {
      expect(
        isExpirationExpansion(
          { type: "one_time" },
          { type: "periodic", interval_days: 30 }
        )
      ).toBe(true);
    });

    it("periodic → one_time = REDUCTION", () => {
      expect(
        isExpirationExpansion(
          { type: "periodic", interval_days: 30 },
          { type: "one_time" }
        )
      ).toBe(false);
    });

    it("until_revoked → periodic = REDUCTION", () => {
      expect(
        isExpirationExpansion(
          { type: "until_revoked" },
          { type: "periodic", interval_days: 90 }
        )
      ).toBe(false);
    });

    it("30d → 90d within periodic = EXPANSION (longer = more permissive)", () => {
      expect(
        isExpirationExpansion(
          { type: "periodic", interval_days: 30 },
          { type: "periodic", interval_days: 90 }
        )
      ).toBe(true);
    });
  });

  describe("sensitivity changes", () => {
    it("personal → sensitive = EXPANSION", () => {
      const prev = makeGrant();
      const next = makeGrant({
        data_policy: {
          ...makeDataPolicy(),
          read: {
            categories: ["skills", "preferences", "projects"],
            sensitivity_ceiling: "sensitive",
          },
        },
      });
      const delta = computeGrantDelta(prev, next);
      expect(isExpansion(delta)).toBe(true);
    });

    it("sensitive → personal = REDUCTION", () => {
      const prev = makeGrant({
        data_policy: {
          ...makeDataPolicy(),
          read: {
            categories: ["skills", "preferences", "projects"],
            sensitivity_ceiling: "sensitive",
          },
        },
      });
      const next = makeGrant();
      const delta = computeGrantDelta(prev, next);
      expect(isExpansion(delta)).toBe(false);
    });
  });

  describe("capability changes", () => {
    it("adding read_evidence = EXPANSION", () => {
      const prev = makeGrant({ capabilities: ["read_context", "read_claims"] });
      const next = makeGrant({
        capabilities: ["read_context", "read_claims", "read_evidence"],
      });
      const delta = computeGrantDelta(prev, next);
      expect(isExpansion(delta)).toBe(true);
      expect(delta.added_capabilities).toEqual(["read_evidence"]);
    });

    it("removing a capability = REDUCTION", () => {
      const prev = makeGrant({
        capabilities: ["read_context", "read_claims", "write_claims"],
      });
      const next = makeGrant({ capabilities: ["read_context", "read_claims"] });
      const delta = computeGrantDelta(prev, next);
      expect(isExpansion(delta)).toBe(false);
      expect(delta.removed_capabilities).toEqual(["write_claims"]);
    });
  });

  describe("category changes", () => {
    it("skills → skills + projects (read) = EXPANSION", () => {
      const prev = makeGrant({
        data_policy: {
          ...makeDataPolicy(),
          read: { categories: ["skills"], sensitivity_ceiling: "personal" },
        },
      });
      const next = makeGrant({
        data_policy: {
          ...makeDataPolicy(),
          read: {
            categories: ["skills", "projects"],
            sensitivity_ceiling: "personal",
          },
        },
      });
      const delta = computeGrantDelta(prev, next);
      expect(isExpansion(delta)).toBe(true);
      expect(delta.added_read_categories).toEqual(["projects"]);
    });

    it("write skills → write skills + goals = EXPANSION", () => {
      const prev = makeGrant({
        data_policy: {
          ...makeDataPolicy(),
          write: {
            ...makeDataPolicy().write,
            categories: ["skills"],
          },
        },
      });
      const next = makeGrant({
        data_policy: {
          ...makeDataPolicy(),
          write: {
            ...makeDataPolicy().write,
            categories: ["skills", "goals"],
          },
        },
      });
      const delta = computeGrantDelta(prev, next);
      expect(isExpansion(delta)).toBe(true);
      expect(delta.added_write_categories).toEqual(["goals"]);
    });
  });

  describe("purpose changes", () => {
    it("adding a new purpose = EXPANSION", () => {
      const prev = makeGrant({ authorized_purposes: ["coding_assistance"] });
      const next = makeGrant({
        authorized_purposes: ["coding_assistance", "tutoring"],
      });
      const delta = computeGrantDelta(prev, next);
      expect(isExpansion(delta)).toBe(true);
      expect(delta.added_purposes).toEqual(["tutoring"]);
    });

    it("removing a purpose = REDUCTION", () => {
      const prev = makeGrant({
        authorized_purposes: ["coding_assistance", "tutoring"],
      });
      const next = makeGrant({ authorized_purposes: ["coding_assistance"] });
      const delta = computeGrantDelta(prev, next);
      expect(isExpansion(delta)).toBe(false);
    });
  });

  describe("no-change", () => {
    it("identical grants = no expansion", () => {
      const grant = makeGrant();
      const delta = computeGrantDelta(grant, grant);
      expect(isExpansion(delta)).toBe(false);
      expect(delta.added_capabilities).toEqual([]);
      expect(delta.removed_capabilities).toEqual([]);
    });
  });

  describe("multi-dimension changes", () => {
    it("reduction in one dimension + expansion in another = EXPANSION", () => {
      const prev = makeGrant({
        capabilities: ["read_context", "read_claims", "write_claims"],
        data_policy: {
          ...makeDataPolicy(),
          read: { categories: ["skills"], sensitivity_ceiling: "personal" },
        },
      });
      const next = makeGrant({
        capabilities: ["read_context", "read_claims"],
        data_policy: {
          ...makeDataPolicy(),
          read: {
            categories: ["skills", "goals"],
            sensitivity_ceiling: "personal",
          },
        },
      });
      const delta = computeGrantDelta(prev, next);
      expect(isExpansion(delta)).toBe(true);
    });
  });
});
