import { describe, it, expect } from "vitest";
import { demandFor, effectiveTrendMultiplier, trendIntensity } from "@/game/market";
import type { MarketTrend } from "@/game/types";

function trend(over: Partial<MarketTrend> = {}): MarketTrend {
  return {
    kind: "ai-boom",
    label: "AI boom",
    affects: ["dev-tools", "application"],
    demandMultiplier: 1.5,
    startedWeek: 0,
    durationWeeks: 20,
    rampWeeks: 4,
    fadeWeeks: 4,
    ...over,
  };
}

describe("trendIntensity: ramp / plateau / fade", () => {
  it("is 0 before the trend starts", () => {
    const t = trend({ startedWeek: 10 });
    expect(trendIntensity(t, 5)).toBe(0);
  });

  it("is 0 once the trend has expired", () => {
    const t = trend({ startedWeek: 0, durationWeeks: 20 });
    expect(trendIntensity(t, 20)).toBe(0);
    expect(trendIntensity(t, 30)).toBe(0);
  });

  it("climbs during the ramp phase", () => {
    const t = trend({ startedWeek: 0, rampWeeks: 4, fadeWeeks: 4, durationWeeks: 20 });
    const at0 = trendIntensity(t, 0);
    const at1 = trendIntensity(t, 1);
    const at2 = trendIntensity(t, 2);
    expect(at0).toBeGreaterThan(0);
    expect(at0).toBeLessThan(1);
    expect(at1).toBeGreaterThan(at0);
    expect(at2).toBeGreaterThan(at1);
  });

  it("holds at 1 on the plateau between ramp and fade", () => {
    const t = trend({ startedWeek: 0, rampWeeks: 4, fadeWeeks: 4, durationWeeks: 20 });
    // Plateau covers weeks 4..15 inclusive (fadeStart = 20 - 4 = 16)
    for (let w = 4; w < 16; w++) {
      expect(trendIntensity(t, w)).toBe(1);
    }
  });

  it("fades back down during the fade phase", () => {
    const t = trend({ startedWeek: 0, rampWeeks: 4, fadeWeeks: 4, durationWeeks: 20 });
    // fadeStart = 16, so 16..19 are fade
    const at16 = trendIntensity(t, 16);
    const at18 = trendIntensity(t, 18);
    const at19 = trendIntensity(t, 19);
    expect(at16).toBeGreaterThan(0);
    expect(at18).toBeLessThan(at16);
    expect(at19).toBeLessThan(at18);
    expect(at19).toBeGreaterThanOrEqual(0);
  });

  it("legacy trend without ramp/fade fields snaps to full intensity while active", () => {
    const t: MarketTrend = {
      kind: "ai-boom", label: "AI boom", affects: ["application"],
      demandMultiplier: 1.3, startedWeek: 0, durationWeeks: 10,
      // no rampWeeks / fadeWeeks — legacy save shape
    };
    expect(trendIntensity(t, 0)).toBe(1);
    expect(trendIntensity(t, 5)).toBe(1);
    expect(trendIntensity(t, 9)).toBe(1);
    expect(trendIntensity(t, 10)).toBe(0);
  });
});

describe("effectiveTrendMultiplier", () => {
  it("returns 1 (neutral) before the trend starts", () => {
    const t = trend({ startedWeek: 10 });
    expect(effectiveTrendMultiplier(t, 5)).toBe(1);
  });

  it("returns the peak when on the plateau", () => {
    const t = trend({ startedWeek: 0, rampWeeks: 4, fadeWeeks: 4, durationWeeks: 20, demandMultiplier: 1.5 });
    expect(effectiveTrendMultiplier(t, 10)).toBeCloseTo(1.5, 5);
  });

  it("interpolates between neutral and peak during ramp/fade", () => {
    const t = trend({ startedWeek: 0, rampWeeks: 4, fadeWeeks: 4, durationWeeks: 20, demandMultiplier: 1.5 });
    const mid = effectiveTrendMultiplier(t, 1); // mid-ramp
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(1.5);
  });

  it("negative trends interpolate correctly (a 0.7 trend at half intensity = 0.85)", () => {
    const t = trend({ demandMultiplier: 0.7, rampWeeks: 0, fadeWeeks: 0, durationWeeks: 10 });
    // Fake intensity 0.5 by constructing a trend mid-ramp
    const t2 = trend({ demandMultiplier: 0.7, rampWeeks: 4, fadeWeeks: 4, durationWeeks: 20 });
    // at week 1 of a 4-week ramp, intensity = 2/5 = 0.4
    const i = trendIntensity(t2, 1);
    expect(effectiveTrendMultiplier(t2, 1)).toBeCloseTo(1 + (0.7 - 1) * i, 5);
  });
});

describe("demandFor: category aggregation", () => {
  it("returns 1 with no active trends", () => {
    expect(demandFor("application", [])).toBe(1);
  });

  it("ignores trends that don't affect the category", () => {
    const t = trend({ affects: ["embedded"] });
    expect(demandFor("application", [t], 10)).toBe(1);
  });

  it("multiplies multiple applicable trends together", () => {
    const t1 = trend({ kind: "ai-boom", affects: ["application"], demandMultiplier: 1.2, rampWeeks: 0, fadeWeeks: 0, durationWeeks: 10 });
    const t2 = trend({ kind: "creative-surge", affects: ["application"], demandMultiplier: 1.1, rampWeeks: 0, fadeWeeks: 0, durationWeeks: 10 });
    expect(demandFor("application", [t1, t2], 5)).toBeCloseTo(1.2 * 1.1, 5);
  });

  it("ramp/fade is respected when a week is supplied", () => {
    const t = trend({ startedWeek: 0, rampWeeks: 4, fadeWeeks: 4, durationWeeks: 20, demandMultiplier: 1.5, affects: ["application"] });
    const atPlateau = demandFor("application", [t], 10);
    const atRamp    = demandFor("application", [t], 1);
    expect(atPlateau).toBeGreaterThan(atRamp);
    expect(atPlateau).toBeCloseTo(1.5, 5);
  });

  it("without weekNow, legacy snap-on behavior is preserved (peak used)", () => {
    const t = trend({ demandMultiplier: 1.5, affects: ["application"] });
    expect(demandFor("application", [t])).toBeCloseTo(1.5, 5);
  });
});
