import { GameEvent, Product, ProductCategory, ProductStage } from "./types";
import { RNG } from "./rng";
import { EMPTY_TEAM, TeamEffects } from "./roles";
import { blendedMrr, blendedChurnRate, totalUsers } from "./segments";
import { decayPenalty, velocityPenalty } from "./debt";

/** Weekly cost to keep a product alive (hosting, support, upkeep, marketing, vNext dev). */
export function maintenanceCost(p: Product): number {
  if (p.stage === "concept" || p.stage === "eol") return 0;
  const dev = p.stage === "dev" ? p.devBudget : 0;
  // Marketing only burns once a product is live. On concept/dev we ignore it (there's nothing to market).
  const marketing = ["launched", "mature", "declining"].includes(p.stage) ? (p.marketingBudget ?? 0) : 0;
  // vNext dev burn runs alongside live-product maintenance until it ships.
  const vNextDev = p.nextVersion ? Math.max(0, p.nextVersion.devBudget) : 0;
  const users = Math.max(0, totalUsers(p));
  // Base overhead: a product in dev has almost no hosting/support cost, so charge $100/wk
  // (scrappy founders use free tiers). Once live, hosting + support + on-call bumps that to $500/wk.
  const base = p.stage === "dev" ? 100 : 500;
  // Per-user hosting stays flat at $0.10/wk across live stages.
  return dev + marketing + vNextDev + base + users * 0.1;
}

/**
 * Marketing efficiency — how much a $/week spend translates into signup multiplier.
 * Diminishing returns: first $1k is gold, $20k is mostly vanity. Caps at ~2.0x with no
 * marketing team. A strong marketing hire can lift the cap modestly (to ~2.35x at
 * marketing=3.0) and stretches every dollar a bit further before diminishing returns set in.
 */
export function marketingMultiplier(p: Product, team: TeamEffects = EMPTY_TEAM): number {
  const spend = Math.max(0, p.marketingBudget ?? 0);
  if (spend <= 0) return 1;
  // Logarithmic scaling: $0 -> 1.0, $1k -> ~1.25, $5k -> ~1.6, $20k -> ~1.95
  const base = 1 + Math.min(1, Math.log10(1 + spend / 500) / 1.7);
  if (team.marketing <= 0) return base;
  // Marketing hires make spend sharper: up to +25% on each dollar's output.
  const lift = 1 + Math.min(0.25, team.marketing * 0.05);
  // And they lift the hard ceiling, but only modestly — headcount isn't a substitute for budget.
  const cap = 2 + Math.min(0.4, team.marketing * 0.08);
  return Math.min(cap, base * lift);
}

/**
 * Fraction of a freemium product's user base that actually pays. The rest are the
 * top-of-funnel freebies — valuable for viral growth, worthless for ARR.
 */
export const FREEMIUM_CONVERSION_RATE = 0.08;

/**
 * Weekly revenue from a product. Branches on `p.revenueModel`:
 *
 *   - subscription: classic blended MRR / 4.3 across all paid segments.
 *   - freemium:     subscription math × FREEMIUM_CONVERSION_RATE. Big user counts, modest MRR.
 *   - contract:     enterprise seats only. Others are treated as pilots, not revenue.
 *                   (Enterprise contracts in these categories cover the whole org.)
 *   - one-time:     license fee × new users this week. Steady churn-replacement buys
 *                   still count — every new signup is a new sale at roughly a year's price.
 *                   Falls back to blendedMrr/4.3 when lastWeekUserTotal isn't populated yet.
 */
export function weeklyRevenue(p: Product): number {
  if (!["launched", "mature", "declining"].includes(p.stage)) return 0;

  switch (p.revenueModel) {
    case "subscription":
      return blendedMrr(p) / 4.3;

    case "freemium":
      return (blendedMrr(p) * FREEMIUM_CONVERSION_RATE) / 4.3;

    case "contract": {
      // Enterprise-only. Contract software is organizationally negotiated; stray
      // SMB / self-serve trialists in the data don't pay and don't renew.
      const contractMrr = p.users.enterprise * p.pricing.enterprise;
      return contractMrr / 4.3;
    }

    case "one-time": {
      const currentUsers = totalUsers(p);
      const prev = p.lastWeekUserTotal;
      if (prev === undefined) {
        // Legacy save (no delta available yet) — fall back to sub-style amortized revenue
        // so we don't silently zero out a product until the next tick repopulates the field.
        return blendedMrr(p) / 4.3;
      }
      const newUsers = Math.max(0, currentUsers - prev);
      if (newUsers === 0) return 0;
      // Average *monthly* price across whoever is currently buying, times ~12 months
      // to approximate a perpetual-license fee. This keeps one-time at roughly subscription
      // steady-state when growth is ~1-2% / week, and heavier on boom weeks.
      const avgMonthlyPrice = currentUsers > 0
        ? blendedMrr(p) / currentUsers
        : p.pricing.selfServe;
      return newUsers * avgMonthlyPrice * 12;
    }

    default: {
      // Exhaustiveness guard — this keeps TS honest if a new RevenueModel is added later.
      const _exhaust: never = p.revenueModel;
      void _exhaust;
      return blendedMrr(p) / 4.3;
    }
  }
}

/** Health decays over time — tech ages, market shifts. Quality buffers the decay. */
export function agingDecay(p: Product, rng: RNG): number {
  if (!["launched", "mature", "declining"].includes(p.stage)) return 0;
  // Base decay increases with age. Good quality slows it. A little randomness.
  const ageFactor = Math.min(p.weeksSinceLaunch / 52, 3); // more decay as years pass
  const qualityBuffer = (p.quality - 50) / 200; // +/- 0.25
  const base = 0.3 + ageFactor * 0.25 - qualityBuffer;
  const jitter = rng.range(-0.1, 0.2);
  // Tech debt above 60 accelerates decay — aging codebases burn health faster.
  const debtHit = decayPenalty(p);
  return Math.max(0, base + jitter + debtHit);
}

/** Signups per week when launched. Depends on health, category demand, buzz, competitors, marketing spend, role mix. */
export function signupsThisWeek(
  p: Product,
  opts: { marketDemand: number; competitorPressure: number; rng: RNG; team?: TeamEffects },
): number {
  if (!["launched", "mature"].includes(p.stage)) return 0;
  const team = opts.team ?? EMPTY_TEAM;
  // S-curve around health 50
  const healthFactor = 1 / (1 + Math.exp(-(p.health - 50) / 12));
  const buzzBoost = Math.max(0, (p.launchBuzz ?? 0) - 50) / 50 * Math.exp(-p.weeksSinceLaunch / 8);
  // A sales team generates outbound pipeline beyond what marketing/organic produce.
  // 2.5 signups per "unit" of sales roughly matches a scrappy AE working warm inbound leads.
  const salesBoost = team.sales * 2.5;
  // A strong PM keeps the product on-strategy, which nudges organic signup quality up.
  const pmBoost = team.pm * 1.0;
  const base = 8 + healthFactor * 40 + buzzBoost * 30 + salesBoost + pmBoost;
  const pressure = 1 - Math.min(0.8, opts.competitorPressure);
  const marketing = marketingMultiplier(p, team);
  const churnInjection = opts.rng.range(0.85, 1.2);
  return Math.max(0, Math.round(base * opts.marketDemand * pressure * marketing * churnInjection));
}

/**
 * Blended weekly churn rate — kept as a back-compat view over the new per-segment churn.
 * The tick now drives churn per segment; this helper is what UI/tests use when they
 * just want a single number for the whole product.
 */
export function churnRate(p: Product, team: TeamEffects = EMPTY_TEAM): number {
  return blendedChurnRate(p, team);
}

/**
 * Parse a version string like "1.0" → 1, "2.3" → 2. We only bump the major.
 * Bad or missing versions default to 1.
 */
export function majorVersion(v: string | undefined): number {
  if (!v) return 1;
  const n = parseInt(v.split(".")[0], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Can this product start a vNext project right now? Only live products qualify,
 * and only one vNext can be in flight at a time.
 */
export function canStartNextVersion(p: Product): boolean {
  if (p.nextVersion) return false;
  return p.stage === "launched" || p.stage === "mature" || p.stage === "declining";
}

/**
 * Begin a vNext effort on an existing product. Doesn't charge cash directly —
 * the weekly devBudget is spent as part of the normal tick via maintenanceCost,
 * so the call here just attaches the plan.
 */
export function startNextVersion(p: Product, week: number, weeklyBudget: number): Product {
  if (!canStartNextVersion(p)) return p;
  const targetMajor = majorVersion(p.version) + 1;
  return {
    ...p,
    nextVersion: {
      targetVersion: `${targetMajor}.0`,
      progress: 0,
      startedWeek: week,
      devBudget: Math.max(0, Math.round(weeklyBudget)),
    },
  };
}

/** Progress a vNext one tick. If it completes, apply its benefits and return the new product. */
function tickNextVersion(p: Product, events: GameEvent[], week: number, rng: RNG, team: TeamEffects = EMPTY_TEAM): Product {
  if (!p.nextVersion) return p;
  // vNext work is a little slower than a greenfield build — existing product has surface area.
  // Engineers drive raw throughput; PMs keep scope honest (the key to actually shipping vN).
  const pmBoost = team.pm * 0.6;
  const designBoost = team.designer * 0.3;
  const engineerDrive = team.engineer > 0 ? team.engineer * 1.5 : p.assignedEngineers.length * 1.5;
  const rawGain = 1.5 + engineerDrive + pmBoost + designBoost + p.nextVersion.devBudget / 2500;
  const progressGain = Math.min(12, rawGain * velocityPenalty(p));
  const progress = Math.min(100, p.nextVersion.progress + progressGain);
  if (progress < 100) {
    return { ...p, nextVersion: { ...p.nextVersion, progress } };
  }
  // Ship vNext! Restore health, boost quality, small user bump from "excitement".
  const newVersion = p.nextVersion.targetVersion;
  const bumpPct = rng.range(0.05, 0.12);
  const bumpedUsers = {
    enterprise: p.users.enterprise + Math.round(p.users.enterprise * bumpPct),
    smb:        p.users.smb        + Math.round(p.users.smb        * bumpPct),
    selfServe:  p.users.selfServe  + Math.round(p.users.selfServe  * bumpPct),
  };
  const quality = Math.min(98, Math.round(p.quality + rng.range(6, 14) + team.designer * 2));
  const health = Math.min(100, Math.round((p.health + 100) / 2 + rng.range(3, 8))); // pull toward 100
  // Marketing roles amplify the "refresh" moment. Engineers show up for the changelog, marketers amplify it.
  const engBuzz = team.engineer > 0 ? team.engineer * 3 : p.assignedEngineers.length * 4;
  const buzz = Math.round(Math.min(100, 55 + engBuzz + team.marketing * 6 + rng.range(0, 15)));
  events.push({
    id: `ev_${week}_vship_${p.id}`,
    week, severity: "good",
    message: `${p.name} ${newVersion} shipped. Refresh buzz ${buzz}/100 — quality up, users ticking up, aging clock reset. ${vShipFlavor(rng)}`,
    relatedProductId: p.id,
  });
  // If the product was declining, a vNext drags it back to "launched".
  const nextStage = p.stage === "declining" ? "launched" : p.stage;
  // Shipping a major version pays down roughly 60% of tech debt — the team
  // just reworked most of the code. Not a full reset: some legacy sticks around.
  const newDebt = Math.max(0, Math.round((p.techDebt ?? 0) * 0.4));
  return {
    ...p,
    version: newVersion,
    quality,
    health,
    users: bumpedUsers,
    launchBuzz: buzz,
    stage: nextStage,
    weeksAtStage: nextStage === p.stage ? p.weeksAtStage : 0,
    nextVersion: undefined,
    techDebt: newDebt,
  };
}

function vShipFlavor(rng: RNG): string {
  return rng.pick([
    "Existing customers are posting screenshots unprompted.",
    "The changelog is longer than the original launch post.",
    "Support tickets dropped 20% overnight. For now.",
    "Two analysts upgraded their rating. The rest are still asleep.",
  ]);
}

/** Determine which stage a product should be in this week (may return same stage). */
export function advanceProductStage(
  p: Product, events: GameEvent[], week: number, rng: RNG, team: TeamEffects = EMPTY_TEAM,
): Product {
  let np = { ...p, ageWeeks: p.ageWeeks + 1, weeksAtStage: p.weeksAtStage + 1 };
  // Progress any in-flight vNext before we evaluate stage transitions this tick.
  np = tickNextVersion(np, events, week, rng, team);

  switch (np.stage) {
    case "concept":
      // Concept auto-promotes when player begins dev (devBudget > 0)
      if (np.devBudget > 0) { np = enterStage(np, "dev", week); }
      break;

    case "dev": {
      // devProgress gained per week depends on budget, engineers, and PM focus.
      // When called without a team snapshot (tests, isolated usage), fall back to raw headcount
      // with the old per-head multiplier so legacy tests still pass.
      const engineerDrive = team.engineer > 0
        ? team.engineer * 2
        : np.assignedEngineers.length * 2;
      const pmBoost = team.pm * 0.7;
      const rawDevGain = 4 + engineerDrive + pmBoost + np.devBudget / 1800;
      // Tech debt slows dev velocity: at debt=0 you get full speed, at debt=100 half speed.
      const progressGain = Math.min(14, rawDevGain * velocityPenalty(np));
      np.devProgress = Math.min(100, np.devProgress + progressGain);
      if (np.devProgress >= 100) {
        // Ship! Quality reflects dev time — rushed products start weaker.
        // Designers add real polish; engineering polish falls back to raw head count.
        const designPolish = team.designer * 6;
        const engPolish = team.engineer > 0 ? team.engineer * 3 : np.assignedEngineers.length * 3;
        np.quality = Math.max(30, Math.min(98, 50 + (np.weeksAtStage - 6) * 2 + designPolish + engPolish));
        // Launch buzz leans on marketing charisma + engineering-driven demos/content.
        const marketingBuzz = team.marketing * 8;
        const engBuzz = team.engineer > 0 ? team.engineer * 5 : np.assignedEngineers.length * 8;
        np.launchBuzz = Math.round(Math.min(100, 30 + engBuzz + marketingBuzz + rng.range(0, 25)));
        np.version = "1.0";
        np = enterStage(np, "launched", week);
        np.weeksSinceLaunch = 0;
        np.launchedWeek = week;
        events.push({
          id: `ev_${week}_launch_${np.id}`,
          week, severity: "good",
          message: `${np.name} shipped. Launch week buzz: ${np.launchBuzz}/100. ${launchFlavor(np, rng)}`,
          relatedProductId: np.id,
        });
      }
      break;
    }

    case "launched":
      np.weeksSinceLaunch += 1;
      // After ~8 weeks, move to mature if still healthy
      if (np.weeksAtStage >= 8 && np.health > 55) { np = enterStage(np, "mature", week); }
      else if (np.health < 35) { np = enterStage(np, "declining", week); }
      break;

    case "mature":
      np.weeksSinceLaunch += 1;
      if (np.health < 45) { np = enterStage(np, "declining", week); }
      break;

    case "declining": {
      np.weeksSinceLaunch += 1;
      const tu = totalUsers(np);
      if (np.health < 15 || tu < 20) {
        np = enterStage(np, "eol", week);
        events.push({
          id: `ev_${week}_eol_${np.id}`,
          week, severity: "warn",
          message: `${np.name} is being sunset. The last ${tu} users have been offered migration help.`,
          relatedProductId: np.id,
        });
      }
      break;
    }

    case "eol":
      // remains eol
      break;
  }

  return np;
}

function enterStage(p: Product, stage: ProductStage, _week: number): Product {
  return { ...p, stage, weeksAtStage: 0 };
}

function launchFlavor(p: Product, rng: RNG): string {
  const hot = (p.launchBuzz ?? 0) > 70;
  const cool = (p.launchBuzz ?? 0) < 35;
  if (hot) return rng.pick([
    "The Product Hunt crowd is pleased.",
    "Your homepage buckled for an hour, but in the good way.",
    "Several strangers on LinkedIn have called it 'a paradigm shift.'",
  ]);
  if (cool) return rng.pick([
    "Nobody noticed. That's fine. Building audience is the long game.",
    "The launch tweet got 12 likes. Eleven from employees.",
    "HN frontpage it was not.",
  ]);
  return rng.pick([
    "Modest launch day. The work now is retention.",
    "A few dozen signups trickled in. Keep cooking.",
    "Respectable debut. Next week matters more.",
  ]);
}
