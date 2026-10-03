import {
  type Sensitivity,
  type ClaimCategory,
  SENSITIVITY_ORDER,
  CATEGORY_SENSITIVITY_FLOORS,
} from "../memory/types.js";

export function compareSensitivity(a: Sensitivity, b: Sensitivity): number {
  return SENSITIVITY_ORDER[a] - SENSITIVITY_ORDER[b];
}

export function isHigherSensitivity(a: Sensitivity, b: Sensitivity): boolean {
  return SENSITIVITY_ORDER[a] > SENSITIVITY_ORDER[b];
}

export function isWithinCeiling(
  sensitivity: Sensitivity,
  ceiling: Sensitivity
): boolean {
  return SENSITIVITY_ORDER[sensitivity] <= SENSITIVITY_ORDER[ceiling];
}

export function mostRestrictive(...levels: Sensitivity[]): Sensitivity {
  let highest: Sensitivity = "public";
  for (const level of levels) {
    if (SENSITIVITY_ORDER[level] > SENSITIVITY_ORDER[highest]) {
      highest = level;
    }
  }
  return highest;
}

export function classifySensitivity(
  appDeclared: Sensitivity,
  systemClassified: Sensitivity,
  category: ClaimCategory
): Sensitivity {
  const categoryFloor = CATEGORY_SENSITIVITY_FLOORS[category];
  return mostRestrictive(appDeclared, systemClassified, categoryFloor);
}

export function getDefaultSharingPolicy(
  sensitivity: Sensitivity
): { type: "grant_controlled" } | { type: "explicit_only"; approved_binding_ids: string[] } {
  if (sensitivity === "restricted") {
    return { type: "explicit_only", approved_binding_ids: [] };
  }
  return { type: "grant_controlled" };
}
