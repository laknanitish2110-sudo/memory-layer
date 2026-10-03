import type {
  Claim,
  ClaimCategory,
  Sensitivity,
} from "../memory/types.js";
import { SENSITIVITY_ORDER } from "../memory/types.js";

export interface ContextItem {
  claim_id: string;
  category: ClaimCategory;
  sensitivity: Sensitivity;
  summary: string;
  confidence_band: "high" | "medium" | "low";
}

export interface ContextModel {
  items: ContextItem[];
  passport_id: string;
  generated_at: string;
  policy_version: string;
}

export type OutputValidationResult =
  | { status: "VALID" }
  | { status: "INVALID"; violation: string };

export function synthesize(authorizedClaims: Claim[]): ContextItem[] {
  return authorizedClaims
    .filter((c) => !c.deleted && c.state !== "EXPIRED")
    .map((c) => ({
      claim_id: c.id,
      category: c.category,
      sensitivity: c.sensitivity,
      summary: `${c.subject} ${c.predicate} ${c.value}`,
      confidence_band: stateToConfidence(c.state),
    }));
}

export function validateOutput(
  context: ContextModel,
  authorizedCategories: ClaimCategory[],
  sensitivityCeiling: Sensitivity
): OutputValidationResult {
  const catSet = new Set(authorizedCategories);
  const ceilingOrder = SENSITIVITY_ORDER[sensitivityCeiling];

  for (const item of context.items) {
    if (!catSet.has(item.category)) {
      return {
        status: "INVALID",
        violation: `category '${item.category}' not authorized`,
      };
    }
    if (SENSITIVITY_ORDER[item.sensitivity] > ceilingOrder) {
      return {
        status: "INVALID",
        violation: `sensitivity '${item.sensitivity}' exceeds ceiling '${sensitivityCeiling}'`,
      };
    }
  }

  return { status: "VALID" };
}

function stateToConfidence(
  state: Claim["state"]
): "high" | "medium" | "low" {
  switch (state) {
    case "DECLARED":
    case "SUPPORTED":
      return "high";
    case "OBSERVED":
      return "medium";
    case "CONTESTED":
    case "UNKNOWN":
    case "STALE":
    case "UNSUPPORTED":
    case "EXPIRED":
      return "low";
  }
}
