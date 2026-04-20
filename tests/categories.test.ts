import { describe, it, expect } from "vitest";
import type { Product, ProductCategory, SegmentedUsers } from "@/game/types";
import { derivePricing, ZERO_USERS, blendedMrr } from "@/game/segments";
import { weeklyRevenue, FREEMIUM_CONVERSION_RATE } from "@/game/products";
import {
  CATEGORY_INFO,
  PRODUCT_CATEGORIES,
  revenueModelFor,
  segmentMixFor,
  defaultPriceFor,
  devWeeksBaseFor,
  teamSizeMinFor,
} from "@/game/categories";

// Minimal product builder — fills in only the fields the revenue branches look at.
function product(cat: ProductCategory, users: SegmentedUsers, priceSelf = 12, overrides: Partial<Product> = {}): Product {
  return {
    id: "p", name: "Rev Test", category: cat,
    revenueModel: revenueModelFor(cat),
    stage: "launched", version: "1.0",
    health: 80, quality: 80,
    users,
    pricing: derivePricing(priceSelf),
    devProgress: 100, devBudget: 0, marketingBudget: 0,
    weeksAtStage: 4, weeksSinceLaunch: 4, ageWeeks: 10,
    assignedEngineers: [],
    lifetimeRevenue: 0, lifetimeCost: 0, lifetimeDevCost: 0, lifetimeMarketingCost: 0,
    peakUsers: 0, peakMrr: 0,
    techDebt: 0,
    ...overrides,
  };
}

describe("CATEGORY_INFO: shape and completeness", () => {
  const ALL_CATS: ProductCategory[] = [
    "application", "system", "enterprise", "dev-tools", "custom",
    "embedded", "content-media", "finance-ops", "security-it",
  ];

  it("covers every ProductCategory enum value", () => {
    for (const cat of ALL_CATS) {
      expect(CATEGORY_INFO[cat]).toBeDefined();
      expect(CATEGORY_INFO[cat].id).toBe(cat);
    }
  });

  it("exposes a PRODUCT_CATEGORIES list matching CATEGORY_INFO", () => {
    expect(PRODUCT_CATEGORIES.map(c => c.id).sort()).toEqual(ALL_CATS.slice().sort());
    for (const choice of PRODUCT_CATEGORIES) {
      const info = CATEGORY_INFO[choice.id];
      expect(choice.label).toBe(info.label);
      expect(choice.blurb).toBe(info.blurb);
      expect(choice.revenueModel).toBe(info.revenueModel);
      expect(choice.devWeeksBase).toBe(info.devWeeksBase);
      expect(choice.teamSizeMin).toBe(info.teamSizeMin);
      expect(choice.suggestedPrice).toBe(info.defaultPrice);
    }
  });

  it("each category declares non-trivial dev/team numbers", () => {
    for (const cat of ALL_CATS) {
      expect(devWeeksBaseFor(cat)).toBeGreaterThanOrEqual(6);
      expect(teamSizeMinFor(cat)).toBeGreaterThanOrEqual(2);
      expect(defaultPriceFor(cat)).toBeGreaterThan(0);
    }
  });

  it("segmentMix sums to ~1 for every category", () => {
    for (const cat of ALL_CATS) {
      const m = segmentMixFor(cat);
      expect(Math.abs(m.enterprise + m.smb + m.selfServe - 1)).toBeLessThan(0.001);
    }
  });

  it("maps revenue model families correctly", () => {
    expect(revenueModelFor("application")).toBe("freemium");
    expect(revenueModelFor("enterprise")).toBe("contract");
    expect(revenueModelFor("custom")).toBe("contract");
    expect(revenueModelFor("system")).toBe("one-time");
    expect(revenueModelFor("embedded")).toBe("one-time");
    expect(revenueModelFor("dev-tools")).toBe("subscription");
    expect(revenueModelFor("content-media")).toBe("subscription");
    expect(revenueModelFor("finance-ops")).toBe("subscription");
    expect(revenueModelFor("security-it")).toBe("subscription");
  });
});

describe("weeklyRevenue: subscription model", () => {
  it("returns MRR / 4.3 on a subscription product", () => {
    const p = product("dev-tools", { enterprise: 2, smb: 10, selfServe: 50 });
    const mrr = blendedMrr(p);
    expect(weeklyRevenue(p)).toBeCloseTo(mrr / 4.3, 4);
  });
});

describe("weeklyRevenue: freemium model", () => {
  it("recognizes only a fraction of blended MRR at FREEMIUM_CONVERSION_RATE", () => {
    const p = product("application", { enterprise: 0, smb: 20, selfServe: 500 });
    const mrr = blendedMrr(p);
    const expected = (mrr * FREEMIUM_CONVERSION_RATE) / 4.3;
    expect(weeklyRevenue(p)).toBeCloseTo(expected, 4);
    // And strictly less than the subscription equivalent (which is mrr / 4.3).
    expect(weeklyRevenue(p)).toBeLessThan(mrr / 4.3);
  });
});

describe("weeklyRevenue: contract model", () => {
  it("counts only enterprise seats — smb/selfServe contribute nothing", () => {
    const p = product("enterprise", { enterprise: 5, smb: 20, selfServe: 10 }, 65);
    // With derivePricing(65), enterprise price = 650. 5 seats * 650 = 3250 MRR.
    // weekly = 3250 / 4.3 ≈ 755.81
    expect(weeklyRevenue(p)).toBeCloseTo((5 * p.pricing.enterprise) / 4.3, 4);
  });

  it("returns 0 when there are no enterprise customers", () => {
    const p = product("enterprise", { enterprise: 0, smb: 40, selfServe: 80 }, 65);
    expect(weeklyRevenue(p)).toBe(0);
  });
});

describe("weeklyRevenue: one-time model", () => {
  it("recognizes revenue only on new users this week, not the installed base", () => {
    // Week 1: start with 100 users, prior was 80 → 20 new users.
    const users: SegmentedUsers = { enterprise: 0, smb: 30, selfServe: 70 };
    // Use a 'system' product (one-time) with a single annualized price recognition.
    const p = product("system", users, 120, { lastWeekUserTotal: 80 });
    // New-user revenue is based on avg monthly price * 12 per new user.
    const totalU = users.enterprise + users.smb + users.selfServe; // 100
    const avgMonthly = blendedMrr(p) / totalU;
    const newUsers = totalU - 80;
    expect(weeklyRevenue(p)).toBeCloseTo(newUsers * avgMonthly * 12, 2);
  });

  it("returns 0 when no new users were added this week", () => {
    const users: SegmentedUsers = { enterprise: 0, smb: 30, selfServe: 70 };
    const p = product("system", users, 120, { lastWeekUserTotal: 100 });
    expect(weeklyRevenue(p)).toBe(0);
  });

  it("falls back to blended MRR/4.3 when lastWeekUserTotal is undefined (legacy save)", () => {
    const users: SegmentedUsers = { enterprise: 0, smb: 30, selfServe: 70 };
    const p = product("system", users, 120, { lastWeekUserTotal: undefined });
    expect(weeklyRevenue(p)).toBeCloseTo(blendedMrr(p) / 4.3, 4);
  });
});

describe("weeklyRevenue: revenueModel overrides category default", () => {
  it("a product whose revenueModel is flipped uses the new math", () => {
    const users: SegmentedUsers = { enterprise: 0, smb: 30, selfServe: 70 };
    // Start with a subscription product...
    const base = product("dev-tools", users);
    // ...and pivot it freemium. Revenue should fall by the conversion ratio.
    const flipped: Product = { ...base, revenueModel: "freemium" };
    expect(weeklyRevenue(flipped)).toBeLessThan(weeklyRevenue(base));
    expect(weeklyRevenue(flipped))
      .toBeCloseTo(weeklyRevenue(base) * FREEMIUM_CONVERSION_RATE, 4);
  });
});

describe("weeklyRevenue: zero-user product", () => {
  it("returns 0 across all revenue models when users is zero", () => {
    const zero = { ...ZERO_USERS };
    for (const cat of ["application", "system", "enterprise", "dev-tools"] as ProductCategory[]) {
      const p = product(cat, zero);
      expect(weeklyRevenue(p)).toBe(0);
    }
  });
});
