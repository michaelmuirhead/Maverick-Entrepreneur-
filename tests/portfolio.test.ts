import { describe, it, expect } from "vitest";
import {
  IPO_MRR_FLOOR,
  REGION_INFO,
  advanceIpoStage,
  advanceOss,
  advancePatents,
  advanceRegions,
  createOssProject,
  createPartnership,
  expandInto,
  expireGovContracts,
  fileNewPatent,
  initIpo,
  initRegions,
  ipoEligible,
  ipoMinDwell,
  ipoValuation,
  issueGovContract,
  ossRecruitingBoost,
  partnershipMultiplier,
  patentFilingCost,
  patentGrantWeeks,
  patentProtection,
  regionalSignupMultiplier,
  weeklyGovRevenue,
  weeklyOssBurn,
  weeklyPartnershipBurn,
} from "@/game/portfolio";
import { makeRng } from "@/game/rng";
import type { GameState } from "@/game/types";

// ============================================================================
// Patents
// ============================================================================

describe("portfolio: patents", () => {
  it("filing cost is higher for regulated categories", () => {
    expect(patentFilingCost("security-it")).toBeGreaterThan(patentFilingCost("application"));
    expect(patentFilingCost("finance-ops")).toBeGreaterThan(patentFilingCost("content-media"));
  });

  it("grant time is longer for enterprise-y categories", () => {
    expect(patentGrantWeeks("security-it")).toBeGreaterThan(patentGrantWeeks("application"));
  });

  it("fileNewPatent creates an unfinished patent with proper metadata", () => {
    const p = fileNewPatent({ id: "pat1", title: "Novel flux capacitor", category: "dev-tools", week: 10 });
    expect(p.grantedWeek).toBeUndefined();
    expect(p.yearsRemaining).toBeUndefined();
    expect(p.filedWeek).toBe(10);
    expect(p.cost).toBe(patentFilingCost("dev-tools"));
  });

  it("advancePatents grants a patent after the grant window elapses", () => {
    const p = fileNewPatent({ id: "pat1", title: "X", category: "application", week: 0 });
    const before = advancePatents([p], patentGrantWeeks("application") - 1);
    const after = advancePatents([p], patentGrantWeeks("application"));
    expect(before[0]?.grantedWeek).toBeUndefined();
    expect(after[0]?.grantedWeek).toBeDefined();
    expect(after[0]?.yearsRemaining).toBe(20);
  });

  it("advancePatents decays yearsRemaining once per year after grant", () => {
    const granted = {
      id: "p1", title: "y", category: "application" as const, filedWeek: 0,
      grantedWeek: 0, yearsRemaining: 20, cost: 1,
    };
    const oneYearLater = advancePatents([granted], 52);
    expect(oneYearLater[0]?.yearsRemaining).toBe(19);
  });

  it("patentProtection returns 1.0 with no granted patents in the category", () => {
    const filed = fileNewPatent({ id: "p1", title: "X", category: "dev-tools", week: 0 });
    expect(patentProtection([filed], "dev-tools")).toBe(1);
    expect(patentProtection([], "dev-tools")).toBe(1);
    expect(patentProtection(undefined, "dev-tools")).toBe(1);
  });

  it("patentProtection gives 25%+ protection with a granted patent", () => {
    const granted = {
      id: "p1", title: "y", category: "dev-tools" as const, filedWeek: 0,
      grantedWeek: 0, yearsRemaining: 20, cost: 1,
    };
    const mult = patentProtection([granted], "dev-tools");
    expect(mult).toBeLessThanOrEqual(0.75);
    expect(mult).toBeGreaterThanOrEqual(0.4);
  });

  it("patentProtection caps at 0.4 (60% reduction) with many patents", () => {
    const granted = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`, title: "y", category: "dev-tools" as const, filedWeek: 0,
      grantedWeek: 0, yearsRemaining: 20, cost: 1,
    }));
    const mult = patentProtection(granted, "dev-tools");
    expect(mult).toBeGreaterThanOrEqual(0.4);
  });
});

// ============================================================================
// Open source
// ============================================================================

describe("portfolio: open source", () => {
  it("createOssProject starts with a handful of stars", () => {
    const p = createOssProject({ id: "o1", name: "quiklib", category: "dev-tools", weeklyBudget: 2000, week: 0 });
    expect(p.stars).toBeGreaterThan(0);
    expect(p.stars).toBeLessThan(20);
  });

  it("advanceOss grows stars toward a cap", () => {
    const rng = makeRng("oss");
    let proj = createOssProject({ id: "o1", name: "x", category: "dev-tools", weeklyBudget: 2000, week: 0 });
    for (let w = 1; w < 100; w++) {
      proj = advanceOss([proj], w, rng)[0]!;
    }
    expect(proj.stars).toBeGreaterThan(50);
  });

  it("weeklyOssBurn sums weekly budgets", () => {
    const a = createOssProject({ id: "a", name: "a", category: "dev-tools", weeklyBudget: 1000, week: 0 });
    const b = createOssProject({ id: "b", name: "b", category: "dev-tools", weeklyBudget: 500, week: 0 });
    expect(weeklyOssBurn([a, b])).toBe(1500);
    expect(weeklyOssBurn(undefined)).toBe(0);
  });

  it("ossRecruitingBoost is 1.0 with no OSS and caps at 1.15", () => {
    expect(ossRecruitingBoost(undefined)).toBe(1);
    const mega = createOssProject({ id: "m", name: "big", category: "dev-tools", weeklyBudget: 10_000, week: 0 });
    mega.stars = 50_000;
    expect(ossRecruitingBoost([mega])).toBeCloseTo(1.15, 2);
  });
});

// ============================================================================
// Partnerships
// ============================================================================

describe("portfolio: partnerships", () => {
  it("createPartnership wires through the metadata", () => {
    const p = createPartnership({
      id: "pp1", partnerName: "AWS", kind: "integration",
      weeklyCost: 1000, signupMultiplier: 1.2,
      benefitsCategory: "enterprise", week: 5,
    });
    expect(p.id).toBe("pp1");
    expect(p.partnerName).toBe("AWS");
    expect(p.signupMultiplier).toBe(1.2);
    expect(p.benefitsCategory).toBe("enterprise");
  });

  it("weeklyPartnershipBurn sums costs", () => {
    const a = createPartnership({ id: "a", partnerName: "X", kind: "integration", weeklyCost: 500, signupMultiplier: 1.1, benefitsCategory: "enterprise", week: 0 });
    const b = createPartnership({ id: "b", partnerName: "Y", kind: "reseller", weeklyCost: 1500, signupMultiplier: 1.15, benefitsCategory: "enterprise", week: 0 });
    expect(weeklyPartnershipBurn([a, b])).toBe(2000);
    expect(weeklyPartnershipBurn(undefined)).toBe(0);
  });

  it("partnershipMultiplier scopes to category & stacks with diminishing returns", () => {
    const a = createPartnership({ id: "a", partnerName: "X", kind: "integration", weeklyCost: 0, signupMultiplier: 1.2, benefitsCategory: "enterprise", week: 0 });
    const b = createPartnership({ id: "b", partnerName: "Y", kind: "co-marketing", weeklyCost: 0, signupMultiplier: 1.2, benefitsCategory: "application", week: 0 });
    expect(partnershipMultiplier([a, b], "dev-tools")).toBe(1); // neither applies
    expect(partnershipMultiplier([a], "enterprise")).toBeCloseTo(1.2, 5);
    const stacked = partnershipMultiplier([a, a], "enterprise");
    expect(stacked).toBeGreaterThan(1.2);
    expect(stacked).toBeLessThan(1.44); // diminishing
  });

  it("returns 1 for undefined partnerships", () => {
    expect(partnershipMultiplier(undefined, "enterprise")).toBe(1);
  });
});

// ============================================================================
// Government contracts
// ============================================================================

describe("portfolio: government contracts", () => {
  it("issues with the right total value and duration by clearance", () => {
    const basic = issueGovContract({ id: "g1", agency: "DHS", title: "t", category: "security-it", clearance: "basic", week: 0 });
    const fed   = issueGovContract({ id: "g2", agency: "DOD", title: "t", category: "security-it", clearance: "fedramp", week: 0 });
    expect(fed.totalValue).toBeGreaterThan(basic.totalValue);
    expect(fed.months).toBeGreaterThan(basic.months);
  });

  it("weeklyGovRevenue distributes total value over duration", () => {
    const c = issueGovContract({ id: "g1", agency: "USAF", title: "t", category: "enterprise", clearance: "basic", week: 0 });
    const weekly = weeklyGovRevenue([c], 10);
    const totalWeeks = c.months * 4.33;
    expect(weekly).toBeCloseTo(c.totalValue / totalWeeks, 1);
  });

  it("returns 0 revenue before start or after expiration", () => {
    const c = issueGovContract({ id: "g1", agency: "USAF", title: "t", category: "enterprise", clearance: "basic", week: 10 });
    expect(weeklyGovRevenue([c], 5)).toBe(0);
    const totalWeeks = c.months * 4.33;
    expect(weeklyGovRevenue([c], 10 + totalWeeks + 5)).toBe(0);
  });

  it("expireGovContracts drops finished contracts", () => {
    const c = issueGovContract({ id: "g1", agency: "USAF", title: "t", category: "enterprise", clearance: "basic", week: 0 });
    const totalWeeks = c.months * 4.33;
    const kept = expireGovContracts([c], totalWeeks + 5);
    expect(kept).toEqual([]);
  });
});

// ============================================================================
// Regions
// ============================================================================

describe("portfolio: regions", () => {
  it("initRegions seeds NA only", () => {
    const list = initRegions();
    expect(list).toHaveLength(1);
    expect(list[0]?.region).toBe("na");
  });

  it("expandInto adds a new region and charges the expansion cost", () => {
    const { regions, cost } = expandInto(initRegions(), "emea", 10);
    expect(regions.some(r => r.region === "emea")).toBe(true);
    expect(cost).toBe(REGION_INFO.emea.expansionCost);
  });

  it("expandInto is idempotent — re-entering an existing region is free", () => {
    const first = expandInto(initRegions(), "emea", 10);
    const second = expandInto(first.regions, "emea", 20);
    expect(second.cost).toBe(0);
    expect(second.regions).toEqual(first.regions);
  });

  it("advanceRegions drifts localization and market capture up over time", () => {
    const base = initRegions();
    const after = advanceRegions(base);
    expect(after[0]!.localizationScore).toBeGreaterThanOrEqual(base[0]!.localizationScore);
  });

  it("localization score caps at 100", () => {
    let regions = initRegions().map(r => ({ ...r, localizationScore: 99.9 }));
    for (let i = 0; i < 10; i++) regions = advanceRegions(regions);
    expect(regions[0]!.localizationScore).toBeLessThanOrEqual(100);
  });

  it("regionalSignupMultiplier is ~1.0 for NA-only default and grows with coverage", () => {
    const na = regionalSignupMultiplier(initRegions());
    const multi = regionalSignupMultiplier([
      { region: "na",    enteredWeek: 0, marketCapture: 0.55, localizationScore: 100 },
      { region: "emea",  enteredWeek: 0, marketCapture: 0.30, localizationScore: 100 },
      { region: "apac",  enteredWeek: 0, marketCapture: 0.25, localizationScore: 100 },
      { region: "latam", enteredWeek: 0, marketCapture: 0.15, localizationScore: 100 },
    ]);
    expect(na).toBeLessThan(multi);
    expect(multi).toBeGreaterThan(1);
  });
});

// ============================================================================
// IPO
// ============================================================================

describe("portfolio: IPO state machine", () => {
  it("initIpo is in 'none' stage", () => {
    expect(initIpo().stage).toBe("none");
  });

  it("ipoEligible requires Series B + MRR floor", () => {
    const weak: GameState = {
      company: { name: "X", founded: { year: 1, quarter: 1 }, stage: "seed" },
      finance: { cash: 1, mrr: 5_000_000, weeklyRevenueHistory: [], weeklyBurnHistory: [], rounds: [] },
      ipo: initIpo(),
    } as unknown as GameState;
    expect(ipoEligible(weak).ok).toBe(false);

    const broke: GameState = {
      company: { name: "X", founded: { year: 1, quarter: 1 }, stage: "series-b" },
      finance: { cash: 1, mrr: 100_000, weeklyRevenueHistory: [], weeklyBurnHistory: [], rounds: [] },
      ipo: initIpo(),
    } as unknown as GameState;
    expect(ipoEligible(broke).ok).toBe(false);

    const ok: GameState = {
      company: { name: "X", founded: { year: 1, quarter: 1 }, stage: "series-b" },
      finance: { cash: 1, mrr: IPO_MRR_FLOOR + 1, weeklyRevenueHistory: [], weeklyBurnHistory: [], rounds: [] },
      ipo: initIpo(),
    } as unknown as GameState;
    expect(ipoEligible(ok).ok).toBe(true);
  });

  it("ipoValuation is ARR × 10 floor", () => {
    const s: GameState = {
      finance: { cash: 0, mrr: 3_000_000, weeklyRevenueHistory: [], weeklyBurnHistory: [], rounds: [] },
    } as unknown as GameState;
    expect(ipoValuation(s)).toBe(3_000_000 * 12 * 10);
  });

  it("advanceIpoStage walks through the state machine", () => {
    let ipo = initIpo();
    expect(ipo.stage).toBe("none");
    ipo = advanceIpoStage(ipo, 10);
    expect(ipo.stage).toBe("exploring");
    ipo = advanceIpoStage(ipo, 20);
    expect(ipo.stage).toBe("filed");
    ipo = advanceIpoStage(ipo, 30);
    expect(ipo.stage).toBe("roadshow");
    ipo = advanceIpoStage(ipo, 35);
    expect(ipo.stage).toBe("public");
    ipo = advanceIpoStage(ipo, 40);
    expect(ipo.stage).toBe("public"); // no further progression
  });

  it("advanceIpoStage stamps stageStartedWeek", () => {
    const a = advanceIpoStage(initIpo(), 42);
    expect(a.stageStartedWeek).toBe(42);
  });

  it("ipoMinDwell is monotonic-ish and infinite for public", () => {
    expect(ipoMinDwell("none")).toBe(0);
    expect(ipoMinDwell("exploring")).toBeGreaterThan(0);
    expect(ipoMinDwell("public")).toBe(Infinity);
  });
});
