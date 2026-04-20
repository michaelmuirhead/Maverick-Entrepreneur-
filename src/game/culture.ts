/**
 * Company culture / perks.
 *
 * Perks are toggleable — the player enables ones they want, and each one charges a
 * weekly per-employee cost while boosting morale, reducing attrition, and nudging
 * recruiting. The blended "culture score" (0..100) drives narrative events and
 * influences the perceived prestige of the company during fundraising pitches.
 */

import type { CultureState, PerkKind } from "./types";

export interface PerkInfo {
  id: PerkKind;
  label: string;
  blurb: string;
  /** Weekly cost per employee. Multiplied by total headcount each tick. */
  weeklyCostPerEmployee: number;
  /** Passive morale lift (per employee, per week) while enabled. */
  moraleLift: number;
  /** Attrition reduction at peak (0..1). Applied multiplicatively to exit roll chance. */
  attritionReduction: number;
  /** Cultural score contribution (0..100 when enabled in full). */
  cultureScore: number;
  /** Category of signal this perk sends to candidates; used for narrative coloring only. */
  vibe: "wellness" | "prestige" | "flexibility" | "compensation" | "community";
}

export const PERKS: Record<PerkKind, PerkInfo> = {
  "free-lunch": {
    id: "free-lunch",
    label: "Free catered lunch",
    blurb: "Daily hot lunch for the whole team. Cheap morale, huge optics.",
    weeklyCostPerEmployee: 75,
    moraleLift: 0.4,
    attritionReduction: 0.08,
    cultureScore: 10,
    vibe: "community",
  },
  "gym-stipend": {
    id: "gym-stipend",
    label: "Gym / fitness stipend",
    blurb: "Monthly reimbursement for a gym, yoga, or pickleball league.",
    weeklyCostPerEmployee: 25,
    moraleLift: 0.2,
    attritionReduction: 0.05,
    cultureScore: 6,
    vibe: "wellness",
  },
  "learning-budget": {
    id: "learning-budget",
    label: "Learning & conferences",
    blurb: "Annual budget for courses, books, and one good conference.",
    weeklyCostPerEmployee: 40,
    moraleLift: 0.3,
    attritionReduction: 0.08,
    cultureScore: 9,
    vibe: "prestige",
  },
  "wellness-stipend": {
    id: "wellness-stipend",
    label: "Wellness stipend",
    blurb: "Therapy, meditation apps, or whatever keeps people human.",
    weeklyCostPerEmployee: 30,
    moraleLift: 0.35,
    attritionReduction: 0.07,
    cultureScore: 8,
    vibe: "wellness",
  },
  "parental-leave": {
    id: "parental-leave",
    label: "Generous parental leave",
    blurb: "16 weeks paid for all parents. A real signal, not a line item.",
    weeklyCostPerEmployee: 45,  // amortized across team
    moraleLift: 0.25,
    attritionReduction: 0.10,
    cultureScore: 11,
    vibe: "community",
  },
  "remote-flex": {
    id: "remote-flex",
    label: "Remote-flex policy",
    blurb: "Work from wherever. Quarterly in-person days. Trust, explicitly.",
    weeklyCostPerEmployee: 8,  // mostly software + stipends
    moraleLift: 0.45,
    attritionReduction: 0.12,
    cultureScore: 13,
    vibe: "flexibility",
  },
  "unlimited-pto": {
    id: "unlimited-pto",
    label: "Unlimited PTO",
    blurb: "Take as much time as you need. Most people still take two weeks.",
    weeklyCostPerEmployee: 3,
    moraleLift: 0.15,
    attritionReduction: 0.03,
    cultureScore: 5,
    vibe: "flexibility",
  },
  "offsite-retreats": {
    id: "offsite-retreats",
    label: "Quarterly offsite retreats",
    blurb: "Four retreats a year. One will be criticized on Glassdoor.",
    weeklyCostPerEmployee: 60,
    moraleLift: 0.35,
    attritionReduction: 0.07,
    cultureScore: 8,
    vibe: "community",
  },
  "dog-friendly": {
    id: "dog-friendly",
    label: "Dog-friendly office",
    blurb: "The dogs are better employees than some of the humans.",
    weeklyCostPerEmployee: 5,
    moraleLift: 0.2,
    attritionReduction: 0.03,
    cultureScore: 4,
    vibe: "community",
  },
  "equity-refresh": {
    id: "equity-refresh",
    label: "Annual equity refresh",
    blurb: "Each year, grant every employee a fresh stock bump. Golden handcuffs.",
    weeklyCostPerEmployee: 20,  // accounting proxy only
    moraleLift: 0.3,
    attritionReduction: 0.15,
    cultureScore: 12,
    vibe: "compensation",
  },
};

/** Order used by the UI (wellness first, prestige last). */
export const PERK_ORDER: PerkKind[] = [
  "free-lunch",
  "gym-stipend",
  "learning-budget",
  "wellness-stipend",
  "parental-leave",
  "remote-flex",
  "unlimited-pto",
  "offsite-retreats",
  "dog-friendly",
  "equity-refresh",
];

export function initCulture(): CultureState {
  return { perks: [], cultureScore: 40 };
}

/** Total weekly perk cost for the given headcount. */
export function weeklyPerkCost(culture: CultureState | undefined, headcount: number): number {
  if (!culture || culture.perks.length === 0) return 0;
  const perEmp = culture.perks.reduce((s, k) => s + PERKS[k].weeklyCostPerEmployee, 0);
  return perEmp * headcount;
}

/** Total morale lift per tick from all active perks. */
export function perkMoraleLift(culture: CultureState | undefined): number {
  if (!culture || culture.perks.length === 0) return 0;
  return culture.perks.reduce((s, k) => s + PERKS[k].moraleLift, 0);
}

/**
 * Combined attrition-reduction multiplier. Reductions stack with diminishing returns:
 *   final = 1 - (1 - r1) * (1 - r2) * ...   (but capped at 0.5 so attrition never fully vanishes)
 */
export function perkAttritionMultiplier(culture: CultureState | undefined): number {
  if (!culture || culture.perks.length === 0) return 1;
  let remainder = 1;
  for (const k of culture.perks) remainder *= (1 - PERKS[k].attritionReduction);
  return Math.max(0.5, remainder);
}

/**
 * Culture score 0..100 — blended signal used for recruiting + narrative. Combines
 * active perks' contributions with a recent morale proxy (optional).
 */
export function recomputeCultureScore(
  culture: CultureState | undefined,
  averageMorale: number | null,
): number {
  const perkContribution = (culture?.perks ?? []).reduce((s, k) => s + PERKS[k].cultureScore, 0);
  const morale = typeof averageMorale === "number" ? averageMorale : 70;
  // Weighted: 60% perks (capped at 60), 40% morale.
  const perks = Math.min(60, perkContribution);
  const moraleShare = (morale / 100) * 40;
  return Math.round(Math.min(100, perks + moraleShare));
}

/** Recruiting-appeal multiplier (1.0 = neutral). Drives candidate quality + acceptance. */
export function cultureRecruitingMultiplier(culture: CultureState | undefined): number {
  if (!culture) return 1;
  // Score 40 = neutral. Every 15 points of delta = 5% appeal shift (clamped +/- 25%).
  const delta = (culture.cultureScore - 40) / 15;
  return Math.max(0.75, Math.min(1.25, 1 + delta * 0.05));
}
