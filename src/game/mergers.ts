import {
  AcquisitionDeal,
  Competitor,
  CompetitorStage,
  EconomyState,
  GameEvent,
  GameState,
  OfferTier,
  Product,
} from "./types";
import { RNG, makeRng } from "./rng";
import { derivePricing } from "./segments";
import { arpuFor, revenueModelFor, segmentMixFor } from "./categories";
import { economyValuationMultiplier } from "./economy";

// ARPU and segment mix now live in CATEGORY_INFO. Re-export arpuFor so external
// callers (competitors.ts, sim-harness) keep working without a direct categories.ts import.
export { arpuFor };

// ---------------------------------------------------------------------------
// Lifecycle + valuation helpers
// ---------------------------------------------------------------------------

const STAGE_MULTIPLE: Record<CompetitorStage, number> = {
  scrappy:    15,  // pre-revenue hype premium
  growth:     10,
  mature:      6,
  declining:   2,
  acquired:    0,
  dead:        0,
};

/** Can this competitor be targeted by an acquisition bid right now? */
export function isAcquirable(c: Competitor): boolean {
  const stage = c.stage ?? "scrappy";
  return stage !== "acquired" && stage !== "dead";
}

/** Estimated weekly burn — headcount-driven with a small floor. */
export function competitorWeeklyBurn(c: Competitor): number {
  const hc = c.headcount ?? 10;
  return Math.max(1, hc) * 2_500;
}

/** Cash runway in weeks (∞ if burn is zero). */
export function competitorRunway(c: Competitor): number {
  const burn = competitorWeeklyBurn(c);
  const cash = Math.max(0, c.cash ?? 0);
  if (burn <= 0) return Infinity;
  return cash / burn;
}

/**
 * Fair valuation for a competitor. Base = ARR × stage multiple, plus cash on hand.
 * Declining and dead/acquired rivals are floored so the UI always shows something sensible,
 * but practically only scrappy → mature are worth real money.
 */
export function competitorValuation(c: Competitor, economy?: EconomyState): number {
  const stage: CompetitorStage = c.stage ?? "scrappy";
  if (stage === "acquired" || stage === "dead") return 0;
  const mrr = Math.max(0, c.mrr ?? 0);
  const arr = mrr * 12;
  const multiple = stageMultipleFor(c);
  const base = arr * multiple;
  const cash = Math.max(0, c.cash ?? 0);
  // Macro scale: boom premiums and recession discounts hit the goodwill/ARR portion.
  // Cash on hand is worth cash either way, so we only scale `base`.
  const vmul = economy ? economyValuationMultiplier(economy) : 1;
  const macroBase = base * vmul;
  // Floor: even a tiny struggling company is worth a little something (team + IP).
  return Math.max(100_000, Math.round(macroBase + cash));
}

/** Stage multiple adjusted for growth/quality. A strong scrappy gets a bigger premium. */
function stageMultipleFor(c: Competitor): number {
  const base = STAGE_MULTIPLE[c.stage ?? "scrappy"];
  const q = (c.productQuality ?? 60) / 100; // 0..1
  const g = c.growthRate ?? 0;               // weekly growth rate
  // Scale ±40% by quality, and bump another ±20% for growth.
  const qualityAdj = 0.8 + q * 0.4;          // 0.8 .. 1.2
  const growthAdj  = 1 + Math.max(-0.2, Math.min(0.2, g * 4));
  return base * qualityAdj * growthAdj;
}

/**
 * Convert a tier into a price multiplier. Players can in theory pay any price,
 * but the UI exposes these three anchors.
 */
export function tierMultiplier(tier: OfferTier): number {
  switch (tier) {
    case "lowball": return 0.7;
    case "fair":    return 1.0;
    case "premium": return 1.4;
  }
}

/**
 * Deterministic probability the target accepts an offer. Drivers:
 *   - Premium ratio over fair valuation (steep curve — ratios below 0.7 rarely land)
 *   - Cash runway (distress boosts acceptance sharply)
 *   - Stage (scrappy founders won't sell cheap; declining boards eager)
 */
export function estimateAcceptance(c: Competitor, offer: number, economy?: EconomyState): number {
  const fair = competitorValuation(c, economy);
  if (fair <= 0) return 0;
  const ratio = offer / fair;
  // Base curve: 0.7 → 0.05, 1.0 → 0.35, 1.4 → 0.75, 2.0 → 0.95
  let prob = 0.05 + (ratio - 0.7) * 0.75;
  // Distress
  const runway = competitorRunway(c);
  if (runway < 8)       prob += 0.45;
  else if (runway < 20) prob += 0.2;
  // Stage sentiment
  const stage = c.stage ?? "scrappy";
  if (stage === "declining") prob += 0.2;
  if (stage === "scrappy" && ratio < 1.2) prob -= 0.25; // founders want a premium or no deal
  if (stage === "mature" && ratio < 1.0)  prob -= 0.1;
  // Quality floors: a high-quality, growing target is a harder buy at low ratios
  const q = (c.productQuality ?? 60) / 100;
  prob -= Math.max(0, (q - 0.5) * 0.2);
  return Math.max(0, Math.min(0.98, prob));
}

/** Rolled accept decision using a seeded RNG for reproducibility. */
export function rollAcceptance(c: Competitor, offer: number, rng: RNG, economy?: EconomyState): { accepted: boolean; probability: number } {
  const probability = estimateAcceptance(c, offer, economy);
  return { accepted: rng.chance(probability), probability };
}

// ---------------------------------------------------------------------------
// Lifecycle weekly tick
// ---------------------------------------------------------------------------

function initialGrowthForStage(stage: CompetitorStage): number {
  // Weekly user growth baseline. Gets modulated by quality + category each week.
  switch (stage) {
    case "scrappy":   return 0.07;
    case "growth":    return 0.025;
    case "mature":    return 0.004;
    case "declining": return -0.02;
    case "acquired":
    case "dead":      return 0;
  }
}

/** Seed any missing lifecycle fields for legacy competitors. Used by the v4 migration too. */
export function hydrateLifecycle(c: Competitor): Competitor {
  const stage: CompetitorStage = c.stage
    ?? (c.marketShare > 0.22 ? "mature"
        : c.marketShare > 0.10 ? "growth"
        : "scrappy");
  // Derive users + MRR from existing strength/share if not yet persisted.
  // Rough landing: mature leaders at ~20k users, growth ~5k, scrappy ~800.
  const baselineUsers =
    stage === "mature"    ? 20_000 :
    stage === "growth"    ?  5_000 :
    stage === "scrappy"   ?    800 :
    stage === "declining" ?  3_000 : 0;
  const users = c.users ?? Math.max(50, Math.round(baselineUsers * (0.6 + c.marketShare)));
  const arpu = arpuFor(c.category);
  const mrr = c.mrr ?? Math.round(users * arpu * 0.6);
  const productQuality = c.productQuality ?? Math.max(30, Math.min(95, c.strength));
  return {
    ...c,
    stage,
    users,
    mrr,
    productQuality,
    growthRate: c.growthRate ?? initialGrowthForStage(stage),
    foundedWeek: c.foundedWeek ?? 0,
    distressWeeks: c.distressWeeks ?? 0,
  };
}

/** One weekly step of competitor lifecycle sim. Emits flavor events on stage changes. */
export function advanceCompetitorLifecycle(
  c: Competitor, week: number, events: GameEvent[], rng: RNG,
): Competitor {
  // Short-circuit terminal states.
  if (c.stage === "acquired" || c.stage === "dead") return c;
  const h = hydrateLifecycle(c);

  const arpu = arpuFor(h.category);
  const quality = h.productQuality ?? 60;

  // Growth: base by stage, modulated by quality and a small random walk.
  const qualityBoost = (quality - 55) / 300; // ±15% at extremes
  const noise = rng.range(-0.01, 0.012);
  let growth = initialGrowthForStage(h.stage ?? "scrappy") + qualityBoost + noise;
  // Prevent absurd tails.
  growth = Math.max(-0.06, Math.min(0.12, growth));

  let users = Math.max(0, Math.round((h.users ?? 0) * (1 + growth)));
  // Churn floor even in terminal decline: we trend to zero but don't fall off a cliff.
  if (users < 5 && (h.stage === "declining")) users = 0;

  // MRR tracks users × ARPU with some inertia (contracts don't churn all at once).
  const targetMrr = Math.round(users * arpu * 0.6);
  const mrr = Math.round((h.mrr ?? 0) * 0.3 + targetMrr * 0.7);

  // Cash: revenue - burn. (MRR is monthly; convert to weekly.)
  const weeklyRev = mrr / 4.33;
  const burn = competitorWeeklyBurn(h);
  let cash = Math.max(-999_999_999, (h.cash ?? 0) + weeklyRev - burn);

  // Distress: running cash below zero accumulates, eventually kills the company.
  let distressWeeks = h.distressWeeks ?? 0;
  if (cash < 0) distressWeeks += 1;
  else distressWeeks = Math.max(0, distressWeeks - 1);

  // Quality drift: high-growth companies invest and stay sharp; declining ones rot.
  const qDrift = h.stage === "growth" || h.stage === "scrappy"
    ? rng.range(-0.5, 0.8)
    : h.stage === "mature"
      ? rng.range(-0.4, 0.3)
      : rng.range(-1.2, 0.1); // declining
  const productQuality = Math.max(10, Math.min(100, quality + qDrift));

  // Stage transitions (single transition per tick to keep it readable).
  const prevStage = h.stage ?? "scrappy";
  let stage: CompetitorStage = prevStage;

  if (prevStage === "scrappy" && users >= 3_000 && productQuality >= 55) {
    stage = "growth";
  } else if (prevStage === "growth" && (users >= 12_000 || (mrr * 12) > 10_000_000) && growth < 0.02) {
    stage = "mature";
  } else if (prevStage === "mature" && growth < 0 && productQuality < 55) {
    stage = "declining";
  } else if (prevStage === "declining" && (users < 50 || distressWeeks > 6)) {
    // They wind down — mark dead; the tick loop will optionally remove them.
    stage = "dead";
  } else if (distressWeeks > 10 && prevStage !== "declining") {
    // Any stage can crater into declining if they run out of runway for too long.
    stage = "declining";
  }

  if (stage !== prevStage) {
    events.push({
      id: `ev_${week}_cstage_${c.id}_${stage}`,
      week, severity: stage === "dead" ? "info" : stage === "declining" ? "info" : "warn",
      message: stageTransitionFlavor(h.name, prevStage, stage),
    });
  }

  return {
    ...h,
    users, mrr, cash,
    productQuality,
    growthRate: growth,
    distressWeeks,
    stage,
  };
}

function stageTransitionFlavor(name: string, from: CompetitorStage, to: CompetitorStage): string {
  if (to === "growth")    return `${name} crossed into growth mode — hiring, scaling, unmissable.`;
  if (to === "mature")    return `${name} has plateaued into a mature business. Still formidable, just less explosive.`;
  if (to === "declining") return `${name} is in decline — churn is up, product investment is down.`;
  if (to === "dead")      return `${name} has quietly shut down. Runway hit zero and no one stepped in to buy.`;
  // scrappy -> anything-above is handled above; no other transitions expected here.
  return `${name} moved from ${from} to ${to}.`;
}

// ---------------------------------------------------------------------------
// Player-initiated acquisition
// ---------------------------------------------------------------------------

/** Snapshot of what will happen if the player makes an offer at this tier. */
export interface OfferPreview {
  fairValuation: number;
  price: number;
  premiumMultiple: number;
  estimatedAcceptance: number;
  cooldownWeek?: number;
  affordable: boolean;
  blockedReason?: string;
}

export function previewOffer(state: GameState, competitorId: string, tier: OfferTier): OfferPreview {
  const c = state.competitors.find(x => x.id === competitorId);
  if (!c) {
    return { fairValuation: 0, price: 0, premiumMultiple: 0, estimatedAcceptance: 0, affordable: false, blockedReason: "Competitor not found" };
  }
  if (!isAcquirable(c)) {
    return { fairValuation: 0, price: 0, premiumMultiple: 0, estimatedAcceptance: 0, affordable: false, blockedReason: `${c.name} is ${c.stage ?? "not available"}` };
  }
  if (c.rejectedOfferUntil && state.week < c.rejectedOfferUntil) {
    const fair = competitorValuation(c, state.economy);
    const mult = tierMultiplier(tier);
    const price = Math.round(fair * mult);
    return {
      fairValuation: fair, price, premiumMultiple: mult,
      estimatedAcceptance: 0,
      cooldownWeek: c.rejectedOfferUntil,
      affordable: state.finance.cash >= price,
      blockedReason: `Cooling off until week ${c.rejectedOfferUntil}`,
    };
  }
  const fair = competitorValuation(c, state.economy);
  const mult = tierMultiplier(tier);
  const price = Math.round(fair * mult);
  const accept = estimateAcceptance(c, price, state.economy);
  return {
    fairValuation: fair, price, premiumMultiple: mult,
    estimatedAcceptance: accept,
    affordable: state.finance.cash >= price,
  };
}

/**
 * Pure reducer: attempt an acquisition. Returns a new GameState (plus events) with one of:
 *   - rejected   → cooldown set, cash unchanged
 *   - blocked    → cooldown already active or not affordable
 *   - accepted   → cash deducted, absorbed Product added, competitor marked acquired, deal recorded
 */
export function applyPlayerAcquisition(
  state: GameState, competitorId: string, tier: OfferTier,
): GameState {
  const c = state.competitors.find(x => x.id === competitorId);
  if (!c) return state;
  if (!isAcquirable(c)) return state;
  if (c.rejectedOfferUntil && state.week < c.rejectedOfferUntil) return state;

  const fair = competitorValuation(c, state.economy);
  const mult = tierMultiplier(tier);
  const price = Math.round(fair * mult);
  if (state.finance.cash < price) {
    return {
      ...state,
      events: [{
        id: `ev_${state.week}_acq_nocash_${c.id}`,
        week: state.week, severity: "warn",
        message: `Not enough cash to bid $${(price / 1e6).toFixed(1)}M for ${c.name}. Runway would go underwater.`,
      }, ...state.events],
    };
  }

  const rng = makeRng(`${state.seed}:acq:${state.week}:${c.id}:${tier}`);
  const { accepted, probability } = rollAcceptance(c, price, rng);

  if (!accepted) {
    return {
      ...state,
      competitors: state.competitors.map(x => x.id === c.id
        ? { ...x, lastOfferWeek: state.week, rejectedOfferUntil: state.week + 6 }
        : x),
      events: [{
        id: `ev_${state.week}_acq_rejected_${c.id}`,
        week: state.week, severity: "warn",
        message: rejectionFlavor(c.name, tier, probability, price),
      }, ...state.events],
    };
  }

  // Deal is on.
  const absorbedProduct = buildAbsorbedProduct(c, state.week);
  const deal: AcquisitionDeal = {
    id: `deal_${state.week}_${c.id}`,
    week: state.week,
    acquirerId: "player",
    acquirerName: state.company.name,
    targetId: c.id,
    targetName: c.name,
    structure: "cash",
    pricePaid: price,
    fairValuation: fair,
    premiumMultiple: mult,
    narrative: `${state.company.name} acquired ${c.name} for $${(price / 1e6).toFixed(1)}M.`,
  };

  return {
    ...state,
    finance: { ...state.finance, cash: state.finance.cash - price },
    products: [...state.products, absorbedProduct],
    competitors: state.competitors.map(x => x.id === c.id
      ? { ...x, stage: "acquired", acquiredBy: "player", acquiredWeek: state.week, lastOfferWeek: state.week }
      : x),
    deals: [deal, ...(state.deals ?? [])].slice(0, 100),
    events: [{
      id: `ev_${state.week}_acq_done_${c.id}`,
      week: state.week, severity: "good",
      message: `Acquisition closed: ${c.name} joins ${state.company.name} for $${(price / 1e6).toFixed(1)}M. Integration begins — expect some user churn, some cultural turbulence, and a flurry of legal invoices.`,
    }, ...state.events],
  };
}

function rejectionFlavor(name: string, tier: OfferTier, prob: number, price: number): string {
  const p = Math.round(prob * 100);
  if (tier === "lowball") {
    return `${name} rejected your $${(price / 1e6).toFixed(1)}M lowball (${p}% estimate). The CEO's response was "we're not for sale." Cool off for 6 weeks.`;
  }
  if (tier === "premium") {
    return `${name} rejected even your premium $${(price / 1e6).toFixed(1)}M bid (${p}% estimate). Their board is playing the long game. 6-week cooldown.`;
  }
  return `${name} rejected your $${(price / 1e6).toFixed(1)}M offer (${p}% estimate). 6-week cooldown before you can re-approach.`;
}

/**
 * Build the Product entry that gets added to the player's portfolio when they
 * acquire a competitor. Inherits 75% of users (25% lost in integration), carries
 * debt from legacy code, health is hit by integration stress.
 */
function buildAbsorbedProduct(c: Competitor, week: number): Product {
  const absorbedUsers = Math.max(10, Math.floor((c.users ?? 0) * 0.75));
  const mix = segmentMixFor(c.category);
  const ent = Math.round(absorbedUsers * mix.enterprise);
  const smb = Math.round(absorbedUsers * mix.smb);
  const self = Math.max(0, absorbedUsers - ent - smb);
  const arpu = arpuFor(c.category);
  return {
    id: `p_acq_${c.id}_${week}`,
    name: `${c.name} (Acquired)`,
    category: c.category,
    revenueModel: revenueModelForCompetitor(c),
    stage: "launched",
    version: "1.0",
    health: 50,
    quality: Math.min(95, Math.max(40, c.productQuality ?? 55)),
    users: { enterprise: ent, smb, selfServe: self },
    pricing: derivePricing(Math.max(5, Math.round(arpu * 0.5))),
    devProgress: 100,
    devBudget: 0,
    marketingBudget: 0,
    weeksAtStage: 0,
    weeksSinceLaunch: 0,
    ageWeeks: 0,
    assignedEngineers: [],
    launchedWeek: week,
    lifetimeRevenue: 0,
    lifetimeCost: 0,
    lifetimeDevCost: 0,
    lifetimeMarketingCost: 0,
    peakUsers: absorbedUsers,
    peakMrr: 0,
    techDebt: 45, // legacy codebase always inherits some debt
    lastWeekUserTotal: absorbedUsers,
  };
}

/**
 * Pick a revenue model for an absorbed product. We don't track a model on competitors,
 * so we fall back to the category's default — realistic enough for integration.
 */
function revenueModelForCompetitor(c: Competitor): Product["revenueModel"] {
  return revenueModelFor(c.category);
}

// ---------------------------------------------------------------------------
// AI-side M&A (rivals buy each other in the background)
// ---------------------------------------------------------------------------

/**
 * Occasionally: a cash-rich competitor acquires a struggling one in the same category.
 * Mutates `competitors` in-place-conceptually (returns new list) and pushes a deal + events.
 */
export function runAiMandA(
  state: GameState, events: GameEvent[], rng: RNG,
): { competitors: Competitor[]; deals: AcquisitionDeal[] } {
  const live = state.competitors.filter(isAcquirable);
  const newDeals: AcquisitionDeal[] = [];
  const acquiredIds = new Set<string>();

  // Pair buyers (growth/mature with cash) with targets (struggling, same category).
  for (const buyer of live) {
    if (acquiredIds.has(buyer.id)) continue;
    const bStage = buyer.stage ?? "scrappy";
    if (bStage !== "growth" && bStage !== "mature") continue;
    const buyerCash = buyer.cash ?? 0;
    if (buyerCash < 5_000_000) continue;
    // Only attempt with a low per-week probability — keep the ecosystem dynamic but not chaotic.
    if (!rng.chance(0.04)) continue;

    const candidates = live.filter(t =>
      t.id !== buyer.id &&
      !acquiredIds.has(t.id) &&
      t.category === buyer.category &&
      (t.stage === "declining" || t.stage === "scrappy") &&
      competitorValuation(t, state.economy) <= buyerCash * 0.6,
    );
    if (candidates.length === 0) continue;
    const target = rng.pick(candidates);

    // Buyer offers a fair-to-slight-premium deal (rivals are savvier than the player might be).
    const mult = rng.range(0.95, 1.25);
    const fair = competitorValuation(target, state.economy);
    const price = Math.round(fair * mult);
    // Target accepts at a higher probability since the buyer in-fiction has better intel.
    const aiAcceptBoost = 0.15;
    const prob = Math.min(0.98, estimateAcceptance(target, price, state.economy) + aiAcceptBoost);
    if (!rng.chance(prob)) continue;

    acquiredIds.add(target.id);
    newDeals.push({
      id: `deal_${state.week}_${buyer.id}_${target.id}`,
      week: state.week,
      acquirerId: buyer.id,
      acquirerName: buyer.name,
      targetId: target.id,
      targetName: target.name,
      structure: "cash",
      pricePaid: price,
      fairValuation: fair,
      premiumMultiple: mult,
      narrative: `${buyer.name} acquired ${target.name} for $${(price / 1e6).toFixed(1)}M.`,
    });
    events.push({
      id: `ev_${state.week}_ai_mna_${buyer.id}_${target.id}`,
      week: state.week, severity: "info",
      message: `M&A news: ${buyer.name} is acquiring ${target.name} for $${(price / 1e6).toFixed(1)}M. The ${buyer.category} landscape just consolidated a notch.`,
    });
  }

  const nextCompetitors = state.competitors.map(c => {
    if (!acquiredIds.has(c.id)) return c;
    // Merge target stats into buyer on the next line; for now just mark target acquired.
    const deal = newDeals.find(d => d.targetId === c.id);
    return {
      ...c,
      stage: "acquired" as CompetitorStage,
      acquiredBy: deal?.acquirerId ?? c.acquiredBy,
      acquiredWeek: state.week,
    };
  }).map(c => {
    // Absorb: if this competitor was a buyer in one of the new deals, fold in some of target's users + cash drain.
    const dealsAsBuyer = newDeals.filter(d => d.acquirerId === c.id);
    if (dealsAsBuyer.length === 0) return c;
    let users = c.users ?? 0;
    let cash = c.cash ?? 0;
    let mrr = c.mrr ?? 0;
    for (const d of dealsAsBuyer) {
      const tgt = state.competitors.find(x => x.id === d.targetId);
      if (!tgt) continue;
      // Integration loss: buyer absorbs ~60% of target's users and MRR.
      users += Math.floor((tgt.users ?? 0) * 0.6);
      mrr   += Math.floor((tgt.mrr ?? 0) * 0.6);
      cash  -= d.pricePaid;
    }
    // Marketshare bump from consolidation.
    const mkt = Math.min(0.7, (c.marketShare ?? 0) + 0.03 * dealsAsBuyer.length);
    return { ...c, users, cash, mrr, marketShare: mkt };
  });

  return { competitors: nextCompetitors, deals: newDeals };
}
