/**
 * Office tier system.
 *
 * The company's physical workspace gates headcount capacity, baseline productivity,
 * baseline morale, and a prestige signal that matters for recruiting and fundraising.
 *
 * Tiers follow a classic startup arc: garage → coworking → loft → office → HQ → campus.
 * Each tier has a weekly lease, a one-time build-out cost to move in, and a headcount
 * capacity that throttles before morale/productivity collapse.
 */

import type { OfficeState, OfficeTier } from "./types";

export interface OfficeTierInfo {
  id: OfficeTier;
  label: string;
  blurb: string;
  /** Ongoing rent $/week. */
  weeklyLease: number;
  /** One-time upfront cost to move in: deposits, build-out, movers. */
  buildOutCost: number;
  /** Max headcount before overcrowding penalties kick in. */
  capacity: number;
  /** Baseline productivity modifier. 1.0 = neutral. Applied to dev velocity + sales pipeline. */
  productivityMultiplier: number;
  /** Baseline morale shift vs. neutral. Applied once/week in `updateMoraleAndAttrition`. */
  moraleModifier: number;
  /** Recruiting signal 0..1 — scales inbound candidate quality / accept rates. */
  prestige: number;
  /** Weeks required for build-out after upgrade is initiated. */
  buildOutWeeks: number;
  /** Allowed-next tier upgrades (defensive UI gating). */
  upgradesTo: OfficeTier[];
}

export const OFFICE_TIERS: Record<OfficeTier, OfficeTierInfo> = {
  garage: {
    id: "garage",
    label: "Garage",
    blurb: "The founders' apartment. Rent is free, but your cofounder's cat sleeps on the keyboard.",
    weeklyLease: 0,
    buildOutCost: 0,
    capacity: 4,
    productivityMultiplier: 0.92,
    moraleModifier: -1,
    prestige: 0.05,
    buildOutWeeks: 0,
    upgradesTo: ["coworking", "loft"],
  },
  coworking: {
    id: "coworking",
    label: "Coworking",
    blurb: "Hot desks at the local WeWork. Free kombucha, zero privacy.",
    weeklyLease: 1_200,
    buildOutCost: 3_000,
    capacity: 10,
    productivityMultiplier: 0.98,
    moraleModifier: 0,
    prestige: 0.2,
    buildOutWeeks: 1,
    upgradesTo: ["loft", "office"],
  },
  loft: {
    id: "loft",
    label: "Startup loft",
    blurb: "Your own space at last. Exposed brick, bean bags, one ping pong table.",
    weeklyLease: 4_500,
    buildOutCost: 40_000,
    capacity: 25,
    productivityMultiplier: 1.02,
    moraleModifier: 2,
    prestige: 0.45,
    buildOutWeeks: 3,
    upgradesTo: ["office", "hq"],
  },
  office: {
    id: "office",
    label: "Proper office",
    blurb: "Conference rooms with names. The receptionist greets investors.",
    weeklyLease: 12_000,
    buildOutCost: 150_000,
    capacity: 60,
    productivityMultiplier: 1.05,
    moraleModifier: 3,
    prestige: 0.65,
    buildOutWeeks: 4,
    upgradesTo: ["hq", "campus"],
  },
  hq: {
    id: "hq",
    label: "Headquarters",
    blurb: "Branded HQ building. Your logo glows on the side at night.",
    weeklyLease: 28_000,
    buildOutCost: 450_000,
    capacity: 150,
    productivityMultiplier: 1.08,
    moraleModifier: 4,
    prestige: 0.8,
    buildOutWeeks: 6,
    upgradesTo: ["campus"],
  },
  campus: {
    id: "campus",
    label: "Corporate campus",
    blurb: "A multi-building campus with a café, a barista, and a 'meditation room.'",
    weeklyLease: 70_000,
    buildOutCost: 1_500_000,
    capacity: 500,
    productivityMultiplier: 1.12,
    moraleModifier: 5,
    prestige: 0.95,
    buildOutWeeks: 10,
    upgradesTo: [],
  },
};

/** The ordered progression for UI / defaults. */
export const OFFICE_TIER_ORDER: OfficeTier[] = ["garage", "coworking", "loft", "office", "hq", "campus"];

/** Fresh starter office for a new game. */
export function initOffice(): OfficeState {
  return { tier: "garage", sinceWeek: 0 };
}

/**
 * Effective productivity multiplier including overcrowding drag.
 * If headcount exceeds capacity, productivity drops linearly down to 0.7 at 2× over.
 */
export function officeProductivity(office: OfficeState, headcount: number): number {
  const info = OFFICE_TIERS[office.tier];
  const base = info.productivityMultiplier;
  if (headcount <= info.capacity) return base;
  const overRatio = (headcount - info.capacity) / info.capacity; // 0..∞
  const drag = Math.min(0.3, overRatio * 0.25);
  return Math.max(0.7, base - drag);
}

/**
 * Effective morale modifier — includes overcrowding penalty.
 * If a company grossly exceeds capacity, morale takes an additional hit.
 */
export function officeMoraleModifier(office: OfficeState, headcount: number): number {
  const info = OFFICE_TIERS[office.tier];
  if (headcount <= info.capacity) return info.moraleModifier;
  const over = headcount - info.capacity;
  // Each employee over capacity drags morale by 0.2 (cap at -6 to avoid runaway).
  return info.moraleModifier - Math.min(6, over * 0.2);
}

/** Recruiting prestige — blends office + any pending upgrade commitment (credit for effort). */
export function officePrestige(office: OfficeState): number {
  const info = OFFICE_TIERS[office.tier];
  if (office.pendingUpgrade) {
    const toInfo = OFFICE_TIERS[office.pendingUpgrade.toTier];
    // During build-out you get partial credit — half the gap.
    return (info.prestige + toInfo.prestige) / 2;
  }
  return info.prestige;
}

/**
 * Whether a direct upgrade to `target` is allowed from the current tier.
 * Disallows downgrades and tier-skips that aren't explicitly permitted.
 */
export function canUpgradeTo(current: OfficeTier, target: OfficeTier): boolean {
  if (current === target) return false;
  return OFFICE_TIERS[current].upgradesTo.includes(target);
}

/**
 * Price up an upgrade. Returns required cash and how long the build-out takes.
 */
export function upgradeCost(target: OfficeTier): { cash: number; weeks: number } {
  const info = OFFICE_TIERS[target];
  return { cash: info.buildOutCost, weeks: info.buildOutWeeks };
}

/**
 * Weekly lease cost for the current state. If a pending upgrade is in build-out,
 * the old space still has rent until move-in day.
 */
export function weeklyOfficeCost(office: OfficeState): number {
  return OFFICE_TIERS[office.tier].weeklyLease;
}

/**
 * Check if a pending upgrade resolved this week and move in if so.
 * Pure: returns a new OfficeState. Pushes a one-off move-in event into `events`.
 */
export function resolvePendingUpgrade(
  office: OfficeState,
  week: number,
  onEvent: (msg: string) => void,
): OfficeState {
  if (!office.pendingUpgrade) return office;
  if (week < office.pendingUpgrade.readyWeek) return office;
  const toTier = office.pendingUpgrade.toTier;
  onEvent(
    `Moved into the new ${OFFICE_TIERS[toTier].label.toLowerCase()}. ${flavorForTier(toTier)}`,
  );
  return { tier: toTier, sinceWeek: week };
}

function flavorForTier(t: OfficeTier): string {
  switch (t) {
    case "coworking": return "Hot desks, ambient typing, a single good phone booth.";
    case "loft":      return "Exposed brick and the faint smell of fresh paint. Engineers are already debating standing desks.";
    case "office":    return "Conference rooms have names. Nobody remembers them.";
    case "hq":        return "Security badges and a logo on the building. Investors notice.";
    case "campus":    return "Three buildings, a café, and a ping-pong table nobody uses. Congratulations, you're established.";
    case "garage":    return "Everyone still fits around one kitchen table. Cat still sleeps on the keyboard.";
  }
}
