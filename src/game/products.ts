import { GameEvent, Product, ProductCategory, ProductStage } from "./types";
import { RNG } from "./rng";

/** Weekly cost to keep a product alive (hosting, support, upkeep, marketing, vNext dev). */
export function maintenanceCost(p: Product): number {
  if (p.stage === "concept" || p.stage === "eol") return 0;
  const dev = p.stage === "dev" ? p.devBudget : 0;
  // Marketing only burns once a product is live. On concept/dev we ignore it (there's nothing to market).
  const marketing = ["launched", "mature", "declining"].includes(p.stage) ? (p.marketingBudget ?? 0) : 0;
  // vNext dev burn runs alongside live-product maintenance until it ships.
  const vNextDev = p.nextVersion ? Math.max(0, p.nextVersion.devBudget) : 0;
  const users = Math.max(0, p.users);
  // Base overhead: a product in dev has almost no hosting/support cost, so charge $200/wk
  // (tools, CI, staging). Once live, hosting + support + on-call bumps that to $500/wk.
  const base = p.stage === "dev" ? 200 : 500;
  // Per-user hosting stays flat at $0.10/wk across live stages.
  return dev + marketing + vNextDev + base + users * 0.1;
}

/**
 * Marketing efficiency — how much a $/week spend translates into signup multiplier.
 * Diminishing returns: first $1k is gold, $20k is mostly vanity. Caps at ~2.0x.
 */
export function marketingMultiplier(p: Product): number {
  const spend = Math.max(0, p.marketingBudget ?? 0);
  if (spend <= 0) return 1;
  // Logarithmic scaling: $0 -> 1.0, $1k -> ~1.25, $5k -> ~1.6, $20k -> ~1.95
  return 1 + Math.min(1, Math.log10(1 + spend / 500) / 1.7);
}

/** Weekly revenue = users * price/mo / 4.3 (converts monthly to weekly). */
export function weeklyRevenue(p: Product): number {
  if (!["launched", "mature", "declining"].includes(p.stage)) return 0;
  return (p.users * p.pricePerUser) / 4.3;
}

/** Health decays over time — tech ages, market shifts. Quality buffers the decay. */
export function agingDecay(p: Product, rng: RNG): number {
  if (!["launched", "mature", "declining"].includes(p.stage)) return 0;
  // Base decay increases with age. Good quality slows it. A little randomness.
  const ageFactor = Math.min(p.weeksSinceLaunch / 52, 3); // more decay as years pass
  const qualityBuffer = (p.quality - 50) / 200; // +/- 0.25
  const base = 0.3 + ageFactor * 0.25 - qualityBuffer;
  const jitter = rng.range(-0.1, 0.2);
  return Math.max(0, base + jitter);
}

/** Signups per week when launched. Depends on health, category demand, buzz, competitors, marketing spend. */
export function signupsThisWeek(
  p: Product,
  opts: { marketDemand: number; competitorPressure: number; rng: RNG },
): number {
  if (!["launched", "mature"].includes(p.stage)) return 0;
  // S-curve around health 50
  const healthFactor = 1 / (1 + Math.exp(-(p.health - 50) / 12));
  const buzzBoost = Math.max(0, (p.launchBuzz ?? 0) - 50) / 50 * Math.exp(-p.weeksSinceLaunch / 8);
  const base = 8 + healthFactor * 40 + buzzBoost * 30;
  const pressure = 1 - Math.min(0.8, opts.competitorPressure);
  const marketing = marketingMultiplier(p);
  const churnInjection = opts.rng.range(0.85, 1.2);
  return Math.max(0, Math.round(base * opts.marketDemand * pressure * marketing * churnInjection));
}

/** Weekly churn rate as a fraction of current users. */
export function churnRate(p: Product): number {
  const healthPenalty = Math.max(0, (60 - p.health)) / 100; // worse health -> more churn
  const stagePenalty = p.stage === "declining" ? 0.02 : p.stage === "mature" ? 0.005 : 0.003;
  return stagePenalty + healthPenalty * 0.03;
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
function tickNextVersion(p: Product, events: GameEvent[], week: number, rng: RNG): Product {
  if (!p.nextVersion) return p;
  const engineersOnIt = p.assignedEngineers.length;
  // vNext work is a little slower than a greenfield build — existing product has surface area.
  const progressGain = Math.min(10, 1.5 + engineersOnIt * 1.5 + p.nextVersion.devBudget / 2500);
  const progress = Math.min(100, p.nextVersion.progress + progressGain);
  if (progress < 100) {
    return { ...p, nextVersion: { ...p.nextVersion, progress } };
  }
  // Ship vNext! Restore health, boost quality, small user bump from "excitement".
  const newVersion = p.nextVersion.targetVersion;
  const userBump = Math.round(p.users * rng.range(0.05, 0.12));
  const quality = Math.min(98, Math.round(p.quality + rng.range(6, 14)));
  const health = Math.min(100, Math.round((p.health + 100) / 2 + rng.range(3, 8))); // pull toward 100
  const buzz = Math.round(Math.min(100, 55 + engineersOnIt * 4 + rng.range(0, 15)));
  events.push({
    id: `ev_${week}_vship_${p.id}`,
    week, severity: "good",
    message: `${p.name} ${newVersion} shipped. Refresh buzz ${buzz}/100 — quality up, users ticking up, aging clock reset. ${vShipFlavor(rng)}`,
    relatedProductId: p.id,
  });
  // If the product was declining, a vNext drags it back to "launched".
  const nextStage = p.stage === "declining" ? "launched" : p.stage;
  return {
    ...p,
    version: newVersion,
    quality,
    health,
    users: p.users + userBump,
    launchBuzz: buzz,
    stage: nextStage,
    weeksAtStage: nextStage === p.stage ? p.weeksAtStage : 0,
    nextVersion: undefined,
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
export function advanceProductStage(p: Product, events: GameEvent[], week: number, rng: RNG): Product {
  let np = { ...p, ageWeeks: p.ageWeeks + 1, weeksAtStage: p.weeksAtStage + 1 };
  // Progress any in-flight vNext before we evaluate stage transitions this tick.
  np = tickNextVersion(np, events, week, rng);

  switch (np.stage) {
    case "concept":
      // Concept auto-promotes when player begins dev (devBudget > 0)
      if (np.devBudget > 0) { np = enterStage(np, "dev", week); }
      break;

    case "dev": {
      // devProgress gained per week depends on budget & engineers
      const engineersOnIt = np.assignedEngineers.length;
      const progressGain = Math.min(12, 3 + engineersOnIt * 2 + np.devBudget / 2000);
      np.devProgress = Math.min(100, np.devProgress + progressGain);
      if (np.devProgress >= 100) {
        // Ship! Quality reflects dev time — rushed products start weaker.
        np.quality = Math.max(30, Math.min(95, 50 + (np.weeksAtStage - 6) * 2 + engineersOnIt * 3));
        np.launchBuzz = Math.round(Math.min(100, 30 + engineersOnIt * 8 + rng.range(0, 25)));
        np.version = "1.0";
        np = enterStage(np, "launched", week);
        np.weeksSinceLaunch = 0;
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

    case "declining":
      np.weeksSinceLaunch += 1;
      if (np.health < 15 || np.users < 20) {
        np = enterStage(np, "eol", week);
        events.push({
          id: `ev_${week}_eol_${np.id}`,
          week, severity: "warn",
          message: `${np.name} is being sunset. The last ${np.users} users have been offered migration help.`,
          relatedProductId: np.id,
        });
      }
      break;

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
