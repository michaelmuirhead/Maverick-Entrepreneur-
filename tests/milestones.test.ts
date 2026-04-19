import { describe, it, expect } from "vitest";
import { newGame } from "@/game/init";
import { nextMilestone } from "@/game/milestones";
import type { GameState, Product } from "@/game/types";

function baseGame(): GameState {
  return newGame({
    companyName: "Maverick Labs",
    founderName: "Test Founder",
    archetype: "technical",
    startingCash: "bootstrapped",
    startingCategory: "productivity",
    seed: "milestones-test-seed",
  });
}

describe("nextMilestone", () => {
  it("tells a fresh player to ship their first product", () => {
    const s = baseGame();
    const m = nextMilestone(s);
    expect(m.kind).toBe("goal");
    expect(m.title.toLowerCase()).toMatch(/ship/);
  });

  it("tracks dev progress when a product is being built", () => {
    const s = baseGame();
    const building: Product = { ...s.products[0], stage: "dev", devProgress: 42 };
    const m = nextMilestone({ ...s, products: [building] });
    expect(m.kind).toBe("goal");
    expect(m.title.toLowerCase()).toMatch(/ship/);
    expect(m.progress).toBeCloseTo(0.42, 2);
  });

  it("shifts to MRR target after first product ships (pre-seed)", () => {
    const s = baseGame();
    const live: Product = {
      ...s.products[0],
      stage: "launched",
      users: 30,
      pricePerUser: 20, // MRR = 600
    };
    const m = nextMilestone({ ...s, products: [live] });
    expect(m.kind).toBe("goal");
    expect(m.title).toMatch(/\$5k MRR/);
    expect(m.progress).toBeGreaterThan(0);
    expect(m.progress).toBeLessThan(1);
  });

  it("surfaces a Seed offer once the product has traction", () => {
    const s = baseGame();
    const live: Product = {
      ...s.products[0],
      stage: "launched",
      health: 75,
      users: 500,
      pricePerUser: 20, // MRR = 10_000
    };
    const m = nextMilestone({ ...s, products: [live] });
    expect(m.kind).toBe("offer");
    expect(m.title.toLowerCase()).toContain("seed");
  });

  it("emits a runway warning that overrides other milestones", () => {
    const s = baseGame();
    // Force a tiny cash balance and a history showing meaningful burn so runway < 3.
    const starved: GameState = {
      ...s,
      finance: {
        ...s.finance,
        cash: 2_000,
        weeklyBurnHistory: [5_000, 5_000, 5_000, 5_000],
      },
    };
    const m = nextMilestone(starved);
    expect(m.kind).toBe("warn");
    expect(m.title.toLowerCase()).toContain("runway");
  });

  it("congratulates the Series B player", () => {
    const s = baseGame();
    const live: Product = {
      ...s.products[0],
      stage: "mature",
      health: 80,
      users: 50_000,
      pricePerUser: 20,
    };
    const scaled: GameState = {
      ...s,
      company: { ...s.company, stage: "series-b" },
      products: [live],
      finance: { ...s.finance, cash: 50_000_000 },
    };
    const m = nextMilestone(scaled);
    expect(m.kind).toBe("goal");
    expect(m.progress).toBe(1);
  });
});
