import type {
  Claim,
  ClaimState,
  Evidence,
  EvidenceTier,
} from "../memory/types.js";

export interface ReconciliationInput {
  claim: Claim;
  activeEvidence: Evidence[];
}

export interface ReconciliationResult {
  newState: ClaimState;
  observedState: ClaimState;
  reason: string;
}

export function reconcile(input: ReconciliationInput): ReconciliationResult {
  const { claim, activeEvidence } = input;

  if (activeEvidence.length === 0) {
    return {
      newState: claim.declared_state ?? "UNSUPPORTED",
      observedState: "UNSUPPORTED",
      reason: "no active evidence",
    };
  }

  const highestTier = getHighestEvidenceTier(activeEvidence);
  const hasContradiction = hasContradictingEvidence(activeEvidence);

  if (hasContradiction) {
    const resolved = resolveContradiction(activeEvidence);
    if (resolved) {
      return {
        newState: claim.declared_state ?? resolved.state,
        observedState: resolved.state,
        reason: resolved.reason,
      };
    }
    return {
      newState: claim.declared_state ?? "CONTESTED",
      observedState: "CONTESTED",
      reason: "conflicting evidence, no resolution",
    };
  }

  if (highestTier <= 2) {
    const state: ClaimState = highestTier === 1 ? "DECLARED" : "DECLARED";
    return {
      newState: state,
      observedState: state,
      reason: `user evidence (tier ${highestTier})`,
    };
  }

  const independentLineages = countIndependentLineages(activeEvidence);

  if (independentLineages >= 3) {
    return {
      newState: claim.declared_state ?? "SUPPORTED",
      observedState: "SUPPORTED",
      reason: `multi-app consensus (${independentLineages} independent lineages)`,
    };
  }

  if (activeEvidence.length > 1) {
    return {
      newState: claim.declared_state ?? "OBSERVED",
      observedState: "OBSERVED",
      reason: `${activeEvidence.length} evidence records from dependent sources`,
    };
  }

  return {
    newState: claim.declared_state ?? "OBSERVED",
    observedState: "OBSERVED",
    reason: "single observation",
  };
}

function getHighestEvidenceTier(evidence: Evidence[]): EvidenceTier {
  let best: EvidenceTier = 5;
  for (const e of evidence) {
    if (e.source_type < best) best = e.source_type;
  }
  return best;
}

function hasContradictingEvidence(evidence: Evidence[]): boolean {
  const tuples = new Map<string, Set<string>>();
  for (const e of evidence) {
    if (e.status !== "active") continue;
    const key = tupleKey(e);
    if (!tuples.has(key)) tuples.set(key, new Set());
    tuples.get(key)!.add(extractValue(e));
  }
  for (const values of tuples.values()) {
    if (values.size > 1) return true;
  }
  return false;
}

interface ResolutionOutcome {
  state: ClaimState;
  reason: string;
}

function resolveContradiction(evidence: Evidence[]): ResolutionOutcome | null {
  const byTier = groupByTier(evidence);

  if (byTier.has(1)) {
    return { state: "DECLARED", reason: "tier 1 (user correction) wins" };
  }

  if (byTier.has(2)) {
    const tier2Values = uniqueValues(byTier.get(2)!);
    if (tier2Values.size === 1) {
      const hasLowerOnly = [...byTier.keys()].every(
        (t) => t === 2 || t > 2
      );
      if (hasLowerOnly) {
        return {
          state: "DECLARED",
          reason: "tier 2 (user statement) beats app assertions",
        };
      }
    }
  }

  const tier3Plus = evidence.filter(
    (e) => e.source_type >= 3 && e.status === "active"
  );
  if (tier3Plus.length > 0) {
    const independentLineages = countIndependentLineages(tier3Plus);
    if (independentLineages >= 3) {
      const consensusValue = getMajorityValue(tier3Plus);
      if (consensusValue) {
        return {
          state: "SUPPORTED",
          reason: "multi-app consensus resolves contradiction",
        };
      }
    }
  }

  const allActive = evidence.filter((e) => e.status === "active");
  const sameTier = allActive.every(
    (e) => e.source_type === allActive[0]!.source_type
  );
  if (sameTier && allActive.length >= 2) {
    const sorted = [...allActive].sort(
      (a, b) =>
        new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime()
    );
    const latest = sorted[0]!;
    const secondLatest = sorted[1]!;
    if (latest.observed_at !== secondLatest.observed_at) {
      return {
        state: "OBSERVED",
        reason: `recency within tier ${latest.source_type}`,
      };
    }
  }

  return null;
}

function groupByTier(evidence: Evidence[]): Map<EvidenceTier, Evidence[]> {
  const map = new Map<EvidenceTier, Evidence[]>();
  for (const e of evidence) {
    if (e.status !== "active") continue;
    if (!map.has(e.source_type)) map.set(e.source_type, []);
    map.get(e.source_type)!.push(e);
  }
  return map;
}

function uniqueValues(evidence: Evidence[]): Set<string> {
  return new Set(evidence.map(extractValue));
}

function getMajorityValue(evidence: Evidence[]): string | null {
  const counts = new Map<string, number>();
  for (const e of evidence) {
    const v = extractValue(e);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let maxCount = 0;
  let maxValue: string | null = null;
  for (const [v, c] of counts) {
    if (c > maxCount) {
      maxCount = c;
      maxValue = v;
    }
  }
  return maxValue;
}

export function countIndependentLineages(evidence: Evidence[]): number {
  const origins = new Set<string>();
  for (const e of evidence) {
    if (e.status === "active") {
      origins.add(e.lineage.origin_app_id);
    }
  }
  return origins.size;
}

function tupleKey(e: Evidence): string {
  return `${e.claim_id}`;
}

function extractValue(e: Evidence): string {
  return e.raw_observation;
}
