import { describe, it, expect } from "vitest";
import type { Product, SegmentedUsers } from "@/game/types";
import {
  SEGMENT_MIX,
  ZERO_USERS,
  blendedChurnRate,
  blendedMrr,
  derivePricing,
  partitionSignups,
  segmentChurnRate,
  totalUsers,
} from "@/game/segments";
import { teamEffects } from "@/game/roles";
import type { Employee } from "@/game/types";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p_seg", name: "Seg Test", category: "productivity",
    stage: "launched", version: "1.0",
    health: 70, quality: 70,
    users: { enterprise: 5, smb: 50, selfServe: 200 },
    pricing: derivePricing(12),
    devProgress: 100, devBudget: 0, marketingBudget: 0,
    weeksAtStage: 4, weeksSinceLaunch: 4, ageWeeks: 10,
    assignedEngineers: [],
    lifetimeRevenue: 0, lifetimeCost: 0, lifetimeDevCost: 0, lifetimeMarketingCost: 0,
    peakUsers: 255, peakMrr: 0,
    techDebt: 0,
    ...overrides,
  };
}

describe("segments: basic math", () => {
  it("totalUsers sums all three segments", () => {
    expect(totalUsers(product())).toBe(255);
  });

  it("blendedMrr weights enterprise at 10x self-serve pricing", () => {
    const p = product({
      users: { enterprise: 10, smb: 0, selfServe: 0 },
      pricing: derivePricing(10),
    });
    // enterprise: 10 users * $100 = $1000
    expect(blendedMrr(p)).toBe(1000);
  });

  it("derivePricing returns 10x / 3x / 1x ladder", () => {
    const pr = derivePricing(20);
    expect(pr.enterprise).toBe(200);
    expect(pr.smb).toBe(60);
    expect(pr.selfServe).toBe(20);
  });

  it("ZERO_USERS is all zeros", () => {
    expect(ZERO_USERS).toEqual({ enterprise: 0, smb: 0, selfServe: 0 });
  });
});

describe("segments: partitionSignups", () => {
  function emp(id: string, role: Employee["role"], level: 1 | 2 | 3 = 2, skill = 70): Employee {
    return { id, name: id, role, level, salary: 0, skill, morale: 80, hiredWeek: 0 };
  }

  it("without sales, enterprise share collapses to ~20% of baseline", () => {
    // Analytics category has 0.45 enterprise baseline. Without a sales team the
    // effective mix should be roughly 20% of that.
    const p = product({ category: "analytics" });
    const split = partitionSignups(1000, p);
    const entRatio = split.enterprise / (split.enterprise + split.smb + split.selfServe);
    // Baseline would be ~0.45. Without sales, it should be well below that.
    expect(entRatio).toBeLessThan(0.2);
  });

  it("a sales team restores enterprise share", () => {
    const p = product({ category: "analytics" });
    const team = teamEffects(["s"], [emp("s", "sales", 3, 80)]);
    const split = partitionSignups(1000, p, team);
    const entRatio = split.enterprise / (split.enterprise + split.smb + split.selfServe);
    expect(entRatio).toBeGreaterThan(0.25);
  });

  it("marketing hires tilt the mix toward self-serve", () => {
    const p = product({ category: "creative" });
    const bareSplit = partitionSignups(1000, p);
    const mktTeam = teamEffects(["m"], [emp("m", "marketing", 3, 80)]);
    const mktSplit = partitionSignups(1000, p, mktTeam);
    const bareSelfRatio = bareSplit.selfServe / (bareSplit.enterprise + bareSplit.smb + bareSplit.selfServe);
    const mktSelfRatio = mktSplit.selfServe / (mktSplit.enterprise + mktSplit.smb + mktSplit.selfServe);
    expect(mktSelfRatio).toBeGreaterThan(bareSelfRatio);
  });

  it("partitions sum to the input total (modulo small rounding)", () => {
    const split = partitionSignups(250, product());
    const sum = split.enterprise + split.smb + split.selfServe;
    expect(Math.abs(sum - 250)).toBeLessThanOrEqual(2);
  });

  it("returns all zeros for zero signups", () => {
    expect(partitionSignups(0, product())).toEqual({ enterprise: 0, smb: 0, selfServe: 0 });
  });
});

describe("segments: churn", () => {
  it("enterprise churn is at least 10x lower than self-serve on a healthy product", () => {
    const p = product({ health: 80, stage: "mature" });
    const ent = segmentChurnRate(p, "enterprise");
    const self = segmentChurnRate(p, "selfServe");
    expect(self / Math.max(ent, 1e-6)).toBeGreaterThan(10);
  });

  it("declining products churn harder than mature products", () => {
    const mature = product({ stage: "mature", health: 60 });
    const declining = product({ stage: "declining", health: 30 });
    expect(segmentChurnRate(declining, "selfServe")).toBeGreaterThan(segmentChurnRate(mature, "selfServe"));
  });

  it("blendedChurnRate reflects the user mix", () => {
    const entHeavy: SegmentedUsers = { enterprise: 90, smb: 10, selfServe: 0 };
    const selfHeavy: SegmentedUsers = { enterprise: 0, smb: 10, selfServe: 90 };
    const pEnt = product({ users: entHeavy });
    const pSelf = product({ users: selfHeavy });
    expect(blendedChurnRate(pSelf)).toBeGreaterThan(blendedChurnRate(pEnt));
  });
});

describe("segments: SEGMENT_MIX shape", () => {
  it("every category mix sums to approximately 1.0", () => {
    for (const cat of Object.keys(SEGMENT_MIX) as (keyof typeof SEGMENT_MIX)[]) {
      const m = SEGMENT_MIX[cat];
      expect(Math.abs(m.enterprise + m.smb + m.selfServe - 1)).toBeLessThan(0.001);
    }
  });

  it("infrastructure skews heavily to enterprise; creative skews to self-serve", () => {
    expect(SEGMENT_MIX.infrastructure.enterprise).toBeGreaterThan(0.5);
    expect(SEGMENT_MIX.creative.selfServe).toBeGreaterThan(0.6);
  });
});
