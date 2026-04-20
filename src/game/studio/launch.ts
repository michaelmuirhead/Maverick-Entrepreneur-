/**
 * Launch day + review score + post-launch sales curve.
 *
 * Launch mechanics:
 *   1) Compute a review score (Metacritic-style, 0..100) as a blend of quality,
 *      polish, techDebt, genre review weight, and scope expectation bias.
 *   2) Convert wishlists + hype into first-week sales at a review-scaled rate.
 *   3) Transition stage to "released" and populate `launched` payload.
 *
 * Post-launch sales follow a decaying curve:
 *   - Week 0 = first-week sales
 *   - Subsequent weeks decay by ~30% each (genre-dependent)
 *   - Review score determines the long-tail floor (masterworks have legs)
 *   - Genre trend drift and price cuts can re-boost sales
 */

import type { RNG } from "../rng";
import {
  GENRE_INFO, PLATFORM_INFO, SCOPE_INFO,
  defaultPriceFor, platformReach,
} from "./genres";
import type { Game, GameDevStage } from "./types";
import { hasLaunched } from "./games";

// =====================================================================================
// Review score
// =====================================================================================

/**
 * Roll a Metacritic-style review score. Weighted blend of craft and polish,
 * penalized by tech debt, with scope expectation bias (AAA is judged harshly)
 * and a small RNG jitter for variance.
 */
export function rollReviewScore(g: Game, rng: RNG): number {
  const genreInfo = GENRE_INFO[g.genre];
  const scopeBias = SCOPE_INFO[g.scope].reviewExpectationBias;

  // Core craft signal — quality and polish matter differently per genre.
  const craftCore = g.quality * (1 - genreInfo.reviewWeight * 0.3)
    + g.polish * (0.5 + genreInfo.reviewWeight * 0.5);

  // Tech debt punishes reviews — reviewers notice bugs, performance issues.
  const debtPenalty = g.techDebt * 0.4;

  // Crunch-shipped games often feel under-baked even if quality metrics look ok.
  const crunchPenalty = g.crunchActive ? 4 : 0;

  // RNG variance: ±8 points — captures reviewer taste + genre fit.
  const variance = rng.range(-8, 8);

  const raw = craftCore - debtPenalty - crunchPenalty + scopeBias + variance;
  return Math.max(10, Math.min(98, Math.round(raw)));
}

/** Descriptor for a review score — shown on the game detail page. */
export function reviewDescriptor(score: number): string {
  if (score >= 90) return "Universal Acclaim";
  if (score >= 80) return "Great";
  if (score >= 70) return "Generally Favorable";
  if (score >= 55) return "Mixed";
  if (score >= 40) return "Unfavorable";
  return "Disaster";
}

// =====================================================================================
// First-week sales
// =====================================================================================

export interface LaunchResult {
  game: Game;
  reviewScore: number;
  firstWeekSales: number;
  firstWeekRevenue: number;
  listPrice: number;
  netCashToStudio: number;
}

/**
 * Ship the game. Rolls the review score, computes first-week sales, and
 * transitions to "released" stage. Caller is responsible for crediting cash
 * to finance and emitting launch events.
 */
export function launchGame(g: Game, week: number, rng: RNG): LaunchResult {
  const reviewScore = rollReviewScore(g, rng);
  const listPrice = defaultPriceFor(g.genre, g.scope);
  const firstWeekSales = computeFirstWeekSales(g, reviewScore, rng);

  // Gross revenue = units × price. Net of platform rev share (blended across
  // shipping platforms, weighted by reach so the dominant platform dominates).
  const gross = firstWeekSales * listPrice;
  const blendedRevShare = blendedDevShare(g);
  const netCashToStudio = Math.round(gross * blendedRevShare);

  // Transition to released.
  const updated: Game = {
    ...g,
    stage: "released" as GameDevStage,
    version: "1.0",
    devProgress: 1,
    crunchActive: false, // crunch ends at ship
    launched: {
      week,
      reviewScore,
      firstWeekSales,
      totalSold: firstWeekSales,
      priceAtLaunch: listPrice,
      weeklyTailSales: [firstWeekSales],
    },
    lifetimeRevenue: g.lifetimeRevenue + netCashToStudio,
    peakWeeklySales: Math.max(g.peakWeeklySales, firstWeekSales),
  };

  return {
    game: updated,
    reviewScore,
    firstWeekSales,
    firstWeekRevenue: netCashToStudio,
    listPrice,
    netCashToStudio,
  };
}

/** First-week sales = wishlist conversion + organic launch discovery. */
function computeFirstWeekSales(g: Game, reviewScore: number, rng: RNG): number {
  const reviewFactor = 0.22 + (reviewScore / 100) * 0.25; // 0.22..0.47
  const hypeBoost = 1 + (g.hype / 100) * 0.6;             // 1.0..1.6
  const wishlistBuyers = Math.round(g.wishlist * reviewFactor * hypeBoost);

  // Organic discovery: function of genre reach, platform reach, and review.
  const genreReach = GENRE_INFO[g.genre].marketSize;
  const platforms = platformReach(g.platforms);
  const organic = Math.round(
    g.hype * genreReach * platforms * 50 * (reviewScore / 100),
  );

  // Scope bonus — AAA launches get a lot of shelf attention regardless of hype.
  const scopeBonus = g.scope === "AAA" ? 25_000 : g.scope === "AA" ? 5_000 : 0;

  // RNG jitter: ±20%.
  const jitter = rng.range(0.8, 1.2);

  return Math.max(100, Math.round((wishlistBuyers + organic + scopeBonus) * jitter));
}

/** Blended dev revenue share across platforms, weighted by reach. */
function blendedDevShare(g: Game): number {
  if (g.platforms.length === 0) return 0.7;
  let totalReach = 0;
  let weightedShare = 0;
  for (const p of g.platforms) {
    const info = PLATFORM_INFO[p];
    totalReach += info.reach;
    weightedShare += info.reach * info.devRevShare;
  }
  return totalReach > 0 ? weightedShare / totalReach : 0.7;
}

// =====================================================================================
// Post-launch sales curve
// =====================================================================================

/**
 * Compute this week's sales for a post-launch game. Decays from first-week
 * sales with a review-score-dependent floor. Returns units sold + net cash
 * to studio. Caller is responsible for updating the Game's state.
 */
export function tickPostLaunchSales(
  g: Game,
  weekNow: number,
  rng: RNG,
): { units: number; revenue: number } {
  if (!hasLaunched(g) || !g.launched) return { units: 0, revenue: 0 };

  const weeksSinceLaunch = weekNow - g.launched.week;
  if (weeksSinceLaunch <= 0) return { units: 0, revenue: 0 };

  const review = g.launched.reviewScore;
  // Decay rate: ~0.70 by default, adjusted by review score.
  // Masterworks (review 90+) decay at ~0.90 (keep selling). Flops (review <40)
  // decay at ~0.55 (fall off a cliff).
  const decayRate = 0.55 + Math.min(0.4, (review / 100) * 0.4);

  // Exponential decay from first-week baseline.
  const baselineDecay = g.launched.firstWeekSales * Math.pow(decayRate, weeksSinceLaunch);

  // Long-tail floor: great games sell a little forever.
  const floor = review >= 85 ? g.launched.firstWeekSales * 0.01
              : review >= 70 ? g.launched.firstWeekSales * 0.005
              : 0;

  // Price cuts re-boost sales — a 50%-off sale in week 20 revives the curve.
  // (We don't model discounts explicitly yet — just a small occasional bump.)
  const seasonalBoost = (weeksSinceLaunch % 13 === 0) ? 1.5 : 1.0;

  // RNG jitter: ±15%.
  const jitter = rng.range(0.85, 1.15);

  const units = Math.max(0, Math.round((baselineDecay + floor) * seasonalBoost * jitter));
  const netRevShare = blendedDevShare(g);
  const revenue = Math.round(units * g.launched.priceAtLaunch * netRevShare);
  return { units, revenue };
}

/**
 * Decide if the game should transition from "released" to a quieter post-launch
 * stage ("live-service" for F2P genres, "mature" for one-shot games), or from
 * "mature" to "sunset".
 */
export function nextPostLaunchStage(g: Game, weekNow: number): GameDevStage {
  if (!hasLaunched(g) || !g.launched) return g.stage;
  const weeksSinceLaunch = weekNow - g.launched.week;

  if (g.stage === "released") {
    // After 8 weeks, transition to live-service (if viable) or mature.
    if (weeksSinceLaunch >= 8) {
      const liveServiceViable = GENRE_INFO[g.genre].liveServiceViable;
      return liveServiceViable ? "live-service" : "mature";
    }
    return "released";
  }
  if (g.stage === "live-service" || g.stage === "mature") {
    // Sunset when sales have effectively died (<10 units/week sustained) or
    // live-service MAU has crashed. Use tail sales as a proxy.
    const recentTail = g.launched.weeklyTailSales.slice(-4);
    const avgTail = recentTail.length > 0
      ? recentTail.reduce((s, n) => s + n, 0) / recentTail.length
      : 0;
    if (avgTail < 10 && weeksSinceLaunch > 52) return "sunset";
    return g.stage;
  }
  return g.stage;
}
