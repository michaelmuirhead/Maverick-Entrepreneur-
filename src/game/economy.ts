/**
 * Macro-economic cycle: boom / stable / recession.
 *
 * The phase is persistent world state that drifts slowly — typical phase runs 30-60 weeks.
 * Transitions are sampled against a small Markov matrix once a minimum dwell time is met.
 * `intensity` ramps from 0 at the phase transition up to 1 after ~8 weeks, so a recession
 * takes a couple months to fully bite rather than flipping overnight.
 *
 * Downstream code never hard-branches on phase — it just reads the continuous multipliers
 * (demand/funding/valuation/churn/wage) so new phases can be added without a rewrite.
 */

import type { EconomyPhase, EconomyState, GameEvent, GameState } from "./types";
import type { RNG } from "./rng";

const RAMP_WEEKS = 8;

/** Fresh economy at t=0. Games start in a stable phase at full intensity. */
export function initEconomy(): EconomyState {
  return {
    phase: "stable",
    intensity: 1.0,
    phaseStartedWeek: 0,
    minDurationWeeks: 24,
  };
}

/**
 * Markov transition matrix. Given the current phase, probability per WEEK of flipping
 * to each destination. Sums to <=1 per row; remainder = stay.
 *
 * Tuned so expected dwell times are roughly:
 *   boom:      ~30 weeks
 *   stable:    ~45 weeks
 *   recession: ~35 weeks
 *
 * And the system has a mild bias back toward "stable" from the extremes.
 */
const TRANSITIONS: Record<EconomyPhase, Partial<Record<EconomyPhase, number>>> = {
  boom:      { stable: 0.025, recession: 0.008 },
  stable:    { boom: 0.011, recession: 0.012 },
  recession: { stable: 0.025, boom: 0.003 },
};

/** Dwell time required before we even roll for a transition. Stops rapid flip-flopping. */
function minDwellFor(phase: EconomyPhase): number {
  switch (phase) {
    case "boom":      return 18;
    case "stable":    return 20;
    case "recession": return 22;
  }
}

/**
 * Advance the economy one week. Returns the new state and pushes a single flavor event
 * if the phase flipped. Ramps intensity smoothly toward 1 otherwise.
 */
export function advanceEconomy(
  prev: EconomyState,
  weekNow: number,
  events: GameEvent[],
  rng: RNG,
): EconomyState {
  const weeksIn = weekNow - prev.phaseStartedWeek;

  // Step 1: maybe transition.
  let phase = prev.phase;
  let phaseStartedWeek = prev.phaseStartedWeek;
  let transitioned = false;
  if (weeksIn >= prev.minDurationWeeks) {
    const row = TRANSITIONS[prev.phase];
    let roll = rng.range(0, 1);
    for (const dest of Object.keys(row) as EconomyPhase[]) {
      const p = row[dest] ?? 0;
      if (roll < p) {
        phase = dest;
        phaseStartedWeek = weekNow;
        transitioned = true;
        break;
      }
      roll -= p;
    }
  }

  // Step 2: ramp intensity. After a transition, start at a small floor so effects
  // aren't instant; over RAMP_WEEKS we climb to 1. In "stable" we converge to 1 faster —
  // "stable" is the baseline the other phases are measured against.
  let intensity: number;
  if (transitioned) {
    intensity = phase === "stable" ? 0.2 : 0.15;
  } else {
    const newWeeksIn = weekNow - phaseStartedWeek;
    intensity = Math.min(1, newWeeksIn / RAMP_WEEKS + (phase === "stable" ? 0.3 : 0.1));
  }

  if (transitioned) {
    events.push({
      id: `ev_${weekNow}_econ_${phase}`,
      week: weekNow,
      severity: phase === "boom" ? "good" : phase === "recession" ? "bad" : "info",
      message: phaseFlavor(phase, rng),
    });
  }

  return {
    phase,
    intensity,
    phaseStartedWeek,
    minDurationWeeks: minDwellFor(phase),
  };
}

function phaseFlavor(phase: EconomyPhase, rng: RNG): string {
  switch (phase) {
    case "boom":
      return rng.pick([
        "Economic boom: capital is cheap, every category is hiring, term sheets leak onto Twitter before they're signed.",
        "The macro just flipped bullish. Deals that were 'maybe next quarter' are suddenly 'can you start Monday.'",
        "Tailwinds everywhere. Your runway math just got more forgiving — for now.",
      ]);
    case "recession":
      return rng.pick([
        "Recession officially here. Buyers ghost, term sheets shrink, and 'focus on profitability' returns to every earnings call.",
        "The music stopped. Expect longer sales cycles, pricier capital, and a lot of 'let's revisit in Q3.'",
        "Macro turned cold. Valuations compress industry-wide — your pipeline will feel it within a month.",
      ]);
    case "stable":
      return rng.pick([
        "Macro normalized. Not euphoric, not catastrophic — buyers are buying and investors are investing at reasonable speed.",
        "Economy settled into a steady lane. Fundamentals matter again.",
        "The market's back to being boring — in the good sense. Plan accordingly.",
      ]);
  }
}

// ---------- Readouts used by other systems ----------

/**
 * Demand-side multiplier for signups. Stable = 1.0. Boom leans +, recession leans -.
 * Intensity smooths the edges so the impact ramps in.
 */
export function economyDemandMultiplier(e: EconomyState): number {
  const peak = e.phase === "boom" ? 1.15 : e.phase === "recession" ? 0.82 : 1.0;
  return 1 + (peak - 1) * e.intensity;
}

/**
 * Churn multiplier — recessions chew especially hard on self-serve, but we keep this
 * a single blended number and let `segments.ts` apply its own sensitivity per segment.
 */
export function economyChurnMultiplier(e: EconomyState): number {
  const peak = e.phase === "boom" ? 0.9 : e.phase === "recession" ? 1.35 : 1.0;
  return 1 + (peak - 1) * e.intensity;
}

/**
 * Valuation multiplier — used by the M&A / acquisition engine when pricing rivals,
 * and later by the IPO system. Boom → premium, recession → fire sale.
 */
export function economyValuationMultiplier(e: EconomyState): number {
  const peak = e.phase === "boom" ? 1.5 : e.phase === "recession" ? 0.65 : 1.0;
  return 1 + (peak - 1) * e.intensity;
}

/**
 * Funding multiplier — scales round amounts and availability probability.
 * Boom → investors throwing term sheets; recession → capital drought.
 */
export function economyFundingMultiplier(e: EconomyState): number {
  const peak = e.phase === "boom" ? 1.35 : e.phase === "recession" ? 0.6 : 1.0;
  return 1 + (peak - 1) * e.intensity;
}

/**
 * Wage multiplier — boom jacks up comp (poaching wars), recession cools it.
 * Applied to new-hire salary asks; existing employees aren't retroactively repriced.
 */
export function economyWageMultiplier(e: EconomyState): number {
  const peak = e.phase === "boom" ? 1.2 : e.phase === "recession" ? 0.9 : 1.0;
  return 1 + (peak - 1) * e.intensity;
}

/** Pretty label for the UI. */
export function economyLabel(phase: EconomyPhase): string {
  switch (phase) {
    case "boom":      return "Boom";
    case "stable":    return "Stable";
    case "recession": return "Recession";
  }
}

/** One-line narrative of the current macro, for the dashboard. */
export function economyDescription(e: EconomyState): string {
  const intensity = e.intensity < 0.4 ? "early" : e.intensity < 0.8 ? "ramping" : "in full swing";
  switch (e.phase) {
    case "boom":      return `Boom ${intensity} — capital is cheap, buyers are aggressive, poaching is fierce.`;
    case "recession": return `Recession ${intensity} — budgets frozen, churn elevated, valuations cut.`;
    case "stable":    return `Stable macro — normal sales cycles, normal fundraising, normal burn tolerance.`;
  }
}

/**
 * Convenience: back-compat shim for tests that want the "all phases" list.
 */
export const ALL_ECONOMY_PHASES: EconomyPhase[] = ["boom", "stable", "recession"];

/** Read a GameState and return its economy (migrations should have populated this). */
export function economyOf(state: Pick<GameState, "economy">): EconomyState {
  return state.economy;
}
