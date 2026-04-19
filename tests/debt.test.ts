import { describe, it, expect } from "vitest";
import type { Employee, GameEvent, Product } from "@/game/types";
import {
  velocityPenalty,
  churnPenalty,
  decayPenalty,
  debtGainFromDev,
  debtGainFromVNext,
  debtDriftPostLaunch,
  refactorProgress,
  refactorWeeklyCost,
  debtLabel,
  isRefactorActive,
} from "@/game/debt";
import { advanceProductStage } from "@/game/products";
import { advanceWeek } from "@/game/tick";
import { makeRng } from "@/game/rng";
import { derivePricing, segmentChurnRate } from "@/game/segments";
import { teamEffects } from "@/game/roles";
import { newGame } from "@/game/init";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p_debt", name: "DebtTest", category: "productivity",
    stage: "launched", version: "1.0",
    health: 70, quality: 70,
    users: { enterprise: 5, smb: 30, selfServe: 120 },
    pricing: derivePricing(15),
    devProgress: 100, devBudget: 0, marketingBudget: 0,
    weeksAtStage: 4, weeksSinceLaunch: 4, ageWeeks: 10,
    assignedEngineers: [],
    lifetimeRevenue: 0, lifetimeCost: 0, lifetimeDevCost: 0, lifetimeMarketingCost: 0,
    peakUsers: 155, peakMrr: 0,
    techDebt: 0,
    ...overrides,
  };
}

function emp(id: string, role: Employee["role"], level: 1 | 2 | 3 = 2, skill = 70): Employee {
  return { id, name: id, role, level, salary: 0, skill, morale: 80, hiredWeek: 0 };
}

describe("debt: effect helpers", () => {
  it("velocityPenalty is 1.0 at debt=0, 0.5 at debt=100, linear between", () => {
    expect(velocityPenalty(product({ techDebt: 0 }))).toBe(1);
    expect(velocityPenalty(product({ techDebt: 50 }))).toBe(0.75);
    expect(velocityPenalty(product({ techDebt: 100 }))).toBe(0.5);
  });

  it("velocityPenalty clamps to [0.5, 1.0] for out-of-range inputs", () => {
    expect(velocityPenalty(product({ techDebt: -100 }))).toBe(1);
    expect(velocityPenalty(product({ techDebt: 9999 }))).toBe(0.5);
  });

  it("churnPenalty returns 0 below 50 debt, ramps up after", () => {
    expect(churnPenalty(product({ techDebt: 0 }))).toBe(0);
    expect(churnPenalty(product({ techDebt: 50 }))).toBe(0);
    expect(churnPenalty(product({ techDebt: 100 }))).toBeCloseTo(0.02, 5);
    expect(churnPenalty(product({ techDebt: 75 }))).toBeCloseTo(0.01, 5);
  });

  it("decayPenalty kicks in above 60 debt", () => {
    expect(decayPenalty(product({ techDebt: 59 }))).toBe(0);
    expect(decayPenalty(product({ techDebt: 60 }))).toBe(0);
    expect(decayPenalty(product({ techDebt: 100 }))).toBeCloseTo(0.3, 5);
  });

  it("debtLabel strings match thresholds", () => {
    expect(debtLabel(0)).toBe("Pristine");
    expect(debtLabel(30)).toBe("Tidy");
    expect(debtLabel(50)).toBe("Manageable");
    expect(debtLabel(70)).toBe("Brittle");
    expect(debtLabel(90)).toBe("On fire");
  });
});

describe("debt: accumulation sources", () => {
  it("debtGainFromDev only matters in dev stage", () => {
    expect(debtGainFromDev(product({ stage: "launched", devBudget: 5_000 }))).toBe(0);
    expect(debtGainFromDev(product({ stage: "dev", devBudget: 0 }))).toBeGreaterThan(0);
  });

  it("higher dev spend = more debt generated per week", () => {
    const low = debtGainFromDev(product({ stage: "dev", devBudget: 500 }));
    const high = debtGainFromDev(product({ stage: "dev", devBudget: 10_000 }));
    expect(high).toBeGreaterThan(low);
  });

  it("PMs and designers damp the debt accumulation", () => {
    const p = product({ stage: "dev", devBudget: 5_000 });
    const bare = debtGainFromDev(p);
    const withPM = debtGainFromDev(p, teamEffects(["pm"], [emp("pm", "pm", 3, 80)]));
    const withDesign = debtGainFromDev(p, teamEffects(["d"], [emp("d", "designer", 3, 80)]));
    expect(withPM).toBeLessThan(bare);
    expect(withDesign).toBeLessThan(bare);
  });

  it("vNext work still generates debt, but less than greenfield dev", () => {
    const vnext = debtGainFromVNext(product({
      stage: "launched",
      nextVersion: { targetVersion: "2.0", progress: 40, startedWeek: 0, devBudget: 5_000 },
    }));
    const dev = debtGainFromDev(product({ stage: "dev", devBudget: 5_000 }));
    expect(vnext).toBeGreaterThan(0);
    expect(vnext).toBeLessThan(dev);
  });

  it("post-launch drift is small, but exists for live stages only", () => {
    expect(debtDriftPostLaunch(product({ stage: "launched" }))).toBeGreaterThan(0);
    expect(debtDriftPostLaunch(product({ stage: "mature" }))).toBeGreaterThan(0);
    expect(debtDriftPostLaunch(product({ stage: "declining" }))).toBeGreaterThan(0);
    expect(debtDriftPostLaunch(product({ stage: "dev" }))).toBe(0);
    expect(debtDriftPostLaunch(product({ stage: "concept" }))).toBe(0);
  });

  it("declining products rot faster than launched products", () => {
    expect(debtDriftPostLaunch(product({ stage: "declining" })))
      .toBeGreaterThan(debtDriftPostLaunch(product({ stage: "launched" })));
  });
});

describe("debt: churn effect", () => {
  it("segmentChurnRate rises with high debt on the same product", () => {
    const clean = product({ techDebt: 0 });
    const filthy = product({ techDebt: 95 });
    expect(segmentChurnRate(filthy, "selfServe")).toBeGreaterThan(segmentChurnRate(clean, "selfServe"));
    expect(segmentChurnRate(filthy, "enterprise")).toBeGreaterThan(segmentChurnRate(clean, "enterprise"));
  });

  it("enterprise absorbs debt-driven churn better than self-serve", () => {
    const filthy = product({ techDebt: 95 });
    // Enterprise is less sensitive to breakage than self-serve (contracts buffer it).
    const entDelta = segmentChurnRate(filthy, "enterprise") - segmentChurnRate(product({ techDebt: 0 }), "enterprise");
    const selfDelta = segmentChurnRate(filthy, "selfServe") - segmentChurnRate(product({ techDebt: 0 }), "selfServe");
    expect(selfDelta).toBeGreaterThan(entDelta);
  });
});

describe("debt: velocity effect on dev", () => {
  it("dev progress per tick is reduced when debt is high", () => {
    const rng = makeRng("debt-velocity");
    const clean: Product = {
      id: "pc", name: "Clean", category: "productivity",
      stage: "dev", version: "0.1",
      health: 80, quality: 60,
      users: { enterprise: 0, smb: 0, selfServe: 0 }, pricing: derivePricing(12),
      devProgress: 10, devBudget: 5_000, marketingBudget: 0,
      weeksAtStage: 1, weeksSinceLaunch: 0, ageWeeks: 1,
      assignedEngineers: [],
      lifetimeRevenue: 0, lifetimeCost: 0, lifetimeDevCost: 0, lifetimeMarketingCost: 0,
      peakUsers: 0, peakMrr: 0,
      techDebt: 0,
    };
    const filthy: Product = { ...clean, id: "pf", techDebt: 100 };
    const rng2 = makeRng("debt-velocity");
    const cleanNext = advanceProductStage(clean, [], 2, rng);
    const filthyNext = advanceProductStage(filthy, [], 2, rng2);
    // Filthy dev gains less progress per tick — half as much at debt=100.
    expect(filthyNext.devProgress - filthy.devProgress)
      .toBeLessThan(cleanNext.devProgress - clean.devProgress);
  });
});

describe("debt: tick integration", () => {
  function base() {
    return newGame({
      companyName: "Debt Co",
      founderName: "D. Bug",
      archetype: "technical",
      startingCash: "angel-backed",
      startingCategory: "productivity",
      seed: "debt-tick-seed",
    });
  }

  it("a product being developed accumulates debt over a few ticks", () => {
    let s = base();
    // Kick off dev on the starter product.
    s = { ...s, products: s.products.map(p => ({ ...p, devBudget: 6_000 })) };
    const initial = s.products[0].techDebt;
    for (let i = 0; i < 4; i++) s = advanceWeek(s);
    const finalProd = s.products.find(p => p.id === base().products[0].id)
      ?? s.products[0]; // product may have shipped and changed stage but id is stable
    expect(finalProd.techDebt).toBeGreaterThan(initial);
  });

  it("active refactor sprint drops debt each tick and charges extra cash", () => {
    let s = base();
    // Put the starter product live with high debt, then launch a refactor sprint.
    const id = s.products[0].id;
    s = {
      ...s,
      products: s.products.map(p => p.id === id ? {
        ...p,
        stage: "launched", version: "1.0", launchedWeek: 0,
        users: { enterprise: 2, smb: 20, selfServe: 80 },
        techDebt: 70,
        refactorSprintUntil: s.week + 3,
      } : p),
    };
    const cashBefore = s.finance.cash;
    const debtBefore = s.products[0].techDebt;
    s = advanceWeek(s);
    const after = s.products.find(p => p.id === id)!;
    expect(after.techDebt).toBeLessThan(debtBefore);
    // Cash dropped by at least the refactor cost (payroll + maintenance also hit; so just assert cash went down).
    expect(s.finance.cash).toBeLessThan(cashBefore);
  });

  it("shipping a vNext pays down roughly 60% of existing debt", () => {
    // Run a synthetic vNext tick with progress already very close to 100 so it
    // reliably ships this tick even with the velocity penalty from high debt.
    const rng = makeRng("vnext-debt");
    const events: GameEvent[] = [];
    const startDebt = 80;
    const p: Product = {
      id: "p_v", name: "Vee", category: "productivity",
      stage: "launched", version: "1.0",
      health: 60, quality: 60,
      users: { enterprise: 1, smb: 5, selfServe: 20 },
      pricing: derivePricing(12),
      devProgress: 100, devBudget: 0, marketingBudget: 0,
      weeksAtStage: 2, weeksSinceLaunch: 2, ageWeeks: 10,
      assignedEngineers: [],
      lifetimeRevenue: 0, lifetimeCost: 0, lifetimeDevCost: 0, lifetimeMarketingCost: 0,
      peakUsers: 30, peakMrr: 0,
      techDebt: startDebt,
      nextVersion: { targetVersion: "2.0", progress: 99, startedWeek: 0, devBudget: 4_000 },
    };
    const next = advanceProductStage(p, events, 20, rng);
    // The vNext should ship this tick (99 + gain > 100) — version bumps, debt drops.
    expect(next.version).toBe("2.0");
    expect(next.techDebt).toBeLessThan(startDebt * 0.6); // 40% remaining
  });
});

describe("debt: refactor sprint helpers", () => {
  it("refactorProgress scales with engineer contribution", () => {
    const solo = refactorProgress();
    const team = refactorProgress(teamEffects(
      ["e1", "e2"],
      [emp("e1", "engineer", 3, 80), emp("e2", "engineer", 3, 80)],
    ));
    expect(team).toBeGreaterThan(solo);
  });

  it("refactorWeeklyCost rises with debt level", () => {
    const low = refactorWeeklyCost(product({ techDebt: 10 }));
    const high = refactorWeeklyCost(product({ techDebt: 90 }));
    expect(high).toBeGreaterThan(low);
  });

  it("isRefactorActive is true only within the window", () => {
    const p = product({ refactorSprintUntil: 10 });
    expect(isRefactorActive(p, 5)).toBe(true);
    expect(isRefactorActive(p, 10)).toBe(false);
    expect(isRefactorActive(p, 12)).toBe(false);
    expect(isRefactorActive(product({ refactorSprintUntil: undefined }), 1)).toBe(false);
  });
});
