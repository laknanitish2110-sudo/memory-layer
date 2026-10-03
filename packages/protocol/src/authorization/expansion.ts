import { SENSITIVITY_ORDER, type Sensitivity } from "../memory/types.js";
import type {
  BindingGrant,
  DataPolicy,
  ExpirationRule,
  GrantDelta,
} from "./types.js";

export function computeGrantDelta(
  previous: BindingGrant,
  next: BindingGrant
): GrantDelta {
  const prevCaps = new Set(previous.capabilities);
  const nextCaps = new Set(next.capabilities);

  const prevReadCats = new Set(previous.data_policy.read.categories);
  const nextReadCats = new Set(next.data_policy.read.categories);

  const prevWriteCats = new Set(previous.data_policy.write.categories);
  const nextWriteCats = new Set(next.data_policy.write.categories);

  const prevPurposes = new Set(previous.authorized_purposes);
  const nextPurposes = new Set(next.authorized_purposes);

  const readSensChange = sensitivityChange(
    previous.data_policy.read.sensitivity_ceiling,
    next.data_policy.read.sensitivity_ceiling
  );

  const writeSensChange = sensitivityChange(
    previous.data_policy.write.sensitivity_ceiling,
    next.data_policy.write.sensitivity_ceiling
  );

  return {
    added_capabilities: [...nextCaps].filter((c) => !prevCaps.has(c)),
    removed_capabilities: [...prevCaps].filter((c) => !nextCaps.has(c)),
    added_read_categories: [...nextReadCats].filter(
      (c) => !prevReadCats.has(c)
    ),
    removed_read_categories: [...prevReadCats].filter(
      (c) => !nextReadCats.has(c)
    ),
    added_write_categories: [...nextWriteCats].filter(
      (c) => !prevWriteCats.has(c)
    ),
    removed_write_categories: [...prevWriteCats].filter(
      (c) => !nextWriteCats.has(c)
    ),
    read_sensitivity_change: readSensChange,
    write_sensitivity_change: writeSensChange,
    added_purposes: [...nextPurposes].filter((p) => !prevPurposes.has(p)),
    removed_purposes: [...prevPurposes].filter((p) => !nextPurposes.has(p)),
    expiration_changes: null,
    restricted_approval_changes: null,
  };
}

export function isExpansion(delta: GrantDelta): boolean {
  if (delta.added_capabilities.length > 0) return true;
  if (delta.added_read_categories.length > 0) return true;
  if (delta.added_write_categories.length > 0) return true;
  if (delta.added_purposes.length > 0) return true;

  if (
    delta.read_sensitivity_change &&
    isSensitivityEscalation(
      delta.read_sensitivity_change.from,
      delta.read_sensitivity_change.to
    )
  ) {
    return true;
  }

  if (
    delta.write_sensitivity_change &&
    isSensitivityEscalation(
      delta.write_sensitivity_change.from,
      delta.write_sensitivity_change.to
    )
  ) {
    return true;
  }

  if (delta.expiration_changes) {
    for (const change of delta.expiration_changes) {
      if (isExpirationExpansion(change.from, change.to)) return true;
    }
  }

  if (
    delta.restricted_approval_changes &&
    delta.restricted_approval_changes.length > 0
  ) {
    return true;
  }

  return false;
}

function sensitivityChange(
  from: Sensitivity,
  to: Sensitivity
): { from: Sensitivity; to: Sensitivity } | null {
  if (from === to) return null;
  return { from, to };
}

function isSensitivityEscalation(from: Sensitivity, to: Sensitivity): boolean {
  return SENSITIVITY_ORDER[to] > SENSITIVITY_ORDER[from];
}

export function isExpirationExpansion(
  from: ExpirationRule,
  to: ExpirationRule
): boolean {
  const rank = expirationPermissiveness(to) - expirationPermissiveness(from);
  if (rank > 0) return true;
  if (rank === 0 && from.type === "periodic" && to.type === "periodic") {
    return to.interval_days > from.interval_days;
  }
  return false;
}

function expirationPermissiveness(rule: ExpirationRule): number {
  switch (rule.type) {
    case "one_time":
      return 0;
    case "periodic":
      return 1;
    case "until_revoked":
      return 2;
  }
}
