import { Competitor, GameEvent, GameState, Product, ProductCategory } from "./types";
import { RNG } from "./rng";

/** Competitor pressure on player products in the same category, 0..1. */
export function pressureOn(category: ProductCategory, competitors: Competitor[]): number {
  const inCat = competitors.filter(c => c.category === category);
  if (inCat.length === 0) return 0;
  const totalStrength = inCat.reduce((s, c) => s + (c.strength * (0.4 + c.marketShare)), 0);
  return Math.min(0.95, totalStrength / 250);
}

/** Each week, competitors may act: ship features, raise funding, or acquire. */
export function runCompetitorAi(state: GameState, events: GameEvent[], rng: RNG): Competitor[] {
  return state.competitors.map(c => {
    // Strength drifts upward as they mature; more for aggressive ones.
    let strength = Math.min(100, c.strength + rng.range(-1, 1.5) * (1 + c.aggression));
    let marketShare = c.marketShare;

    // Occasional disruptive move
    if (rng.chance(0.02 * (0.5 + c.aggression))) {
      // find player product in same category — if any, hit its health
      const victim = state.products.find(p => p.category === c.category && ["launched","mature"].includes(p.stage));
      const move = rng.pick([
        "shipped a major feature",
        "cut prices aggressively",
        "signed a marquee customer",
        "ran an outlandish billboard campaign",
        "open-sourced their core product",
      ]);
      events.push({
        id: `ev_${state.week}_comp_${c.id}`,
        week: state.week,
        severity: victim ? "bad" : "warn",
        message: victim
          ? `${c.name} ${move}. Expect some of ${victim.name}'s pipeline to evaluate alternatives this week.`
          : `${c.name} ${move}. Noted, but not yet your problem.`,
      });
      strength = Math.min(100, strength + rng.int(1, 4));
      marketShare = Math.min(0.6, marketShare + 0.02);
    }

    return { ...c, strength, marketShare, lastMoveWeek: state.week };
  });
}

/** Increase competitor share when player product declines; ambient drift. */
export function adjustSharesFromPlayerHealth(state: GameState): Competitor[] {
  return state.competitors; // prototype: leave as-is; could be extended later.
}
