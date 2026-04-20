import { describe, it, expect } from "vitest";
import {
  CHANNELS,
  campaignMultiplierForProduct,
  campaignMultiplierNow,
  createCampaign,
  dropExpired,
  weeklyCampaignBurn,
} from "@/game/campaigns";
import { makeRng } from "@/game/rng";
import type { MarketingCampaign } from "@/game/types";

function makeCamp(overrides: Partial<MarketingCampaign> = {}): MarketingCampaign {
  return {
    id: "c1",
    name: "Test",
    channel: "social",
    productId: "p1",
    budget: 20_000,
    startedWeek: 0,
    durationWeeks: 5,
    peakMultiplier: 1.3,
    performanceRoll: 0.5,
    ...overrides,
  };
}

describe("campaigns: createCampaign", () => {
  it("returns a campaign with a duration within channel bounds", () => {
    const rng = makeRng("seed-camp-1");
    const c = createCampaign({
      id: "c1", name: "Launch push", channel: "content",
      productId: "p1", productCategory: "dev-tools",
      budget: 40_000, week: 0, rng,
    });
    expect(c.durationWeeks).toBeGreaterThanOrEqual(CHANNELS.content.duration[0]);
    expect(c.durationWeeks).toBeLessThanOrEqual(CHANNELS.content.duration[1]);
    expect(c.peakMultiplier).toBeGreaterThan(1);
  });

  it("penalizes off-fit categories", () => {
    const rng1 = makeRng("seed-camp-fit");
    const rng2 = makeRng("seed-camp-fit");
    const onFit = createCampaign({
      id: "c1", name: "A", channel: "content",
      productId: "p1", productCategory: "enterprise",
      budget: 40_000, week: 0, rng: rng1,
    });
    const offFit = createCampaign({
      id: "c2", name: "B", channel: "content",
      productId: "p1", productCategory: "content-media",
      budget: 40_000, week: 0, rng: rng2,
    });
    expect(onFit.peakMultiplier).toBeGreaterThanOrEqual(offFit.peakMultiplier);
  });

  it("is deterministic under a fixed RNG seed", () => {
    const rngA = makeRng("determinism");
    const rngB = makeRng("determinism");
    const a = createCampaign({ id: "ca", name: "x", channel: "pr", productId: "p1", productCategory: "dev-tools", budget: 30_000, week: 0, rng: rngA });
    const b = createCampaign({ id: "cb", name: "x", channel: "pr", productId: "p1", productCategory: "dev-tools", budget: 30_000, week: 0, rng: rngB });
    expect(a.peakMultiplier).toBe(b.peakMultiplier);
    expect(a.durationWeeks).toBe(b.durationWeeks);
  });

  it("floors peakMultiplier at 0.95 so campaigns never actively destroy signups", () => {
    // Craft a deliberately bad campaign: tiny budget on a pricey channel, off-fit category.
    const rng = makeRng("floor");
    const c = createCampaign({
      id: "c1", name: "bad", channel: "events",
      productId: "p1", productCategory: "application",
      budget: 500, week: 0, rng,
    });
    expect(c.peakMultiplier).toBeGreaterThanOrEqual(0.95);
  });
});

describe("campaigns: campaignMultiplierNow (trapezoid curve)", () => {
  it("is 1.0 before the campaign starts", () => {
    const c = makeCamp({ startedWeek: 10 });
    expect(campaignMultiplierNow(c, 5)).toBe(1);
  });

  it("is 1.0 after the campaign ends", () => {
    const c = makeCamp({ startedWeek: 0, durationWeeks: 5 });
    expect(campaignMultiplierNow(c, 5)).toBe(1);
    expect(campaignMultiplierNow(c, 20)).toBe(1);
  });

  it("ramps up toward peak in the first week", () => {
    const c = makeCamp({ peakMultiplier: 1.4, durationWeeks: 6 });
    const wk0 = campaignMultiplierNow(c, 0);
    const wk1 = campaignMultiplierNow(c, 1);
    expect(wk0).toBeGreaterThan(1);
    expect(wk1).toBeGreaterThan(wk0);
  });

  it("plateaus near peak in the middle of the run", () => {
    const c = makeCamp({ peakMultiplier: 1.4, durationWeeks: 6 });
    const plat = campaignMultiplierNow(c, 3);
    expect(plat).toBeCloseTo(1.4, 5);
  });

  it("fades back toward 1 near the end", () => {
    const c = makeCamp({ peakMultiplier: 1.4, durationWeeks: 6 });
    const last = campaignMultiplierNow(c, 5);
    expect(last).toBeLessThan(1.4);
    expect(last).toBeGreaterThan(1);
  });
});

describe("campaigns: campaignMultiplierForProduct — stacking with diminishing returns", () => {
  it("returns 1 for a product with no campaigns", () => {
    expect(campaignMultiplierForProduct("p1", [], 0)).toBe(1);
    expect(campaignMultiplierForProduct("p1", undefined, 0)).toBe(1);
  });

  it("stacks multiple campaigns sub-additively", () => {
    const a = makeCamp({ id: "a", peakMultiplier: 1.3, durationWeeks: 6 });
    const b = makeCamp({ id: "b", peakMultiplier: 1.3, durationWeeks: 6 });
    const mult = campaignMultiplierForProduct("p1", [a, b], 3);
    // Single at peak = 1.3. Two stacked would naively be 1.69, but diminishing should be less.
    expect(mult).toBeGreaterThan(1.3);
    expect(mult).toBeLessThan(1.69);
  });

  it("only counts campaigns targeting this product", () => {
    const a = makeCamp({ id: "a", productId: "p1", peakMultiplier: 1.5, durationWeeks: 6 });
    const b = makeCamp({ id: "b", productId: "p2", peakMultiplier: 1.5, durationWeeks: 6 });
    const mult = campaignMultiplierForProduct("p1", [a, b], 3);
    const mult2 = campaignMultiplierForProduct("p1", [a], 3);
    expect(mult).toBeCloseTo(mult2, 5);
  });
});

describe("campaigns: weeklyCampaignBurn", () => {
  it("returns 0 when no live campaigns", () => {
    expect(weeklyCampaignBurn([], 0)).toBe(0);
    expect(weeklyCampaignBurn(undefined, 0)).toBe(0);
  });

  it("distributes budget evenly over the duration", () => {
    const c = makeCamp({ budget: 12_000, durationWeeks: 4 });
    expect(weeklyCampaignBurn([c], 0)).toBe(3_000);
    expect(weeklyCampaignBurn([c], 2)).toBe(3_000);
  });

  it("doesn't count expired campaigns", () => {
    const c = makeCamp({ budget: 12_000, durationWeeks: 4, startedWeek: 0 });
    expect(weeklyCampaignBurn([c], 5)).toBe(0);
  });
});

describe("campaigns: dropExpired", () => {
  it("keeps live campaigns, drops finished ones", () => {
    const live = makeCamp({ id: "live", startedWeek: 10, durationWeeks: 6 });
    const done = makeCamp({ id: "done", startedWeek: 0, durationWeeks: 4 });
    const kept = dropExpired([live, done], 12);
    expect(kept.map(c => c.id)).toEqual(["live"]);
  });

  it("handles undefined gracefully", () => {
    expect(dropExpired(undefined, 12)).toEqual([]);
  });
});
