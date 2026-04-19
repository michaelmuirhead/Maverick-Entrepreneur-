import { GameEvent, GameState, MarketTrend, MarketTrendKind, ProductCategory } from "./types";
import { RNG } from "./rng";

const TREND_CATALOG: Record<MarketTrendKind, { label: string; affects: ProductCategory[]; multiplier: number; dur: [number, number] }> = {
  "ai-boom":              { label: "AI boom",                affects: ["dev-tools","productivity","analytics","creative"], multiplier: 1.35, dur: [12, 24] },
  "privacy-crackdown":    { label: "Privacy crackdown",      affects: ["analytics","crm"],                                    multiplier: 0.8,  dur: [8, 16] },
  "recession":            { label: "Recession",              affects: ["productivity","crm","creative","dev-tools","analytics","infrastructure"], multiplier: 0.75, dur: [16, 32] },
  "dev-tool-renaissance": { label: "Dev-tool renaissance",   affects: ["dev-tools","infrastructure"],                         multiplier: 1.4,  dur: [10, 18] },
  "creative-surge":       { label: "Creative tools surge",   affects: ["creative","productivity"],                            multiplier: 1.25, dur: [8, 14] },
  "enterprise-freeze":    { label: "Enterprise budget freeze", affects: ["crm","analytics","infrastructure"],                 multiplier: 0.7,  dur: [12, 20] },
};

/** Chance per week to spawn a new trend; expires old ones. */
export function updateTrends(state: GameState, events: GameEvent[], rng: RNG): MarketTrend[] {
  // Expire old trends
  const active = state.trends.filter(t => state.week - t.startedWeek < t.durationWeeks);
  for (const t of state.trends) {
    if (state.week - t.startedWeek >= t.durationWeeks) {
      events.push({ id: `ev_${state.week}_trend_end_${t.kind}`, week: state.week, severity: "info",
        message: `Trend ended: ${t.label}. Market conditions normalize.` });
    }
  }

  // Chance to spawn a new one (cap at 2 simultaneous)
  if (active.length < 2 && rng.chance(0.07)) {
    const kinds = (Object.keys(TREND_CATALOG) as MarketTrendKind[]).filter(k => !active.some(a => a.kind === k));
    if (kinds.length > 0) {
      const kind = rng.pick(kinds);
      const meta = TREND_CATALOG[kind];
      const trend: MarketTrend = {
        kind, label: meta.label, affects: meta.affects,
        demandMultiplier: meta.multiplier,
        startedWeek: state.week,
        durationWeeks: rng.int(meta.dur[0], meta.dur[1]),
      };
      active.push(trend);
      events.push({
        id: `ev_${state.week}_trend_${kind}`,
        week: state.week,
        severity: meta.multiplier >= 1 ? "good" : "warn",
        message: `Market shift: ${meta.label}. ${trendFlavor(kind, meta.multiplier >= 1, rng)}`,
      });
    }
  }
  return active;
}

/** Combined demand multiplier for a given product category, factoring in all active trends. */
export function demandFor(category: ProductCategory, trends: MarketTrend[]): number {
  let m = 1.0;
  for (const t of trends) if (t.affects.includes(category)) m *= t.demandMultiplier;
  return m;
}

function trendFlavor(kind: MarketTrendKind, positive: boolean, rng: RNG): string {
  if (positive) {
    return rng.pick([
      "Every pitch deck is suddenly 40% more confident.",
      "Expect inbound. Expect envy. Expect both.",
      "Your category just got tailwind. Don't squander it.",
    ]);
  }
  return rng.pick([
    "Procurement calls are now twice as long and half as productive.",
    "Buyers got cagey. Pipeline will feel it.",
    "Brace for slower close rates.",
  ]);
}
