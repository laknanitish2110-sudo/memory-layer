import { describe, it, expect } from "vitest";
import {
  classifySensitivity,
  compareSensitivity,
  isHigherSensitivity,
  isWithinCeiling,
  mostRestrictive,
  getDefaultSharingPolicy,
} from "../../src/authorization/sensitivity.js";

describe("Sensitivity Policy", () => {
  describe("ordering", () => {
    it("public < personal < sensitive < restricted", () => {
      expect(compareSensitivity("public", "personal")).toBeLessThan(0);
      expect(compareSensitivity("personal", "sensitive")).toBeLessThan(0);
      expect(compareSensitivity("sensitive", "restricted")).toBeLessThan(0);
    });

    it("isHigherSensitivity", () => {
      expect(isHigherSensitivity("sensitive", "personal")).toBe(true);
      expect(isHigherSensitivity("personal", "sensitive")).toBe(false);
      expect(isHigherSensitivity("public", "public")).toBe(false);
    });
  });

  describe("ceiling check", () => {
    it("public within personal ceiling", () => {
      expect(isWithinCeiling("public", "personal")).toBe(true);
    });

    it("sensitive NOT within personal ceiling", () => {
      expect(isWithinCeiling("sensitive", "personal")).toBe(false);
    });

    it("same level = within ceiling", () => {
      expect(isWithinCeiling("personal", "personal")).toBe(true);
    });
  });

  describe("most-restrictive-wins classification", () => {
    it("takes highest of 3 inputs", () => {
      expect(classifySensitivity("public", "public", "skills")).toBe("public");
      expect(classifySensitivity("public", "public", "goals")).toBe("personal");
      expect(classifySensitivity("public", "sensitive", "skills")).toBe("sensitive");
      expect(classifySensitivity("sensitive", "public", "skills")).toBe("sensitive");
    });

    it("category floor for emotional_patterns = sensitive", () => {
      expect(classifySensitivity("public", "public", "emotional_patterns")).toBe("sensitive");
    });

    it("app declared > floor still wins if app is higher", () => {
      expect(classifySensitivity("restricted", "public", "skills")).toBe("restricted");
    });
  });

  describe("default sharing policy", () => {
    it("restricted → explicit_only", () => {
      const policy = getDefaultSharingPolicy("restricted");
      expect(policy.type).toBe("explicit_only");
    });

    it("personal → grant_controlled", () => {
      const policy = getDefaultSharingPolicy("personal");
      expect(policy.type).toBe("grant_controlled");
    });

    it("public → grant_controlled", () => {
      const policy = getDefaultSharingPolicy("public");
      expect(policy.type).toBe("grant_controlled");
    });

    it("sensitive → grant_controlled", () => {
      const policy = getDefaultSharingPolicy("sensitive");
      expect(policy.type).toBe("grant_controlled");
    });
  });
});
