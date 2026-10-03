import { SENSITIVITY_ORDER, type Capability, type ClaimCategory, type Sensitivity } from "../memory/types.js";
import type { BindingGrant, PurposeTemplate } from "./types.js";

export const PURPOSE_TEMPLATES: Record<string, PurposeTemplate> = {
  coding_assistance: {
    id: "purpose_coding",
    name: "coding_assistance",
    description: "Code editing, debugging, project understanding",
    max_capabilities: ["read_context", "read_claims", "write_claims", "write_experiences", "read_experiences", "retract_own_observation", "update_own_claims", "request_elevation"],
    max_read_categories: ["skills", "projects", "preferences"],
    max_write_categories: ["skills"],
    max_sensitivity: "personal",
  },
  tutoring: {
    id: "purpose_tutoring",
    name: "tutoring",
    description: "Educational tutoring and skill development",
    max_capabilities: ["read_context", "read_claims", "write_claims", "write_experiences", "read_experiences", "retract_own_observation", "update_own_claims", "request_elevation"],
    max_read_categories: ["skills", "goals", "preferences", "behavioral_patterns"],
    max_write_categories: ["skills", "goals"],
    max_sensitivity: "personal",
  },
  health_monitoring: {
    id: "purpose_health",
    name: "health_monitoring",
    description: "Health and wellness tracking",
    max_capabilities: ["read_context", "read_claims", "write_claims", "write_experiences", "read_experiences", "retract_own_observation", "update_own_claims", "request_elevation"],
    max_read_categories: ["behavioral_patterns", "personal_context"],
    max_write_categories: ["behavioral_patterns"],
    max_sensitivity: "sensitive",
  },
  journaling: {
    id: "purpose_journaling",
    name: "journaling",
    description: "Personal journaling and reflection",
    max_capabilities: ["read_context", "write_claims", "write_experiences", "read_experiences", "retract_own_observation", "update_own_claims", "request_elevation"],
    max_read_categories: ["emotional_patterns", "goals", "preferences"],
    max_write_categories: ["emotional_patterns", "goals"],
    max_sensitivity: "sensitive",
  },
  general_assistant: {
    id: "purpose_general",
    name: "general_assistant",
    description: "General-purpose AI assistance",
    max_capabilities: ["read_context", "write_claims", "write_experiences", "read_experiences", "retract_own_observation", "update_own_claims", "request_elevation"],
    max_read_categories: ["skills", "preferences", "projects"],
    max_write_categories: ["preferences"],
    max_sensitivity: "personal",
  },
};

export function isGrantWithinPurpose(
  grant: BindingGrant,
  templates: PurposeTemplate[]
): boolean {
  if (templates.length === 0) return false;

  const unionCaps = new Set<Capability>();
  const unionReadCats = new Set<ClaimCategory>();
  const unionWriteCats = new Set<ClaimCategory>();
  let maxSens: Sensitivity = "public";

  for (const t of templates) {
    for (const c of t.max_capabilities) unionCaps.add(c);
    for (const c of t.max_read_categories) unionReadCats.add(c);
    for (const c of t.max_write_categories) unionWriteCats.add(c);
    if (SENSITIVITY_ORDER[t.max_sensitivity] > SENSITIVITY_ORDER[maxSens]) {
      maxSens = t.max_sensitivity;
    }
  }

  for (const cap of grant.capabilities) {
    if (!unionCaps.has(cap)) return false;
  }
  for (const cat of grant.data_policy.read.categories) {
    if (!unionReadCats.has(cat)) return false;
  }
  for (const cat of grant.data_policy.write.categories) {
    if (!unionWriteCats.has(cat)) return false;
  }
  if (
    SENSITIVITY_ORDER[grant.data_policy.read.sensitivity_ceiling] >
    SENSITIVITY_ORDER[maxSens]
  ) {
    return false;
  }
  if (
    SENSITIVITY_ORDER[grant.data_policy.write.sensitivity_ceiling] >
    SENSITIVITY_ORDER[maxSens]
  ) {
    return false;
  }

  return true;
}

export function resolvePurposes(purposeNames: string[]): PurposeTemplate[] {
  const resolved: PurposeTemplate[] = [];
  for (const name of purposeNames) {
    const template = PURPOSE_TEMPLATES[name];
    if (template) resolved.push(template);
  }
  return resolved;
}
