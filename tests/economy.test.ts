import { describe, it, expect } from "vitest";
import {
  ALL_ECONOMY_PHASES,
  advanceEconomy,
  economyChurnMultiplier,
  economyDemandMultiplier,
  economyDescription,
  economyFundingMultiplier,
  economyLabel,
  economyValuationMultiplier,
  economyWageMultiplier,
  initEconomy,
} from "@/game/economy";
import type { EconomyPhase, EconomyState, GameEvent } from "@/game/types";
import { makeRng } from "@/game/rng";

function step(prev: EconomyState, weekNow: number, seed = "econ"): { next: EconomyState; events: GameEvent[] } {
  const rng = makeRng(seed + ":" + weekNow);
  const events: GameEvent[] = [];
  const next = advanceEconomy(prev, weekNow, events, rng);
  return { next, events };
}

describe("economy: initEconomy", () => {
  it("starts in a stable phase with full intensity", () => {
    const e = initEconomy();
    expect(e.phase).toBe("stable");
    expect(e.intensity).toBe(1.0);
    expect(e.phaseStartedWeek).toBe(0);
    expect(e.minDurationWeeks).toBeGreaterThan(0);
  });
});

describe("economy: multipliers", () => {
  it("stable with full intensity returns neutral multipliers", () => {
    const e = initEconomy();
    expect(economyDemandMultiplier(e)).toBeCloseTo(1.0, 5);
    expect(economyChurnMultiplier(e)).toBeCloseTo(1.0, 5);
    expect(economyValuationMultiplier(e)).toBeCloseTo(1.0, 5);
    expect(economyFundingMultiplier(e)).toBeCloseTo(1.0, 5);
    expect(economyWageMultiplier(e)).toBeCloseTo(1.0, 5);
  });

  it("boom biases demand, valuation, funding, wages up — and churn down", () => {
    const e: EconomyState = { phase: "boom", intensity: 1, phaseStartedWeek: 0, minDurationWeeks: 18 };
    expect(economyDemandMultiplier(e)).toBeGreaterThan(1);
    expect(economyValuationMultiplier(e)).toBeGreaterThan(1);
    expect(economyFundingMultiplier(e)).toBeGreaterThan(1);
    expect(economyWageMultiplier(e)).toBeGreaterThan(1);
    expect(economyChurnMultiplier(e)).toBeLessThan(1);
  });

  it("recession flips demand/valuation/funding/wages down and churn up", () => {
    const e: EconomyState = { phase: "recession", intensity: 1, phaseStartedWeek: 0, minDurationWeeks: 22 };
    expect(economyDemandMultiplier(e)).toBeLessThan(1);
    expect(economyValuationMultiplier(e)).toBeLessThan(1);
    expect(economyFundingMultiplier(e)).toBeLessThan(1);
    expect(economyWageMultiplier(e)).toBeLessThan(1);
    expect(economyChurnMultiplier(e)).toBeGreaterThan(1);
  });

  it("intensity=0 collapses all multipliers to 1 regardless of phase", () => {
    for (const phase of ALL_ECONOMY_PHASES) {
      const e: EconomyState = { phase, intensity: 0, phaseStartedWeek: 0, minDurationWeeks: 18 };
      expect(economyDemandMultiplier(e)).toBeCloseTo(1, 5);
      expect(economyChurnMultiplier(e)).toBeCloseTo(1, 5);
      expect(economyValuationMultiplier(e)).toBeCloseTo(1, 5);
      expect(economyFundingMultiplier(e)).toBeCloseTo(1, 5);
      expect(economyWageMultiplier(e)).toBeCloseTo(1, 5);
    }
  });

  it("intensity interpolates linearly between neutral and peak", () => {
    const full: EconomyState = { phase: "boom", intensity: 1, phaseStartedWeek: 0, minDurationWeeks: 18 };
    const half: EconomyState = { phase: "boom", intensity: 0.5, phaseStartedWeek: 0, minDurationWeeks: 18 };
    const fullDelta = economyDemandMultiplier(full) - 1;
    const halfDelta = economyDemandMultiplier(half) - 1;
    expect(halfDelta).toBeCloseTo(fullDelta / 2, 5);
  });
});

describe("economy: advanceEconomy dwell time", () => {
  it("never transitions before minDurationWeeks elapsed", () => {
    let e: EconomyState = { phase: "stable", intensity: 1, phaseStartedWeek: 0, minDurationWeeks: 30 };
    for (let w = 1; w < 30; w++) {
      const { next } = step(e, w);
      expect(next.phase).toBe("stable");
      e = next;
    }
  });

  it("can transition after minDuration elapses (across enough RNG attempts)", () => {
    // Try lots of different seeds; at least one should transition within the first
    // 40 weeks past the minimum dwell.
    let anyTransitioned = false;
    for (let seedN = 0; seedN < 200 && !anyTransitioned; seedN++) {
      let e: EconomyState = { phase: "stable", intensity: 1, phaseStartedWeek: 0, minDurationWeeks: 4 };
      for (let w = 1; w <= 60 && !anyTransitioned; w++) {
        const { next } = step(e, w, `dwell-${seedN}`);
        if (next.phase !== "stable") anyTransitioned = true;
        e = next;
      }
    }
    expect(anyTransitioned).toBe(true);
  });

  it("emits exactly one event on phase transition", () => {
    // Force a transition by placing us well past min dwell and scanning seeds.
    for (let seedN = 0; seedN < 500; seedN++) {
      const e: EconomyState = { phase: "stable", intensity: 1, phaseStartedWeek: 0, minDurationWeeks: 0 };
      const { next, events } = step(e, 10, `flip-${seedN}`);
      if (next.phase !== e.phase) {
        expect(events).toHaveLength(1);
        expect(events[0]!.id).toContain("econ_");
        expect(events[0]!.week).toBe(10);
        return;
      }
    }
    throw new Error("No transition observed across 500 seeds — transition probability likely broken.");
  });
});

describe("economy: intensity ramp after transition", () => {
  it("post-transition intensity starts low and climbs toward 1 over multiple weeks", () => {
    // Simulate "we just transitioned into recession at week 10"
    let e: EconomyState = { phase: "recession", intensity: 0.15, phaseStartedWeek: 10, minDurationWeeks: 22 };
    const samples: number[] = [e.intensity];
    for (let w = 11; w <= 20; w++) {
      // Use a seed that keeps us in the recession phase (dwell not yet met anyway)
      const { next } = step(e, w, "ramp");
      samples.push(next.intensity);
      e = next;
    }
    // Monotone non-decreasing (allow tiny float noise)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]! - 1e-9);
    }
    expect(samples[samples.length - 1]).toBeGreaterThan(samples[0]!);
    expect(samples[samples.length - 1]).toBeLessThanOrEqual(1);
  });

  it("stable phase converges to 1 given enough time", () => {
    let e: EconomyState = { phase: "stable", intensity: 0.2, phaseStartedWeek: 0, minDurationWeeks: 40 };
    for (let w = 1; w <= 12; w++) {
      const { next } = step(e, w, "stable-ramp");
      e = next;
    }
    expect(e.intensity).toBeCloseTo(1, 2);
  });
});

describe("economy: label + description", () => {
  it("economyLabel returns a capitalized title for each phase", () => {
    expect(economyLabel("boom")).toMatch(/^Boom$/);
    expect(economyLabel("stable")).toMatch(/^Stable$/);
    expect(economyLabel("recession")).toMatch(/^Recession$/);
  });

  it("economyDescription mentions boom/recession wording when in that phase", () => {
    const boom: EconomyState = { phase: "boom", intensity: 1, phaseStartedWeek: 0, minDurationWeeks: 18 };
    const rec: EconomyState = { phase: "recession", intensity: 1, phaseStartedWeek: 0, minDurationWeeks: 22 };
    expect(economyDescription(boom).toLowerCase()).toContain("boom");
    expect(economyDescription(rec).toLowerCase()).toContain("recession");
  });
});

describe("economy: determinism", () => {
  it("same seed and input state produce the same next state", () => {
    const input: EconomyState = { phase: "stable", intensity: 0.7, phaseStartedWeek: 5, minDurationWeeks: 20 };
    const a = step(input, 40, "detA").next;
    const b = step(input, 40, "detA").next;
    expect(a).toEqual(b);
  });
});

describe("economy: phase coverage", () => {
  it("ALL_ECONOMY_PHASES contains exactly boom/stable/recession", () => {
    const set = new Set<EconomyPhase>(ALL_ECONOMY_PHASES);
    expect(set.has("boom")).toBe(true);
    expect(set.has("stable")).toBe(true);
    expect(set.has("recession")).toBe(true);
    expect(set.size).toBe(3);
  });
});
