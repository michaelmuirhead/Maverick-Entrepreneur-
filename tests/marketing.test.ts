import { describe, it, expect } from "vitest";
import { newGame } from "@/game/init";
import { marketingMultiplier, maintenanceCost, signupsThisWeek } from "@/game/products";
import { makeRng } from "@/game/rng";
import type { GameState, Product } from "@/game/types";

function baseGame(): GameState {
  return newGame({
    companyName: "Maverick Labs",
    founderName: "Test Founder",
    archetype: "technical",
    startingCash: "bootstrapped",
    startingCategory: "productivity",
    seed: "marketing-test-seed",
  });
}

function liveProduct(overrides: Partial<Product> = {}): Product {
  const s = baseGame();
  return {
    ...s.products[0],
    stage: "launched",
    users: 200,
    pricePerUser: 20,
    health: 70,
    quality: 70,
    launchBuzz: 50,
    weeksSinceLaunch: 2,
    marketingBudget: 0,
    ...overrides,
  };
}

describe("marketingMultiplier", () => {
  it("is 1.0 when spend is zero", () => {
    expect(marketingMultiplier(liveProduct({ marketingBudget: 0 }))).toBe(1);
  });

  it("monotonically increases with spend", () => {
    const a = marketingMultiplier(liveProduct({ marketingBudget: 500 }));
    const b = marketingMultiplier(liveProduct({ marketingBudget: 2_000 }));
    const c = marketingMultiplier(liveProduct({ marketingBudget: 10_000 }));
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("diminishes — doubling spend at high levels barely moves the needle", () => {
    const mid = marketingMultiplier(liveProduct({ marketingBudget: 5_000 }));
    const high = marketingMultiplier(liveProduct({ marketingBudget: 10_000 }));
    // Going from $5k -> $10k should add less than going from $0 -> $5k did.
    const firstGain = mid - 1;
    const secondGain = high - mid;
    expect(secondGain).toBeLessThan(firstGain);
  });

  it("never exceeds the 2x cap", () => {
    const insane = marketingMultiplier(liveProduct({ marketingBudget: 10_000_000 }));
    expect(insane).toBeLessThanOrEqual(2.0001);
  });

  it("negative or missing budget is treated as zero", () => {
    expect(marketingMultiplier(liveProduct({ marketingBudget: -1000 }))).toBe(1);
    const mystery = { ...liveProduct() } as Product;
    // @ts-expect-error — simulate old save file without the field
    delete mystery.marketingBudget;
    expect(marketingMultiplier(mystery)).toBe(1);
  });
});

describe("maintenanceCost + marketing", () => {
  it("ignores marketing on concept-stage products", () => {
    const p: Product = { ...liveProduct({ stage: "concept", marketingBudget: 10_000 }) };
    expect(maintenanceCost(p)).toBe(0);
  });

  it("includes marketing on launched products", () => {
    const base = maintenanceCost(liveProduct({ marketingBudget: 0 }));
    const withAds = maintenanceCost(liveProduct({ marketingBudget: 3_000 }));
    expect(withAds - base).toBe(3_000);
  });

  it("ignores marketing on dev-stage products (pre-launch)", () => {
    const p = liveProduct({ stage: "dev", marketingBudget: 5_000, devBudget: 2_000, users: 0 });
    // dev maintenance = devBudget + base 500 + users*0.1; marketing should NOT count
    expect(maintenanceCost(p)).toBe(2_000 + 500);
  });
});

describe("signupsThisWeek + marketing multiplier", () => {
  it("boosts signups compared to zero-spend baseline", () => {
    // Same RNG, same state — only marketing budget differs.
    const runWith = (mktBudget: number) => {
      const p = liveProduct({ marketingBudget: mktBudget });
      const rng = makeRng(`mkt-test:${mktBudget}`);
      return signupsThisWeek(p, { marketDemand: 1, competitorPressure: 0.2, rng });
    };
    // Run many trials and compare means — signups are stochastic per-tick.
    const trials = 40;
    let zero = 0, spend = 0;
    for (let i = 0; i < trials; i++) {
      const p0 = liveProduct({ marketingBudget: 0 });
      const p1 = liveProduct({ marketingBudget: 5_000 });
      const rng0 = makeRng(`mkt-mean:${i}:zero`);
      const rng1 = makeRng(`mkt-mean:${i}:spend`);
      zero += signupsThisWeek(p0, { marketDemand: 1, competitorPressure: 0.2, rng: rng0 });
      spend += signupsThisWeek(p1, { marketDemand: 1, competitorPressure: 0.2, rng: rng1 });
    }
    expect(spend).toBeGreaterThan(zero);
    // Silence unused var warning
    void runWith;
  });

  it("returns zero for non-live stages regardless of budget", () => {
    const rng = makeRng("not-live");
    const concept = liveProduct({ stage: "concept", marketingBudget: 20_000 });
    const dev = liveProduct({ stage: "dev", marketingBudget: 20_000 });
    expect(signupsThisWeek(concept, { marketDemand: 1, competitorPressure: 0, rng })).toBe(0);
    expect(signupsThisWeek(dev, { marketDemand: 1, competitorPressure: 0, rng })).toBe(0);
  });
});
