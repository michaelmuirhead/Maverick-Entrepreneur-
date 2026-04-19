import { describe, it, expect } from "vitest";
import { teamEffects, EMPTY_TEAM, summarizeTeam } from "@/game/roles";
import type { Employee, Product, GameEvent, SegmentedUsers } from "@/game/types";
import { advanceProductStage, signupsThisWeek, marketingMultiplier, churnRate } from "@/game/products";
import { makeRng } from "@/game/rng";
import { derivePricing, SEGMENT_MIX, ZERO_USERS } from "@/game/segments";

function seg(n: number): SegmentedUsers {
  if (n <= 0) return { ...ZERO_USERS };
  const mix = SEGMENT_MIX.productivity;
  const ent = Math.round(n * mix.enterprise);
  const smb = Math.round(n * mix.smb);
  return { enterprise: ent, smb, selfServe: Math.max(0, n - ent - smb) };
}

function emp(overrides: Partial<Employee> & Pick<Employee, "id" | "role">): Employee {
  return {
    name: "Alex Test",
    level: 2,
    salary: 100_000,
    skill: 70,
    morale: 80,
    hiredWeek: 0,
    ...overrides,
  } as Employee;
}

function liveProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p_test", name: "Test", category: "productivity",
    stage: "launched", version: "1.0",
    health: 70, quality: 70, users: seg(500), pricing: derivePricing(20),
    devProgress: 100, devBudget: 0, marketingBudget: 0,
    weeksAtStage: 2, weeksSinceLaunch: 2, ageWeeks: 10,
    assignedEngineers: [],
    launchBuzz: 50,
    lifetimeRevenue: 0, lifetimeCost: 0, lifetimeDevCost: 0, lifetimeMarketingCost: 0,
    peakUsers: 500, peakMrr: 0,
    techDebt: 0,
    ...overrides,
  };
}

describe("teamEffects", () => {
  it("returns EMPTY_TEAM for empty assignment", () => {
    expect(teamEffects([], [])).toBe(EMPTY_TEAM);
  });

  it("sums an engineer into the engineer bucket", () => {
    const e = emp({ id: "e1", role: "engineer" });
    const t = teamEffects(["e1"], [e]);
    expect(t.engineer).toBeGreaterThan(0);
    expect(t.designer).toBe(0);
    expect(t.headcount).toBe(1);
  });

  it("buckets a founder by archetype", () => {
    const designFounder = emp({ id: "f1", role: "founder", archetype: "design" });
    const t = teamEffects(["f1"], [designFounder]);
    expect(t.designer).toBeGreaterThan(0);
    expect(t.engineer).toBe(0);

    const bizFounder = emp({ id: "f2", role: "founder", archetype: "business" });
    const t2 = teamEffects(["f2"], [bizFounder]);
    expect(t2.sales).toBeGreaterThan(0);
  });

  it("skill and level scale contribution", () => {
    const junior = emp({ id: "j", role: "engineer", level: 1, skill: 35, morale: 70 });
    const senior = emp({ id: "s", role: "engineer", level: 3, skill: 85, morale: 80 });
    const tJ = teamEffects(["j"], [junior]).engineer;
    const tS = teamEffects(["s"], [senior]).engineer;
    expect(tS).toBeGreaterThan(tJ * 1.5);
  });

  it("ignores employees not in the assigned ID list", () => {
    const assigned = emp({ id: "a", role: "engineer" });
    const notAssigned = emp({ id: "b", role: "engineer" });
    const t = teamEffects(["a"], [assigned, notAssigned]);
    expect(t.headcount).toBe(1);
  });

  it("summarizeTeam returns 'unstaffed' for empty team", () => {
    expect(summarizeTeam(EMPTY_TEAM)).toBe("unstaffed");
  });

  it("summarizeTeam lists non-zero roles", () => {
    const e = emp({ id: "e", role: "engineer", skill: 70 });
    const d = emp({ id: "d", role: "designer", skill: 70 });
    const t = teamEffects(["e", "d"], [e, d]);
    const summary = summarizeTeam(t);
    expect(summary).toContain("eng");
    expect(summary).toContain("design");
    expect(summary).not.toContain("pm");
  });
});

describe("marketingMultiplier with marketing role", () => {
  it("without a marketing hire, respects the 2.0 cap", () => {
    const insane = marketingMultiplier(liveProduct({ marketingBudget: 10_000_000 }));
    expect(insane).toBeLessThanOrEqual(2.0001);
  });

  it("a marketing hire lifts the cap and sharpens spend", () => {
    const mktTeam = teamEffects(["m1"], [emp({ id: "m1", role: "marketing", skill: 75, level: 2 })]);
    const bare = marketingMultiplier(liveProduct({ marketingBudget: 5_000 }));
    const withHire = marketingMultiplier(liveProduct({ marketingBudget: 5_000 }), mktTeam);
    expect(withHire).toBeGreaterThan(bare);
  });

  it("marketing role doesn't rescue zero-spend campaigns", () => {
    const mktTeam = teamEffects(["m1"], [emp({ id: "m1", role: "marketing", skill: 80 })]);
    expect(marketingMultiplier(liveProduct({ marketingBudget: 0 }), mktTeam)).toBe(1);
  });
});

describe("signupsThisWeek with role effects", () => {
  it("a sales team lifts baseline signups on live products", () => {
    const trials = 30;
    let noSales = 0;
    let withSales = 0;
    const salesTeam = teamEffects(
      ["s1", "s2"],
      [emp({ id: "s1", role: "sales", skill: 75 }), emp({ id: "s2", role: "sales", skill: 70 })],
    );
    for (let i = 0; i < trials; i++) {
      const p = liveProduct({ marketingBudget: 0 });
      const rng1 = makeRng(`s-test:${i}:none`);
      const rng2 = makeRng(`s-test:${i}:sales`);
      noSales += signupsThisWeek(p, { marketDemand: 1, competitorPressure: 0.2, rng: rng1 });
      withSales += signupsThisWeek(p, { marketDemand: 1, competitorPressure: 0.2, rng: rng2, team: salesTeam });
    }
    expect(withSales).toBeGreaterThan(noSales);
  });

  it("ops dampens churn slightly but health still dominates", () => {
    const team = teamEffects(["o1"], [emp({ id: "o1", role: "ops", skill: 80, level: 3 })]);
    const p = liveProduct({ health: 30 });
    expect(churnRate(p, team)).toBeLessThan(churnRate(p));
  });
});

describe("launch quality + buzz with team", () => {
  it("a designer on the team ships higher quality", () => {
    const events: GameEvent[] = [];
    const designerTeam = teamEffects(
      ["d1"],
      [emp({ id: "d1", role: "designer", skill: 85, level: 3, morale: 85 })],
    );
    const bareTeam = EMPTY_TEAM;
    const baseProduct: Product = {
      ...liveProduct({
        stage: "dev", devProgress: 95, devBudget: 10_000,
        weeksAtStage: 6, assignedEngineers: ["e1"],
      }),
    };
    const rng1 = makeRng("launch-bare");
    const rng2 = makeRng("launch-design");
    const bare = advanceProductStage(baseProduct, events, 10, rng1, bareTeam);
    const withDesign = advanceProductStage(baseProduct, events, 10, rng2, designerTeam);
    expect(bare.stage).toBe("launched");
    expect(withDesign.stage).toBe("launched");
    expect(withDesign.quality).toBeGreaterThan(bare.quality);
  });

  it("a marketing hire on launch boosts buzz", () => {
    const events: GameEvent[] = [];
    const mkt = teamEffects(["m1"], [emp({ id: "m1", role: "marketing", skill: 80, level: 3 })]);
    const dev: Product = {
      ...liveProduct({
        stage: "dev", devProgress: 95, devBudget: 10_000,
        weeksAtStage: 6, assignedEngineers: ["e1"],
      }),
    };
    const rng1 = makeRng("buzz-bare");
    const rng2 = makeRng("buzz-mkt");
    const bare = advanceProductStage(dev, events, 10, rng1, EMPTY_TEAM);
    const withMkt = advanceProductStage(dev, events, 10, rng2, mkt);
    expect(withMkt.launchBuzz ?? 0).toBeGreaterThan(bare.launchBuzz ?? 0);
  });
});

describe("PM accelerates vNext", () => {
  it("a PM on the team speeds up vNext progress compared to engineers alone", () => {
    const pmTeam = teamEffects(
      ["e1", "pm1"],
      [
        emp({ id: "e1", role: "engineer", skill: 75, level: 3 }),
        emp({ id: "pm1", role: "pm", skill: 80, level: 3 }),
      ],
    );
    const engOnlyTeam = teamEffects(
      ["e1"],
      [emp({ id: "e1", role: "engineer", skill: 75, level: 3 })],
    );
    const events: GameEvent[] = [];
    const start: Product = {
      ...liveProduct({
        assignedEngineers: ["e1"],
        nextVersion: { targetVersion: "2.0", progress: 0, startedWeek: 1, devBudget: 4000 },
      }),
    };
    const rng1 = makeRng("vn-pm");
    const rng2 = makeRng("vn-eng");
    const withPm = advanceProductStage(start, events, 2, rng1, pmTeam);
    const engOnly = advanceProductStage(start, events, 2, rng2, engOnlyTeam);
    expect(withPm.nextVersion?.progress ?? 0).toBeGreaterThan(engOnly.nextVersion?.progress ?? 0);
  });
});
