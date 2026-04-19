import { Employee, EmployeeRole } from "./types";

/**
 * Per-product role contribution snapshot. Each numeric field is a skill/level/morale-
 * weighted sum across assigned employees in that role. Think of it as "effective headcount."
 *
 * A senior (L3) at skill 80 / morale 80 contributes roughly 1.3; a mid at skill 55 roughly
 * 0.75; a junior at skill 35 roughly 0.5. Founders are bucketed by archetype (technical →
 * engineer, design → designer, business → sales).
 */
export interface TeamEffects {
  engineer: number;
  designer: number;
  pm: number;
  sales: number;
  marketing: number;
  ops: number;
  /** Raw count of assigned employees, any role. */
  headcount: number;
  /** The actual Employee records (handy for UI + flavor copy). */
  assigned: Employee[];
}

export const EMPTY_TEAM: TeamEffects = Object.freeze({
  engineer: 0, designer: 0, pm: 0, sales: 0, marketing: 0, ops: 0,
  headcount: 0, assigned: [],
}) as TeamEffects;

/** Weighted contribution of a single employee, roughly 0.2..1.6. */
function contribution(e: Employee): number {
  // Skill of 70 is "typical senior" and anchors the curve at ~1.0.
  const skillFactor = Math.max(0.25, (e.skill ?? 50) / 70);
  const levelFactor = e.level === 3 ? 1.15 : e.level === 2 ? 1.0 : 0.8;
  // Low morale drags output, high morale lifts it slightly. Range ~0.7..1.2.
  const morale = e.morale ?? 70;
  const moraleFactor = 0.7 + Math.max(0, Math.min(100, morale)) / 200;
  return skillFactor * levelFactor * moraleFactor;
}

/** Which role bucket a founder contributes to, based on archetype. */
function founderBucket(e: Employee): "engineer" | "designer" | "sales" {
  if (e.archetype === "design") return "designer";
  if (e.archetype === "business") return "sales";
  return "engineer";
}

/**
 * Build a TeamEffects snapshot from the IDs assigned to a product.
 *
 * Callers pass the product's `assignedEngineers` (the field name is legacy — it really
 * means "assigned team"), plus the full employee roster.
 */
export function teamEffects(assignedIds: readonly string[], employees: readonly Employee[]): TeamEffects {
  if (!assignedIds || assignedIds.length === 0) return EMPTY_TEAM;
  const idSet = new Set(assignedIds);
  const assigned = employees.filter(e => idSet.has(e.id));
  const eff: TeamEffects = {
    engineer: 0, designer: 0, pm: 0, sales: 0, marketing: 0, ops: 0,
    headcount: 0, assigned,
  };
  for (const e of assigned) {
    eff.headcount += 1;
    const c = contribution(e);
    if (e.role === "founder") {
      eff[founderBucket(e)] += c;
      continue;
    }
    // Each non-founder slots directly into their role bucket.
    const bucket = e.role as Exclude<EmployeeRole, "founder">;
    eff[bucket] += c;
  }
  return eff;
}

/** Short human-readable summary of the team composition. Used in UI tooltips and flavor. */
export function summarizeTeam(t: TeamEffects): string {
  const parts: string[] = [];
  if (t.engineer > 0.05) parts.push(`eng ${t.engineer.toFixed(1)}`);
  if (t.designer > 0.05) parts.push(`design ${t.designer.toFixed(1)}`);
  if (t.pm > 0.05) parts.push(`pm ${t.pm.toFixed(1)}`);
  if (t.sales > 0.05) parts.push(`sales ${t.sales.toFixed(1)}`);
  if (t.marketing > 0.05) parts.push(`mkt ${t.marketing.toFixed(1)}`);
  if (t.ops > 0.05) parts.push(`ops ${t.ops.toFixed(1)}`);
  return parts.length ? parts.join(" · ") : "unstaffed";
}
