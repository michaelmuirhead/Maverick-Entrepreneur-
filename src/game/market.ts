import { GameEvent, GameState, MarketTrend, MarketTrendKind, ProductCategory } from "./types";
import { RNG } from "./rng";

/**
 * Trend catalog. `multiplier` is the *peak* the trend reaches at full intensity.
 * `dur` is the full life [min, max] in weeks, including ramp + plateau + fade.
 * `ramp` / `fade` are the shoulder widths; the middle is a plateau at peak.
 */
const TREND_CATALOG: Record<MarketTrendKind, {
  label: string;
  affects: ProductCategory[];
  multiplier: number;
  dur: [number, number];
  ramp: [number, number];
  fade: [number, number];
}> = {
  "ai-boom":              { label: "AI boom",                affects: ["dev-tools","application","content-media","security-it"], multiplier: 1.35, dur: [12, 24], ramp: [3, 5], fade: [3, 6] },
  "privacy-crackdown":    { label: "Privacy crackdown",      affects: ["application","content-media"],                          multiplier: 0.8,  dur: [8, 16],  ramp: [2, 4], fade: [3, 5] },
  "recession":            { label: "Recession",              affects: ["application","enterprise","content-media","dev-tools","custom","finance-ops"], multiplier: 0.75, dur: [16, 32], ramp: [4, 6], fade: [4, 6] },
  "dev-tool-renaissance": { label: "Dev-tool renaissance",   affects: ["dev-tools","system"],                                   multiplier: 1.4,  dur: [10, 18], ramp: [2, 4], fade: [3, 5] },
  "creative-surge":       { label: "Creative tools surge",   affects: ["content-media","application"],                          multiplier: 1.25, dur: [8, 14],  ramp: [2, 3], fade: [2, 4] },
  "enterprise-freeze":    { label: "Enterprise budget freeze", affects: ["enterprise","custom","finance-ops"],                  multiplier: 0.7,  dur: [12, 20], ramp: [3, 5], fade: [3, 5] },
  "security-scare":       { label: "Security breach headlines", affects: ["security-it","finance-ops"],                         multiplier: 1.5,  dur: [6, 14],  ramp: [1, 2], fade: [3, 5] },
  "hardware-cycle":       { label: "Hardware refresh cycle",    affects: ["embedded","system"],                                 multiplier: 1.3,  dur: [10, 20], ramp: [2, 4], fade: [3, 5] },
  "crypto-winter":        { label: "Crypto winter",           affects: ["finance-ops","dev-tools"],                              multiplier: 0.78, dur: [12, 28], ramp: [3, 5], fade: [4, 6] },
  "remote-work-surge":    { label: "Remote work surge",       affects: ["content-media","dev-tools","application"],              multiplier: 1.22, dur: [14, 26], ramp: [3, 5], fade: [4, 6] },
  "supply-shock":         { label: "Supply chain shock",      affects: ["embedded","system"],                                    multiplier: 0.72, dur: [8, 16],  ramp: [2, 3], fade: [3, 5] },
  "compliance-wave":      { label: "Compliance wave",         affects: ["finance-ops","security-it","enterprise"],               multiplier: 1.28, dur: [12, 22], ramp: [3, 5], fade: [3, 5] },
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
      const ramp = rng.int(meta.ramp[0], meta.ramp[1]);
      const fade = rng.int(meta.fade[0], meta.fade[1]);
      // Make sure duration is at least ramp+fade+2 so there's a real plateau.
      const minDur = ramp + fade + 2;
      const dur = Math.max(minDur, rng.int(meta.dur[0], meta.dur[1]));
      const trend: MarketTrend = {
        kind, label: meta.label, affects: meta.affects,
        demandMultiplier: meta.multiplier,
        startedWeek: state.week,
        durationWeeks: dur,
        rampWeeks: ramp,
        fadeWeeks: fade,
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

/**
 * Current intensity of a trend for a given absolute week, 0..1. Handles the ramp → plateau → fade.
 * Back-compat: a trend without rampWeeks/fadeWeeks is treated as always at peak (legacy snap behavior).
 */
export function trendIntensity(t: MarketTrend, weekNow: number): number {
  const age = weekNow - t.startedWeek;
  if (age < 0 || age >= t.durationWeeks) return 0;
  const ramp = t.rampWeeks ?? 0;
  const fade = t.fadeWeeks ?? 0;
  if (ramp === 0 && fade === 0) return 1;
  if (age < ramp) return (age + 1) / (ramp + 1);
  const fadeStart = t.durationWeeks - fade;
  if (age >= fadeStart) {
    const fadeAge = age - fadeStart;
    return Math.max(0, 1 - (fadeAge + 1) / (fade + 1));
  }
  return 1;
}

/**
 * Effective demand multiplier for a single trend at a given week, factoring in its
 * ramp/fade intensity. A trend with peak 1.5 at intensity 0.5 yields 1.25
 * (neutral + half the boost). Similarly, a 0.8 peak at intensity 0.5 yields 0.9.
 */
export function effectiveTrendMultiplier(t: MarketTrend, weekNow: number): number {
  const i = trendIntensity(t, weekNow);
  return 1 + (t.demandMultiplier - 1) * i;
}

/** Combined demand multiplier for a given product category, factoring in all active trends. */
export function demandFor(category: ProductCategory, trends: MarketTrend[], weekNow?: number): number {
  let m = 1.0;
  for (const t of trends) {
    if (!t.affects.includes(category)) continue;
    m *= typeof weekNow === "number" ? effectiveTrendMultiplier(t, weekNow) : t.demandMultiplier;
  }
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
