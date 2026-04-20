/**
 * Hype / wishlist pre-launch mechanics.
 *
 * The hype model is a decaying meter: every tick it sheds a fraction of its
 * value, and marketing spend or quality-driven word-of-mouth pushes it back
 * up. A fraction of the current hype banks into persistent wishlists each
 * week. These tests pin down the essential shape of the model — exponential
 * decay, marketing gain with diminishing returns, and monotonic wishlist
 * accumulation — so future tweaks to the tunables don't silently break the
 * launch-sales pipeline.
 */

import { describe, it, expect } from "vitest";
import { tickHype, applyShowcaseBurst, hypeDescriptor, forecastFirstWeekSales } from "@/game/studio/hype";
import { makeGame } from "@/game/studio/games";
import type { Game } from "@/game/studio/types";

/** Helper — build a fresh in-dev Game with overrides applied. */
function fresh(overrides: Partial<Game> = {}): Game {
  const g = makeGame({
    id: "g_test",
    title: "Test Title",
    genre: "rpg",
    scope: "indie",
    platforms: ["pc-steam"],
    startedWeek: 0,
  });
  return { ...g, ...overrides };
}

describe("tickHype — decay", () => {
  it("with no marketing and no quality, hype decays weekly toward zero", () => {
    let g = fresh({ hype: 50, quality: 0, marketingBudget: 0 });
    const trace: number[] = [g.hype];
    for (let i = 0; i < 12; i++) {
      g = tickHype(g);
      trace.push(g.hype);
    }
    // Each step is strictly smaller than the previous (monotonic decay).
    for (let i = 1; i < trace.length; i++) {
      expect(trace[i]).toBeLessThan(trace[i - 1]);
    }
    // Half-life is ~8 weeks. After 8 ticks, we expect hype ≈ 25.
    expect(trace[8]).toBeLessThan(30);
    expect(trace[8]).toBeGreaterThan(20);
  });

  it("clamps hype between 0 and 100", () => {
    const overSaturated = fresh({ hype: 95, quality: 100, marketingBudget: 50_000 });
    const next = tickHype(overSaturated);
    expect(next.hype).toBeLessThanOrEqual(100);
    expect(next.hype).toBeGreaterThanOrEqual(0);

    const depleted = fresh({ hype: 0.01, quality: 0, marketingBudget: 0 });
    const nextDepleted = tickHype(depleted);
    expect(nextDepleted.hype).toBeGreaterThanOrEqual(0);
  });

  it("is pure — does not mutate the input game", () => {
    const g = fresh({ hype: 40, marketingBudget: 2000 });
    const snapshot = JSON.stringify(g);
    tickHype(g);
    expect(JSON.stringify(g)).toBe(snapshot);
  });
});

describe("tickHype — marketing", () => {
  it("marketing spend pushes hype higher than no-spend baseline", () => {
    const base = fresh({ hype: 20, quality: 20, marketingBudget: 0 });
    const marketed = fresh({ hype: 20, quality: 20, marketingBudget: 5_000 });
    const baseNext = tickHype(base).hype;
    const marketedNext = tickHype(marketed).hype;
    expect(marketedNext).toBeGreaterThan(baseNext);
  });

  it("marketing shows diminishing returns near the ceiling", () => {
    // At hype 20 (far from the 60 ceiling) marketing should add meaningful hype.
    // At hype 58 (just shy of ceiling) the same spend should add much less.
    const low = fresh({ hype: 20, quality: 0, marketingBudget: 5_000 });
    const high = fresh({ hype: 58, quality: 0, marketingBudget: 5_000 });
    const lowGain = tickHype(low).hype - (low.hype * 0.917);
    const highGain = tickHype(high).hype - (high.hype * 0.917);
    expect(lowGain).toBeGreaterThan(highGain);
  });

  it("post-launch games don't accumulate new wishlists even with marketing", () => {
    const postLaunch = fresh({
      stage: "released",
      hype: 30,
      wishlist: 1000,
      marketingBudget: 10_000,
      launched: {
        week: 5, reviewScore: 70, firstWeekSales: 500, totalSold: 500,
        priceAtLaunch: 20, weeklyTailSales: [500],
      },
    });
    const next = tickHype(postLaunch);
    // Wishlist should not grow post-launch.
    expect(next.wishlist).toBe(1000);
  });
});

describe("tickHype — wishlist accumulation", () => {
  it("pre-launch wishlist is monotonically non-decreasing", () => {
    let g = fresh({ hype: 40, quality: 30, marketingBudget: 2000 });
    let prev = g.wishlist;
    for (let i = 0; i < 10; i++) {
      g = tickHype(g);
      expect(g.wishlist).toBeGreaterThanOrEqual(prev);
      prev = g.wishlist;
    }
  });

  it("higher hype yields more wishlists accumulated per week", () => {
    const low = fresh({ hype: 10, quality: 0, marketingBudget: 0, wishlist: 0 });
    const hot = fresh({ hype: 80, quality: 0, marketingBudget: 0, wishlist: 0 });
    const lowNext = tickHype(low).wishlist;
    const hotNext = tickHype(hot).wishlist;
    expect(hotNext).toBeGreaterThan(lowNext);
  });
});

describe("applyShowcaseBurst", () => {
  it("adds hype and records the appearance", () => {
    const g = fresh({ hype: 20 });
    const burst = applyShowcaseBurst(g, 10, "summer-game-fest", 20);
    expect(burst.hype).toBeGreaterThan(g.hype);
    expect(burst.mostRecentShowcaseWeek).toBe(10);
    expect(burst.showcaseAppearances).toHaveLength(1);
    expect(burst.showcaseAppearances[0].showcase).toBe("summer-game-fest");
  });

  it("AAA scope amplifies the burst more than indie", () => {
    const indie = fresh({ hype: 20, scope: "indie" });
    const aaa = fresh({ hype: 20, scope: "AAA" });
    const indieBurst = applyShowcaseBurst(indie, 10, "the-game-awards", 20).hype;
    const aaaBurst = applyShowcaseBurst(aaa, 10, "the-game-awards", 20).hype;
    expect(aaaBurst).toBeGreaterThan(indieBurst);
  });

  it("clamps hype at 100 even for huge bursts", () => {
    const g = fresh({ hype: 95, scope: "AAA" });
    const burst = applyShowcaseBurst(g, 10, "the-game-awards", 200);
    expect(burst.hype).toBeLessThanOrEqual(100);
  });

  it("accumulates multiple showcase entries in order", () => {
    let g = fresh({ hype: 10 });
    g = applyShowcaseBurst(g, 5, "summer-game-fest", 15);
    g = applyShowcaseBurst(g, 10, "gamescom", 15);
    expect(g.showcaseAppearances).toHaveLength(2);
    expect(g.showcaseAppearances[0].week).toBe(5);
    expect(g.showcaseAppearances[1].week).toBe(10);
  });
});

describe("hypeDescriptor", () => {
  it("maps hype values to descriptor buckets", () => {
    expect(hypeDescriptor(0)).toBe("none");
    expect(hypeDescriptor(5)).toBe("none");
    expect(hypeDescriptor(15)).toBe("buzz");
    expect(hypeDescriptor(40)).toBe("rising");
    expect(hypeDescriptor(70)).toBe("hot");
    expect(hypeDescriptor(90)).toBe("viral");
    expect(hypeDescriptor(100)).toBe("viral");
  });
});

describe("forecastFirstWeekSales", () => {
  it("higher review score yields more forecast sales (holding hype/wishlist constant)", () => {
    const g = fresh({ hype: 50, wishlist: 10_000 });
    const low = forecastFirstWeekSales(g, 50);
    const high = forecastFirstWeekSales(g, 90);
    expect(high).toBeGreaterThan(low);
  });

  it("higher hype yields more forecast sales (holding wishlist/review constant)", () => {
    const low = fresh({ hype: 10, wishlist: 10_000 });
    const hot = fresh({ hype: 80, wishlist: 10_000 });
    expect(forecastFirstWeekSales(hot, 70)).toBeGreaterThan(forecastFirstWeekSales(low, 70));
  });

  it("zero wishlist + zero hype yields near-zero forecast", () => {
    const g = fresh({ hype: 0, wishlist: 0 });
    expect(forecastFirstWeekSales(g, 70)).toBe(0);
  });
});
