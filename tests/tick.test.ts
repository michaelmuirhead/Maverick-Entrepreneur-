import { describe, it, expect } from "vitest";
import { newGame } from "@/game/init";
import { advanceWeek, getHeadlineStats } from "@/game/tick";
import { computeMrr, runwayMonths, fundingOffer, applyFundingRound } from "@/game/finance";
import { weeklyRevenue, maintenanceCost, advanceProductStage } from "@/game/products";
import { weeklyPayroll } from "@/game/team";
import { makeRng } from "@/game/rng";
import type { GameEvent, GameState, Product } from "@/game/types";
import { SCHEMA_VERSION } from "@/game/types";

// Helper: snapshot a fresh state for a deterministic seed
function baseGame(overrides: Partial<Parameters<typeof newGame>[0]> = {}): GameState {
  return newGame({
    companyName: "Maverick Labs",
    founderName: "Test Founder",
    archetype: "technical",
    startingCash: "bootstrapped",
    startingCategory: "productivity",
    seed: "unit-test-seed",
    ...overrides,
  });
}

describe("newGame / init", () => {
  it("produces a valid starting state", () => {
    const s = baseGame();
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.week).toBe(0);
    expect(s.year).toBe(1);
    expect(s.quarter).toBe(1);
    expect(s.finance.cash).toBe(50_000);
    expect(s.products).toHaveLength(1);
    expect(s.products[0].stage).toBe("concept");
    expect(s.employees).toHaveLength(2); // founder + cofounder
    expect(s.employees.find(e => e.role === "founder")).toBeDefined();
    expect(s.competitors.length).toBeGreaterThanOrEqual(5);
    expect(s.company.stage).toBe("pre-seed");
  });

  it("angel-backed starts at seed stage with $250k", () => {
    const s = baseGame({ startingCash: "angel-backed" });
    expect(s.finance.cash).toBe(250_000);
    expect(s.company.stage).toBe("seed");
    expect(s.finance.rounds).toHaveLength(1);
    expect(s.finance.rounds[0].label).toBe("Angel");
  });

  it("founder+cofounder equity sums to 1.0", () => {
    const s = baseGame();
    const founder = s.employees.find(e => e.role === "founder")!;
    const cofounder = s.employees.find(e => e.role !== "founder")!;
    expect((founder.equity ?? 0) + (cofounder.equity ?? 0)).toBeCloseTo(1.0, 2);
  });
});

describe("advanceWeek — determinism & purity", () => {
  it("is pure: calling twice on same input produces identical output", () => {
    const s = baseGame();
    const a = advanceWeek(s);
    const b = advanceWeek(s);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not mutate the input state", () => {
    const s = baseGame();
    const snapshot = JSON.stringify(s);
    advanceWeek(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("advances week counter by exactly 1", () => {
    const s = baseGame();
    const n = advanceWeek(s);
    expect(n.week).toBe(s.week + 1);
  });

  it("is reproducible across many ticks with the same seed", () => {
    const runA = (() => {
      let s = baseGame();
      for (let i = 0; i < 20; i++) s = advanceWeek(s);
      return s;
    })();
    const runB = (() => {
      let s = baseGame();
      for (let i = 0; i < 20; i++) s = advanceWeek(s);
      return s;
    })();
    expect(JSON.stringify(runA)).toBe(JSON.stringify(runB));
  });

  it("rolls year/quarter correctly", () => {
    let s = baseGame();
    // Advance 52 weeks -> year 2
    for (let i = 0; i < 52; i++) s = advanceWeek(s);
    expect(s.year).toBe(2);
    expect(s.week).toBe(52);
  });

  it("no-ops when gameOver is set", () => {
    const s: GameState = { ...baseGame(), gameOver: { reason: "ipo", week: 10, narrative: "fin" } };
    const n = advanceWeek(s);
    expect(n).toBe(s);
  });
});

describe("finance math", () => {
  it("weekly revenue is zero for concept-stage products", () => {
    const s = baseGame();
    expect(weeklyRevenue(s.products[0])).toBe(0);
  });

  it("computeMrr only counts live products", () => {
    const s = baseGame();
    const launched: Product = {
      ...s.products[0],
      stage: "launched",
      users: 100,
      pricePerUser: 20,
    };
    const concept: Product = { ...s.products[0], id: "p_concept", stage: "concept", users: 0 };
    const withProducts = { ...s, products: [launched, concept] };
    expect(computeMrr(withProducts)).toBe(100 * 20);
  });

  it("runwayMonths returns large number when burn is zero", () => {
    expect(runwayMonths(50_000, 0)).toBeGreaterThan(1000);
  });

  it("runwayMonths scales inversely with weekly burn", () => {
    const short = runwayMonths(50_000, 10_000);
    const long = runwayMonths(50_000, 1_000);
    expect(long).toBeGreaterThan(short);
  });

  it("fundingOffer returns null when product has no traction", () => {
    const s = baseGame();
    expect(fundingOffer(s)).toBeNull();
  });

  it("fundingOffer returns Seed for pre-seed with healthy launched product and MRR > $5k", () => {
    const s = baseGame();
    const boosted: GameState = {
      ...s,
      products: [{
        ...s.products[0],
        stage: "launched",
        health: 75,
        users: 500,
        pricePerUser: 20, // MRR = 10_000
      }],
    };
    const offer = fundingOffer(boosted);
    expect(offer?.label).toBe("Seed");
    expect(offer?.amount).toBe(2_000_000);
  });

  it("applyFundingRound adds cash and advances company stage", () => {
    const s = baseGame();
    const events: GameEvent[] = [];
    const offer = { label: "Seed" as const, amount: 2_000_000, postMoney: 10_000_000, dilution: 0.2 };
    const next = applyFundingRound(s, offer, events);
    expect(next.finance.cash).toBe(s.finance.cash + 2_000_000);
    expect(next.company.stage).toBe("seed");
    expect(next.finance.rounds.at(-1)?.label).toBe("Seed");
    expect(events.length).toBe(1);
  });

  it("advanceWeek subtracts payroll + maintenance from cash when no revenue", () => {
    const s = baseGame();
    const payroll = weeklyPayroll(s.employees); // founders are $0 so may be 0
    const maint = s.products.reduce((acc, p) => acc + maintenanceCost(p), 0);
    const expectedBurn = payroll + maint;
    const n = advanceWeek(s);
    // cash decreases by at most expectedBurn (no revenue yet — concept product)
    expect(n.finance.cash).toBeLessThanOrEqual(s.finance.cash);
    expect(s.finance.cash - n.finance.cash).toBeLessThanOrEqual(expectedBurn + 1);
  });
});

describe("bankruptcy flag", () => {
  it("fires when cash goes negative", () => {
    const s: GameState = {
      ...baseGame(),
      finance: { ...baseGame().finance, cash: 100 },
      employees: [
        ...baseGame().employees,
        {
          id: "e_expensive",
          name: "Expensive Hire",
          role: "engineer",
          level: 3,
          salary: 500_000, // huge salary -> weekly burn much larger than cash
          skill: 80,
          morale: 80,
          hiredWeek: 0,
        },
      ],
    };
    const n = advanceWeek(s);
    expect(n.gameOver).toBeDefined();
    expect(n.gameOver?.reason).toBe("bankrupt");
    expect(n.finance.cash).toBe(0);
  });
});

describe("product lifecycle transitions", () => {
  it("concept -> dev when devBudget is set", () => {
    const s = baseGame();
    const events: GameEvent[] = [];
    const rng = makeRng("tx-test");
    const p0: Product = { ...s.products[0], devBudget: 4000 };
    const p1 = advanceProductStage(p0, events, 1, rng);
    expect(p1.stage).toBe("dev");
  });

  it("dev -> launched once devProgress reaches 100", () => {
    const s = baseGame();
    const events: GameEvent[] = [];
    const rng = makeRng("launch-test");
    const p0: Product = {
      ...s.products[0],
      stage: "dev",
      devBudget: 10_000,
      devProgress: 95,
      assignedEngineers: [s.employees[0].id, s.employees[1].id],
      weeksAtStage: 5,
    };
    const p1 = advanceProductStage(p0, events, 2, rng);
    expect(p1.stage).toBe("launched");
    expect(p1.version).toBe("1.0");
    expect(p1.launchBuzz).toBeGreaterThan(0);
    expect(events.some(e => e.id.includes("launch"))).toBe(true);
  });

  it("declining product reaches eol when health is very low", () => {
    const s = baseGame();
    const events: GameEvent[] = [];
    const rng = makeRng("eol-test");
    const p0: Product = {
      ...s.products[0],
      stage: "declining",
      health: 5,
      users: 100,
      weeksAtStage: 4,
    };
    const p1 = advanceProductStage(p0, events, 10, rng);
    expect(p1.stage).toBe("eol");
    expect(events.some(e => e.id.includes("eol"))).toBe(true);
  });
});

describe("getHeadlineStats", () => {
  it("returns nonnegative values on a fresh game", () => {
    const s = baseGame();
    const stats = getHeadlineStats(s);
    expect(stats.mrr).toBeGreaterThanOrEqual(0);
    expect(stats.monthlyBurn).toBeGreaterThanOrEqual(0);
    expect(stats.runwayMo).toBeGreaterThan(0);
  });
});

describe("history caps", () => {
  it("weeklyRevenueHistory does not exceed 52 entries after many ticks", () => {
    let s = baseGame();
    for (let i = 0; i < 80; i++) s = advanceWeek(s);
    expect(s.finance.weeklyRevenueHistory.length).toBeLessThanOrEqual(52);
    expect(s.finance.weeklyBurnHistory.length).toBeLessThanOrEqual(52);
  });
});
