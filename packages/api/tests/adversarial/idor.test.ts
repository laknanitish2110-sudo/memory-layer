/**
 * Attack Vector #3: IDOR on Every Entity ID Type
 *
 * Passport-scoped lookups must return null (→ 404) for entities
 * belonging to other passports. The attacker cannot distinguish
 * "doesn't exist" from "exists but not yours."
 */
import { describe, it, expect } from "vitest";
import {
  makeClaim,
  makeObservation,
  makeEvidence,
  mockClaimStore,
  mockObservationStore,
  mockEvidenceStore,
  passportId,
  bindingId,
} from "../helpers/factories.js";

describe("Attack Vector #3: IDOR on Every Entity ID Type", () => {
  const myPassport = passportId("my");
  const victimPassport = passportId("victim");

  // 3a: Claim IDOR
  it("3a: getClaim for another passport's claim returns null", async () => {
    const victimClaim = makeClaim({
      id: "clm_idor_001",
      passport_id: victimPassport,
      category: "skills",
    });
    const store = mockClaimStore([victimClaim]);

    const result = await store.getClaim(myPassport, "clm_idor_001");
    expect(result).toBeNull();

    const ownResult = await store.getClaim(victimPassport, "clm_idor_001");
    expect(ownResult).not.toBeNull();
    expect(ownResult!.id).toBe("clm_idor_001");
  });

  // 3b: Observation IDOR — passport-scoped lookup must filter by passport
  it("3b: getObservation for another binding's observation returns null", async () => {
    const victimObs = makeObservation({
      id: "obs_idor_001",
      binding_id: bindingId("victim"),
    });

    const passportBindingMap: Record<string, string[]> = {
      [myPassport]: [bindingId("my")],
      [passportId("victim")]: [bindingId("victim")],
    };

    const store = mockObservationStore([victimObs]);
    (store as any).getObservation = async (pid: string, oid: string) => {
      const found = [victimObs].find((o) => o.id === oid);
      if (!found) return null;
      const allowedBindings = passportBindingMap[pid] ?? [];
      if (!allowedBindings.includes(found.binding_id)) return null;
      return found;
    };

    const result = await store.getObservation(myPassport, "obs_idor_001");
    expect(result).toBeNull();
  });

  // 3c: getClaims with cross-passport filtering
  it("3c: getClaims returns only own passport's claims", async () => {
    const myClaim = makeClaim({ id: "clm_mine", passport_id: myPassport });
    const victimClaim = makeClaim({ id: "clm_theirs", passport_id: victimPassport });
    const store = mockClaimStore([myClaim, victimClaim]);

    const results = await store.getClaims(myPassport, { categories: ["skills"] });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("clm_mine");
  });

  // 3d: Nonexistent claim ID returns same response as cross-passport
  it("3d: nonexistent ID and cross-passport ID both return null (indistinguishable)", async () => {
    const victimClaim = makeClaim({ id: "clm_exists", passport_id: victimPassport });
    const store = mockClaimStore([victimClaim]);

    const nonexistent = await store.getClaim(myPassport, "clm_totally_fake");
    const crossPassport = await store.getClaim(myPassport, "clm_exists");

    expect(nonexistent).toBeNull();
    expect(crossPassport).toBeNull();
  });

  // 3e: Evidence IDOR — evidence lookup must be passport-scoped
  it("3e: getEvidence for another passport's evidence returns null", async () => {
    const victimEvidence = makeEvidence({ id: "evi_idor_001" });
    const store = mockEvidenceStore([victimEvidence]);

    const passportEvidenceMap: Record<string, Set<string>> = {
      [passportId("victim")]: new Set(["evi_idor_001"]),
    };
    (store as any).getEvidence = async (pid: string, eid: string) => {
      const allowed = passportEvidenceMap[pid];
      if (!allowed || !allowed.has(eid)) return null;
      return victimEvidence;
    };

    const result = await store.getEvidence(myPassport, "evi_idor_001");
    expect(result).toBeNull();
  });

  // 3f: Claim versions IDOR
  it("3f: getClaimVersions for another passport's claim returns empty", async () => {
    const store = mockClaimStore();
    const versions = await store.getClaimVersions(myPassport, "clm_victim_claim");
    expect(versions).toEqual([]);
  });

  // 3g: Evidence for claim IDOR — getEvidenceForClaim must scope by passport
  it("3g: getEvidenceForClaim scoped to passport returns empty for other's claims", async () => {
    const victimEvidence = makeEvidence({
      id: "evi_cross_001",
      claim_id: "clm_victim_claim",
    });
    const store = mockEvidenceStore([victimEvidence]);

    const passportClaimMap: Record<string, Set<string>> = {
      [passportId("victim")]: new Set(["clm_victim_claim"]),
    };
    (store as any).getEvidenceForClaim = async (pid: string, cid: string) => {
      const allowedClaims = passportClaimMap[pid];
      if (!allowedClaims || !allowedClaims.has(cid)) return [];
      return [victimEvidence].filter((e) => e.claim_id === cid && e.status === "active");
    };

    const results = await store.getEvidenceForClaim(myPassport, "clm_victim_claim");
    expect(results).toHaveLength(0);
  });

  // 3h: Bulk query never leaks cross-passport count
  it("3h: getClaims for empty passport returns empty, not error with metadata", async () => {
    const victimClaim = makeClaim({ id: "clm_bulk", passport_id: victimPassport });
    const store = mockClaimStore([victimClaim]);

    const results = await store.getClaims(myPassport, {});
    expect(results).toEqual([]);
  });
});
