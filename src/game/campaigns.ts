/**
 * Marketing Campaigns — discrete, scheduled spending bursts (distinct from per-product
 * `marketingBudget`, which is always-on ad spend).
 *
 * A campaign has: a channel, a target product, a duration, a total budget spread across
 * the run, a peak signup multiplier (sampled at creation from the channel's distribution),
 * and a random performance roll that drives late-run flavor events (viral hit / PR flub).
 *
 * Campaigns stack multiplicatively with each other and with `marketingBudget`, so the
 * player has to watch for diminishing returns.
 */

import type { MarketingCampaign, MarketingChannel, ProductCategory } from "./types";
import type { RNG } from "./rng";

export interface ChannelInfo {
  id: MarketingChannel;
  label: string;
  blurb: string;
  /** Minimum sensible total budget for a meaningful result. Below this = wasted spend. */
  minBudget: number;
  /** Mean peak multiplier at the minimum budget. */
  baseMultiplier: [number, number];  // [mean, stdev]
  /** Typical duration range (weeks). */
  duration: [number, number];
  /** Which product categories this channel resonates with. */
  goodFor: ProductCategory[];
  /** 0..1 variance factor — higher = more YOLO. Influences the perf roll. */
  volatility: number;
}

export const CHANNELS: Record<MarketingChannel, ChannelInfo> = {
  "social": {
    id: "social",
    label: "Social (TikTok/IG/X)",
    blurb: "Cheap, viral-coded, noisy. Good for consumer + creator categories.",
    minBudget: 5_000,
    baseMultiplier: [1.15, 0.2],
    duration: [3, 6],
    goodFor: ["application", "content-media"],
    volatility: 0.6,
  },
  "content": {
    id: "content",
    label: "Content / SEO",
    blurb: "Blog posts, docs, YouTube, podcasts. Slow-burn, compounds over time.",
    minBudget: 10_000,
    baseMultiplier: [1.2, 0.08],
    duration: [8, 16],
    goodFor: ["dev-tools", "enterprise", "finance-ops", "security-it"],
    volatility: 0.2,
  },
  "paid-ads": {
    id: "paid-ads",
    label: "Paid ads (Google/Meta/LinkedIn)",
    blurb: "Predictable CAC. Scales with spend, caps with creative fatigue.",
    minBudget: 8_000,
    baseMultiplier: [1.22, 0.1],
    duration: [4, 8],
    goodFor: ["application", "enterprise", "finance-ops", "security-it", "content-media"],
    volatility: 0.25,
  },
  "pr": {
    id: "pr",
    label: "PR / earned media",
    blurb: "Press hits, launch stories, podcasts. Hit or miss but great for prestige.",
    minBudget: 15_000,
    baseMultiplier: [1.25, 0.25],
    duration: [3, 5],
    goodFor: ["enterprise", "security-it", "dev-tools", "finance-ops"],
    volatility: 0.7,
  },
  "events": {
    id: "events",
    label: "Conferences & events",
    blurb: "Booths, keynotes, meetups. Flavor for enterprise sales.",
    minBudget: 20_000,
    baseMultiplier: [1.18, 0.12],
    duration: [6, 10],
    goodFor: ["enterprise", "dev-tools", "security-it", "custom"],
    volatility: 0.3,
  },
  "influencer": {
    id: "influencer",
    label: "Influencer / creator partners",
    blurb: "Sponsor creators. Results range from 'nothing' to 'pipeline on fire.'",
    minBudget: 8_000,
    baseMultiplier: [1.28, 0.35],
    duration: [4, 7],
    goodFor: ["content-media", "application"],
    volatility: 0.8,
  },
};

/** Random sample from a truncated normal. */
function sampleNormal(rng: RNG, mean: number, stdev: number): number {
  // Box-Muller
  const u = Math.max(1e-9, rng.next());
  const v = Math.max(1e-9, rng.next());
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * stdev;
}

/**
 * Build a new campaign from a (channel, product, budget) spec. Peak multiplier is sampled
 * at creation so the player doesn't get save-scum opportunities.
 */
export function createCampaign(params: {
  id: string;
  name: string;
  channel: MarketingChannel;
  productId: string;
  productCategory: ProductCategory;
  budget: number;
  week: number;
  rng: RNG;
}): MarketingCampaign {
  const info = CHANNELS[params.channel];
  const [meanMult, stdevMult] = info.baseMultiplier;
  const budgetFactor = Math.min(1.5, params.budget / (info.minBudget * 2));
  const rawMult = sampleNormal(params.rng, meanMult, stdevMult);
  // Scale by budget: underfunded campaigns underperform; over-budget gets diminishing returns.
  const channelFit = info.goodFor.includes(params.productCategory) ? 1 : 0.7;
  const peakMultiplier = Math.max(
    0.95,
    1 + (rawMult - 1) * budgetFactor * channelFit,
  );
  const duration = params.rng.int(info.duration[0], info.duration[1]);
  const performanceRoll = Math.min(1, Math.max(0,
    0.5 + (rawMult - meanMult) / (stdevMult * 3) + params.rng.range(-info.volatility * 0.2, info.volatility * 0.2),
  ));
  const weeklySpend = params.budget / duration;
  const estimatedCAC = weeklySpend > 0 ? Math.round(weeklySpend / Math.max(1, 50 * (peakMultiplier - 1) + 1)) : undefined;
  return {
    id: params.id,
    name: params.name,
    channel: params.channel,
    productId: params.productId,
    budget: params.budget,
    startedWeek: params.week,
    durationWeeks: duration,
    peakMultiplier,
    performanceRoll,
    estimatedCAC,
  };
}

/**
 * Current multiplier for a campaign at a given week. Uses a simple trapezoid curve:
 *   - 1-week ramp
 *   - plateau at peak
 *   - 1-week fade
 * Returns 1 (neutral) if the campaign is finished or not yet started.
 */
export function campaignMultiplierNow(c: MarketingCampaign, weekNow: number): number {
  const age = weekNow - c.startedWeek;
  if (age < 0 || age >= c.durationWeeks) return 1;
  const ramp = 1;
  const fade = 1;
  if (age < ramp) return 1 + (c.peakMultiplier - 1) * ((age + 1) / (ramp + 1));
  const fadeStart = c.durationWeeks - fade;
  if (age >= fadeStart) {
    const fa = age - fadeStart;
    return 1 + (c.peakMultiplier - 1) * Math.max(0, 1 - (fa + 1) / (fade + 1));
  }
  return c.peakMultiplier;
}

/**
 * Aggregated signup multiplier for a product this week, blending all live campaigns.
 * Diminishing returns: second and third stacked campaigns contribute only half of their
 * raw multiplier delta.
 */
export function campaignMultiplierForProduct(
  productId: string,
  campaigns: MarketingCampaign[] | undefined,
  weekNow: number,
): number {
  if (!campaigns || campaigns.length === 0) return 1;
  const active = campaigns.filter(c => c.productId === productId && campaignMultiplierNow(c, weekNow) > 1.001);
  if (active.length === 0) return 1;
  let stacked = 1;
  let diminish = 1;
  for (const c of active) {
    const m = campaignMultiplierNow(c, weekNow);
    stacked *= 1 + (m - 1) * diminish;
    diminish *= 0.6; // each subsequent campaign contributes 60% of the prior
  }
  return stacked;
}

/** Weekly cost of all active campaigns (used by the finance rollup). */
export function weeklyCampaignBurn(campaigns: MarketingCampaign[] | undefined, weekNow: number): number {
  if (!campaigns) return 0;
  return campaigns.reduce((s, c) => {
    const age = weekNow - c.startedWeek;
    if (age < 0 || age >= c.durationWeeks) return s;
    return s + c.budget / c.durationWeeks;
  }, 0);
}

/** Drop expired campaigns. */
export function dropExpired(
  campaigns: MarketingCampaign[] | undefined,
  weekNow: number,
): MarketingCampaign[] {
  if (!campaigns) return [];
  return campaigns.filter(c => weekNow - c.startedWeek < c.durationWeeks);
}
