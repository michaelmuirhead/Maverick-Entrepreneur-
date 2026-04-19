import { Competitor, CompetitorPersonality, Employee, GameEvent, GameState, ProductCategory } from "./types";
import { RNG } from "./rng";
import { applyPoachAttempt } from "./team";

/** Competitor pressure on player products in the same category, 0..1. */
export function pressureOn(category: ProductCategory, competitors: Competitor[]): number {
  const inCat = competitors.filter(c => c.category === category);
  if (inCat.length === 0) return 0;
  const totalStrength = inCat.reduce((s, c) => s + (c.strength * (0.4 + c.marketShare)), 0);
  // Balance: rivals can compress signup flow, but never strangle it. 0.75 ceiling
  // leaves the player at least 25% of baseline signups even in a crowded market.
  return Math.min(0.75, totalStrength / 400);
}

/** Default personality + stats for legacy competitors (from old saves without these fields). */
function withDefaults(c: Competitor): Competitor {
  if (c.personality && typeof c.cash === "number" && typeof c.headcount === "number" && c.fundingStage) return c;
  // Derive a personality from their aggression + marketShare if unset.
  const personality: CompetitorPersonality = c.personality
    ?? (c.aggression > 0.55 ? "aggressive"
        : c.marketShare > 0.12 ? "well-funded"
        : c.strength > 65 ? "enterprise"
        : "scrappy");
  const seedCash: Record<CompetitorPersonality, number> = {
    aggressive: 1_500_000, "well-funded": 6_000_000, scrappy: 700_000, enterprise: 4_000_000,
  };
  const seedHc: Record<CompetitorPersonality, number> = {
    aggressive: 15, "well-funded": 35, scrappy: 8, enterprise: 22,
  };
  return {
    ...c,
    personality,
    cash: c.cash ?? seedCash[personality],
    headcount: c.headcount ?? seedHc[personality],
    fundingStage: c.fundingStage ?? "seed",
  };
}

/**
 * Run one tick of the competitor AI. Each rival:
 *   1. Normalizes to its personality stats
 *   2. Pays internal burn, drifts strength
 *   3. Rolls one personality-weighted strategic move — feature strike, price cut,
 *      product launch, funding raise, poaching attempt, marquee signing, PR stunt.
 * Player-side consequences (employee going on notice, health hits) are written
 * to the shared `events` array and, for poaching, via the employees return channel.
 */
export function runCompetitorAi(
  state: GameState, events: GameEvent[], rng: RNG,
): { competitors: Competitor[]; employees: Employee[] } {
  let liveEmployees = state.employees;

  const nextCompetitors = state.competitors.map(raw => {
    const c = withDefaults(raw);

    // Drift + burn. Better-funded rivals drift upward faster, but burn cash.
    const burn = (c.headcount ?? 10) * 2_500; // ~weekly burn
    let strength = Math.min(100, c.strength + rng.range(-0.8, 1.3) * (1 + c.aggression));
    let marketShare = c.marketShare;
    let cash = Math.max(0, (c.cash ?? 0) - burn);
    let headcount = c.headcount ?? 10;
    let fundingStage = c.fundingStage ?? "seed";
    let lastFundingWeek = c.lastFundingWeek;

    const moveFreq = movePersonalityFrequency(c.personality ?? "scrappy");
    if (rng.chance(moveFreq)) {
      const move = pickMove(c.personality ?? "scrappy", rng);
      switch (move) {
        case "feature-strike": {
          const victim = state.products.find(p => p.category === c.category && ["launched","mature"].includes(p.stage));
          events.push({
            id: `ev_${state.week}_comp_feature_${c.id}`,
            week: state.week, severity: victim ? "bad" : "warn",
            message: victim
              ? `${c.name} shipped a ${featureWord(rng)} — direct hit on ${victim.name}'s feature set. Expect evals this week.`
              : `${c.name} shipped a ${featureWord(rng)}. Flashy, but not (yet) in your category.`,
          });
          strength = Math.min(100, strength + rng.int(2, 5));
          marketShare = Math.min(0.6, marketShare + 0.02);
          break;
        }
        case "price-cut": {
          events.push({
            id: `ev_${state.week}_comp_price_${c.id}`,
            week: state.week, severity: "warn",
            message: `${c.name} cut prices ${rng.int(15, 40)}% across the ${c.category} line. Procurement teams will notice.`,
          });
          marketShare = Math.min(0.55, marketShare + 0.025);
          break;
        }
        case "raise": {
          // Funding cooldown: no more than once every ~40 weeks.
          if (lastFundingWeek && state.week - lastFundingWeek < 40) break;
          const raised = raiseAmountFor(fundingStage);
          if (!raised) break;
          cash += raised.amount;
          headcount = Math.round(headcount * 1.5); // hire spree
          fundingStage = raised.nextStage;
          lastFundingWeek = state.week;
          strength = Math.min(100, strength + rng.int(4, 8));
          events.push({
            id: `ev_${state.week}_comp_raise_${c.id}`,
            week: state.week, severity: "bad",
            message: `${c.name} announced a ${raised.label} round — $${(raised.amount/1e6).toFixed(0)}M. War chest refilled, hiring aggressive.`,
          });
          break;
        }
        case "product-launch": {
          // Expand into an adjacent category OR deepen current one.
          const launchCat = rng.chance(0.4) ? rotateCategory(c.category, rng) : c.category;
          events.push({
            id: `ev_${state.week}_comp_launch_${c.id}`,
            week: state.week, severity: launchCat === c.category ? "warn" : "info",
            message: `${c.name} launched a new ${launchCat} product. ${launchFlavor(c.personality ?? "scrappy", rng)}`,
          });
          if (launchCat === c.category) {
            strength = Math.min(100, strength + rng.int(3, 6));
            marketShare = Math.min(0.6, marketShare + 0.03);
          }
          break;
        }
        case "poach": {
          liveEmployees = applyPoachAttempt(
            { ...state, employees: liveEmployees } as GameState, c, events, rng,
          );
          break;
        }
        case "marquee": {
          const logo = rng.pick(["Acme Corp", "Globex", "Initech", "Soylent", "Vehement Capital", "Pied Piper"]);
          events.push({
            id: `ev_${state.week}_comp_marquee_${c.id}`,
            week: state.week, severity: "warn",
            message: `${c.name} signed ${logo} on a multi-year deal. Expect sales intros to get frostier.`,
          });
          marketShare = Math.min(0.55, marketShare + 0.03);
          strength = Math.min(100, strength + rng.int(1, 3));
          break;
        }
        case "pr-stunt": {
          events.push({
            id: `ev_${state.week}_comp_pr_${c.id}`,
            week: state.week, severity: "info",
            message: `${c.name} ${rng.pick([
              "commissioned a mural outside the WeWork next door",
              "did a product drop on Product Hunt at 3am PST",
              "ran a billboard on the 101 that just said 'Try Us'",
              "sponsored a pickleball tournament",
            ])}. Minor pressure, major vibes.`,
          });
          break;
        }
      }
    }

    return {
      ...c,
      strength, marketShare, cash, headcount, fundingStage, lastFundingWeek,
      lastMoveWeek: state.week,
    };
  });

  return { competitors: nextCompetitors, employees: liveEmployees };
}

// --- Personality behaviours ---------------------------------------------------

function movePersonalityFrequency(p: CompetitorPersonality): number {
  // Percent chance per week of making ANY strategic move
  switch (p) {
    case "aggressive":   return 0.22;
    case "well-funded":  return 0.15;
    case "scrappy":      return 0.18;
    case "enterprise":   return 0.10;
  }
}

type Move = "feature-strike" | "price-cut" | "raise" | "product-launch" | "poach" | "marquee" | "pr-stunt";

function pickMove(p: CompetitorPersonality, rng: RNG): Move {
  // Each personality weights moves differently.
  const weights: Record<CompetitorPersonality, { item: Move; weight: number }[]> = {
    aggressive: [
      { item: "feature-strike", weight: 5 },
      { item: "price-cut",      weight: 4 },
      { item: "poach",          weight: 4 },
      { item: "pr-stunt",       weight: 2 },
      { item: "product-launch", weight: 1 },
      { item: "raise",          weight: 1 },
    ],
    "well-funded": [
      { item: "product-launch", weight: 5 },
      { item: "marquee",        weight: 4 },
      { item: "raise",          weight: 4 },
      { item: "poach",          weight: 3 },
      { item: "feature-strike", weight: 2 },
    ],
    scrappy: [
      { item: "pr-stunt",       weight: 5 },
      { item: "product-launch", weight: 3 },
      { item: "feature-strike", weight: 3 },
      { item: "price-cut",      weight: 2 },
      { item: "poach",          weight: 1 },
    ],
    enterprise: [
      { item: "marquee",        weight: 6 },
      { item: "raise",          weight: 3 },
      { item: "product-launch", weight: 2 },
      { item: "feature-strike", weight: 2 },
      { item: "poach",          weight: 1 },
    ],
  };
  return rng.weighted(weights[p]);
}

function raiseAmountFor(stage: Competitor["fundingStage"]): { amount: number; label: string; nextStage: NonNullable<Competitor["fundingStage"]> } | null {
  if (stage === "pre-seed") return { amount: 2_000_000,  label: "Seed",     nextStage: "seed" };
  if (stage === "seed")     return { amount: 12_000_000, label: "Series A", nextStage: "series-a" };
  if (stage === "series-a") return { amount: 35_000_000, label: "Series B", nextStage: "series-b" };
  return null; // at Series B — no more moves in this lane
}

function rotateCategory(cat: ProductCategory, rng: RNG): ProductCategory {
  const all: ProductCategory[] = ["productivity","dev-tools","analytics","crm","creative","infrastructure"];
  return rng.pick(all.filter(c => c !== cat));
}

function featureWord(rng: RNG): string {
  return rng.pick([
    "integrations suite", "AI copilot", "pricing overhaul", "mobile app v2",
    "white-label mode", "enterprise SSO bundle", "marketplace beta", "API v2",
  ]);
}

function launchFlavor(p: CompetitorPersonality, rng: RNG): string {
  switch (p) {
    case "aggressive":
      return rng.pick(["They're not subtle about who the target is.", "They name-checked you in the launch blog."]);
    case "well-funded":
      return rng.pick(["Full launch — paid media, roadshow, the works.", "They hosted a 400-person event at a rented airport hangar."]);
    case "scrappy":
      return rng.pick(["The launch tweet has a typo. Typo is doing numbers.", "It's weird. It might work."]);
    case "enterprise":
      return rng.pick(["Two analyst firms already wrote positively about it.", "They're targeting their top 100 accounts directly."]);
  }
}

/** Increase competitor share when player product declines; ambient drift. */
export function adjustSharesFromPlayerHealth(state: GameState): Competitor[] {
  return state.competitors; // prototype: leave as-is; could be extended later.
}
