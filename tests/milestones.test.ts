import { describe, it, expect } from "vitest";
import { newGame } from "@/game/init";
import { nextMilestone } from "@/game/milestones";
import type { GameState, Product, SegmentedUsers } from "@/game/types";
import { derivePricing, SEGMENT_MIX, ZERO_USERS } from "@/game/segments";

function seg(n: number): SegmentedUsers {
  if (n <= 0) return { ...ZERO_USERS };
  const mix = SEGMENT_MIX.productivity;
  const ent = Math.round(n * mix.enterprise);
  const smb = Math.round(n * mix.smb);
  return { enterprise: ent, smb, selfServe: Math.max(0, n - ent - smb) };
}

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
      users: seg(30),
      pricing: derivePricing(20), // blended MRR well below $5k — still progress target
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
      users: seg(500),
      pricing: derivePricing(20),
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
      users: seg(50_000),
      pricing: derivePricing(20),
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
