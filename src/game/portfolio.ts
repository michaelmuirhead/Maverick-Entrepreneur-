/**
 * "Portfolio" — misc defensive / strategic systems that don't warrant their own file:
 *   - Patents & IP protection
 *   - Open-source sponsorship
 *   - Partnerships
 *   - Government contracts
 *   - Regional expansion
 *   - IPO state machine
 *
 * Each one is small; kept here for locality so the tick doesn't import a dozen files.
 */

import type {
  GameState, GovernmentContract, IpoState, OpenSourceProject, Partnership,
  Patent, ProductCategory, Region, RegionalPresence,
} from "./types";
import type { RNG } from "./rng";

// =====================================================================================
// Patents / IP
// =====================================================================================

/** Filing cost for a patent on a given category. Security-IT / finance-ops are pricier. */
export function patentFilingCost(category: ProductCategory): number {
  switch (category) {
    case "security-it":
    case "finance-ops":
      return 45_000;
    case "enterprise":
    case "custom":
      return 35_000;
    case "embedded":
    case "system":
      return 30_000;
    default:
      return 25_000;
  }
}

/** Weeks from filing to grant. Mostly constant but enterprise-ish categories take longer. */
export function patentGrantWeeks(category: ProductCategory): number {
  return ["security-it", "enterprise", "finance-ops"].includes(category) ? 60 : 48;
}

export function fileNewPatent(params: {
  id: string; title: string; category: ProductCategory; week: number;
}): Patent {
  return {
    id: params.id,
    title: params.title,
    category: params.category,
    filedWeek: params.week,
    cost: patentFilingCost(params.category),
  };
}

export function advancePatents(patents: Patent[] | undefined, week: number): Patent[] {
  if (!patents || patents.length === 0) return [];
  return patents.map(p => {
    if (p.grantedWeek) {
      // Tick down yearsRemaining once per year
      const yearsElapsed = Math.floor((week - p.grantedWeek) / 52);
      const yearsRemaining = Math.max(0, 20 - yearsElapsed);
      return { ...p, yearsRemaining };
    }
    if (week - p.filedWeek >= patentGrantWeeks(p.category)) {
      return { ...p, grantedWeek: week, yearsRemaining: 20 };
    }
    return p;
  }).filter(p => p.yearsRemaining === undefined || p.yearsRemaining > 0);
}

/**
 * Patent-protection multiplier on competitor feature-clone damage for a product in `cat`.
 * 1.0 = no protection, 0.5 = full protection with multiple granted patents in that category.
 */
export function patentProtection(
  patents: Patent[] | undefined,
  category: ProductCategory,
): number {
  if (!patents) return 1;
  const granted = patents.filter(p => p.grantedWeek && p.category === category);
  if (granted.length === 0) return 1;
  // First patent gives 25% protection; each subsequent adds 10% more, capped at 60%.
  const protection = Math.min(0.6, 0.25 + (granted.length - 1) * 0.1);
  return 1 - protection;
}

// =====================================================================================
// Open-source
// =====================================================================================

export function createOssProject(params: {
  id: string; name: string; category: ProductCategory; weeklyBudget: number; week: number;
}): OpenSourceProject {
  return {
    id: params.id,
    name: params.name,
    category: params.category,
    stars: 5,
    weeklyBudget: params.weeklyBudget,
    startedWeek: params.week,
  };
}

export function advanceOss(
  oss: OpenSourceProject[] | undefined,
  week: number,
  rng: RNG,
): OpenSourceProject[] {
  if (!oss || oss.length === 0) return [];
  return oss.map(p => {
    // Growth depends on budget: $2k/wk baseline doubles stars every ~20 weeks.
    const growthRate = p.weeklyBudget / 2_000;
    const weeksLive = week - p.startedWeek;
    // Simple S-curve toward a cap scaled by budget.
    const cap = Math.max(20, p.weeklyBudget * 50);
    const decayIfStarved = p.weeklyBudget < 500 ? 0.97 : 1;
    const target = Math.min(cap, p.stars + growthRate * (1 + rng.range(-0.3, 0.3)));
    const stars = Math.max(1, Math.round(target * decayIfStarved));
    void weeksLive;
    return { ...p, stars };
  });
}

/** Recruiting appeal multiplier from sponsored OSS projects. Caps at 1.15. */
export function ossRecruitingBoost(oss: OpenSourceProject[] | undefined): number {
  if (!oss || oss.length === 0) return 1;
  const totalStars = oss.reduce((s, p) => s + p.stars, 0);
  return 1 + Math.min(0.15, totalStars / 20_000);
}

/** Weekly cost of running open source. */
export function weeklyOssBurn(oss: OpenSourceProject[] | undefined): number {
  if (!oss) return 0;
  return oss.reduce((s, p) => s + p.weeklyBudget, 0);
}

// =====================================================================================
// Partnerships
// =====================================================================================

export function createPartnership(params: {
  id: string; partnerName: string; kind: Partnership["kind"];
  weeklyCost: number; signupMultiplier: number;
  benefitsCategory: ProductCategory; week: number;
}): Partnership {
  return {
    id: params.id,
    partnerName: params.partnerName,
    kind: params.kind,
    startedWeek: params.week,
    weeklyCost: params.weeklyCost,
    signupMultiplier: params.signupMultiplier,
    benefitsCategory: params.benefitsCategory,
  };
}

/** Weekly cost of active partnerships. */
export function weeklyPartnershipBurn(partnerships: Partnership[] | undefined): number {
  if (!partnerships) return 0;
  return partnerships.reduce((s, p) => s + p.weeklyCost, 0);
}

/** Aggregate signup multiplier for products in a given category. */
export function partnershipMultiplier(
  partnerships: Partnership[] | undefined,
  category: ProductCategory,
): number {
  if (!partnerships) return 1;
  let stacked = 1;
  let dim = 1;
  for (const p of partnerships) {
    if (p.benefitsCategory !== category) continue;
    stacked *= 1 + (p.signupMultiplier - 1) * dim;
    dim *= 0.7;
  }
  return stacked;
}

// =====================================================================================
// Government contracts
// =====================================================================================

/**
 * Award a government contract. Value scales with clearance; FedRAMP is the largest tier.
 */
export function issueGovContract(params: {
  id: string; agency: string; title: string; category: ProductCategory;
  clearance: GovernmentContract["clearance"]; week: number;
}): GovernmentContract {
  const tierValue: Record<GovernmentContract["clearance"], number> = {
    basic: 250_000,
    cleared: 1_500_000,
    fedramp: 6_000_000,
  };
  const months = params.clearance === "basic" ? 6 : params.clearance === "cleared" ? 12 : 24;
  return {
    id: params.id,
    agency: params.agency,
    title: params.title,
    totalValue: tierValue[params.clearance],
    months,
    startedWeek: params.week,
    category: params.category,
    clearance: params.clearance,
  };
}

/** Weekly recognized revenue across all active contracts. */
export function weeklyGovRevenue(
  contracts: GovernmentContract[] | undefined,
  weekNow: number,
): number {
  if (!contracts) return 0;
  return contracts.reduce((s, g) => {
    const weeksLive = weekNow - g.startedWeek;
    const totalWeeks = g.months * 4.33;
    if (weeksLive < 0 || weeksLive >= totalWeeks) return s;
    return s + g.totalValue / totalWeeks;
  }, 0);
}

/** Filters out contracts that have paid out fully. */
export function expireGovContracts(
  contracts: GovernmentContract[] | undefined,
  weekNow: number,
): GovernmentContract[] {
  if (!contracts) return [];
  return contracts.filter(g => {
    const totalWeeks = g.months * 4.33;
    return weekNow - g.startedWeek < totalWeeks;
  });
}

// =====================================================================================
// Regions
// =====================================================================================

export const REGION_INFO: Record<Region, { label: string; expansionCost: number; maxShare: number }> = {
  na:    { label: "North America", expansionCost: 0,          maxShare: 0.55 },
  emea:  { label: "EMEA",          expansionCost: 200_000,    maxShare: 0.30 },
  apac:  { label: "APAC",          expansionCost: 300_000,    maxShare: 0.25 },
  latam: { label: "LATAM",         expansionCost: 150_000,    maxShare: 0.15 },
};

/** Initial: we're in NA with modest localization. */
export function initRegions(): RegionalPresence[] {
  return [{ region: "na", enteredWeek: 0, marketCapture: 0.45, localizationScore: 80 }];
}

/**
 * Expand into a new region. Returns the updated presence list and the cash cost
 * (caller is responsible for deducting cash). Idempotent on existing regions.
 */
export function expandInto(
  regions: RegionalPresence[] | undefined,
  region: Region,
  week: number,
): { regions: RegionalPresence[]; cost: number } {
  const list = regions ?? [];
  if (list.some(r => r.region === region)) return { regions: list, cost: 0 };
  const info = REGION_INFO[region];
  const newEntry: RegionalPresence = {
    region,
    enteredWeek: week,
    marketCapture: Math.min(info.maxShare, 0.08),
    localizationScore: 40,
  };
  return {
    regions: [...list, newEntry],
    cost: info.expansionCost,
  };
}

/** Per-tick drift — localization scores climb slowly; market capture drifts toward max. */
export function advanceRegions(
  regions: RegionalPresence[] | undefined,
): RegionalPresence[] {
  if (!regions) return [];
  return regions.map(r => {
    const info = REGION_INFO[r.region];
    return {
      ...r,
      localizationScore: Math.min(100, r.localizationScore + 0.4),
      marketCapture: Math.min(info.maxShare, r.marketCapture + (info.maxShare - r.marketCapture) * 0.02),
    };
  });
}

/** Global signup multiplier derived from total regional coverage. */
export function regionalSignupMultiplier(regions: RegionalPresence[] | undefined): number {
  if (!regions || regions.length === 0) return 1;
  const capture = regions.reduce((s, r) => s + r.marketCapture * (r.localizationScore / 100), 0);
  // 0.45 (NA only, default) = neutral 1.0; 0.9 capture (all four regions fully localized) = 1.25.
  return 1 + Math.max(0, capture - 0.45) * 0.55;
}

// =====================================================================================
// IPO
// =====================================================================================

export function initIpo(): IpoState {
  return { stage: "none", stageStartedWeek: 0 };
}

/** MRR threshold to begin exploring an IPO (Series B + >$2M/mo MRR). */
export const IPO_MRR_FLOOR = 2_000_000;

/**
 * Whether the IPO pathway is unlocked at all. Requires Series B and enough MRR.
 */
export function ipoEligible(state: GameState): { ok: boolean; reason?: string } {
  if (state.ipo?.stage === "public") return { ok: false, reason: "You're already public." };
  if (state.company.stage !== "series-b") {
    return { ok: false, reason: "Series B or later required before you can file." };
  }
  if ((state.finance.mrr ?? 0) < IPO_MRR_FLOOR) {
    return { ok: false, reason: `MRR must exceed $${(IPO_MRR_FLOOR / 1e6).toFixed(1)}M/mo — you're at $${Math.round((state.finance.mrr ?? 0) / 1000)}k.` };
  }
  return { ok: true };
}

/**
 * Valuation at IPO — blended MRR × multiple, with a macro-economy bias applied in the
 * caller. Keep this function pure of economy state; caller multiplies.
 */
export function ipoValuation(state: GameState): number {
  const annualRevenue = (state.finance.mrr ?? 0) * 12;
  // SaaS-ish multiple: 8x ARR at the floor, 12x at strong growth.
  const multiple = 10;
  return Math.round(annualRevenue * multiple);
}

/** Move IPO state forward one stage. Caller validates eligibility + dwell time. */
export function advanceIpoStage(ipo: IpoState, week: number): IpoState {
  const order: IpoState["stage"][] = ["none", "exploring", "filed", "roadshow", "public"];
  const idx = order.indexOf(ipo.stage);
  if (idx < 0 || idx === order.length - 1) return ipo;
  return { ...ipo, stage: order[idx + 1]!, stageStartedWeek: week };
}

/** Min weeks you must be in each stage before moving on. */
export function ipoMinDwell(stage: IpoState["stage"]): number {
  switch (stage) {
    case "none":      return 0;
    case "exploring": return 8;
    case "filed":     return 6;
    case "roadshow":  return 3;
    case "public":    return Infinity;
  }
}
