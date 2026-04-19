import { GameEvent, Product, ProductCategory, ProductStage } from "./types";
import { RNG } from "./rng";

/** Weekly cost to keep a product alive (hosting, support, upkeep). */
export function maintenanceCost(p: Product): number {
  if (p.stage === "concept" || p.stage === "eol") return 0;
  const base = p.stage === "dev" ? p.devBudget : 0;
  const users = Math.max(0, p.users);
  // Rough: $0.10/user/week hosting + $500 base + dev budget
  return base + 500 + users * 0.1;
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

/** Signups per week when launched. Depends on health, category demand, buzz, competitors. */
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
  const churnInjection = opts.rng.range(0.85, 1.2);
  return Math.max(0, Math.round(base * opts.marketDemand * pressure * churnInjection));
}

/** Weekly churn rate as a fraction of current users. */
export function churnRate(p: Product): number {
  const healthPenalty = Math.max(0, (60 - p.health)) / 100; // worse health -> more churn
  const stagePenalty = p.stage === "declining" ? 0.02 : p.stage === "mature" ? 0.005 : 0.003;
  return stagePenalty + healthPenalty * 0.03;
}

/** Determine which stage a product should be in this week (may return same stage). */
export function advanceProductStage(p: Product, events: GameEvent[], week: number, rng: RNG): Product {
  let np = { ...p, ageWeeks: p.ageWeeks + 1, weeksAtStage: p.weeksAtStage + 1 };

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
