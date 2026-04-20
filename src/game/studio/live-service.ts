/**
 * Live-service + DLC pipeline.
 *
 * Live-service games (MMOs, battle royales, extraction shooters, mobile F2P)
 * don't end when they ship — they enter a perpetual content cycle where
 * monthly-active users generate ARPU revenue, churn toward a cadence-driven
 * attrition rate, and spike on content drops.
 *
 * DLC is the other post-launch money-making lane: packs can be queued up
 * pre-launch or after launch, each takes development time, and shipping one
 * bumps the base game's sales tail while selling the pack itself.
 *
 * This module handles:
 *   - Initializing live-service state when a game transitions from "released"
 *     to "live-service" (see launch.ts nextPostLaunchStage).
 *   - The weekly live-service tick: MAU growth/churn, ARPDAU revenue, content
 *     drops, and peak-MAU tracking.
 *   - DLC lifecycle: queueing, advancing dev, releasing, spike handling.
 */

import type { RNG } from "../rng";
import { GENRE_INFO } from "./genres";
import type { DlcPack, Game, LiveServiceState } from "./types";
import { hasLaunched } from "./games";

// =====================================================================================
// Tunables
// =====================================================================================

/** Baseline weekly MAU churn rate (fraction that leaves per week). */
const BASE_WEEKLY_CHURN = 0.05;

/**
 * Churn rate degrades if the content cadence is slow. Every week past the
 * scheduled cadence adds this much churn. Example: cadence=4, weeksSinceDrop=6
 *   → churn += 0.02 * 2 = 0.04, so total weekly churn jumps ~9%.
 */
const STALE_CONTENT_CHURN_PER_WEEK = 0.02;

/** Maximum weekly churn cap — even at its worst, games don't lose 100% of MAU in a week. */
const MAX_WEEKLY_CHURN = 0.35;

/** New-user growth scale — fraction of missing-from-peak slots filled per week under ideal conditions. */
const GROWTH_RECOVERY_PER_WEEK = 0.08;

/** ARPDAU (cents/day per active user) is game-set; we derive weekly revenue as MAU * dau/mau_ratio * 7 * ARPDAU. */
const DAU_OVER_MAU = 0.3; // industry heuristic: ~30% of MAU log in on any given day

/** Content-drop MAU kickback: shipping a content drop revives ~15% of peak MAU back into active play. */
const CONTENT_DROP_MAU_BOOST = 0.15;

/** Review-bomb MAU damage: sustained controversy bleeds ~8%/week from MAU. */
const REVIEW_BOMB_WEEKLY_CHURN = 0.08;

// =====================================================================================
// Init / transition
// =====================================================================================

/**
 * Seed a LiveServiceState when a game first enters the "live-service" stage.
 * MAU is calibrated off first-week sales: a game that sold 500k launch week
 * typically retains ~60% of buyers as MAU in week 1 of live-service.
 *
 * Caller (launch.ts nextPostLaunchStage / tick.ts transition) flips the stage
 * and calls this to populate `liveService`. Idempotent — skips if already set.
 */
export function initLiveService(g: Game, weekNow: number): Game {
  if (g.liveService) return g;
  if (!g.launched) return g;
  const genreInfo = GENRE_INFO[g.genre];
  if (!genreInfo.liveServiceViable) return g;

  // Starting MAU: ~60% of firstWeekSales for hot launches, lower for flops.
  const reviewMult = g.launched.reviewScore >= 80 ? 0.7
                  : g.launched.reviewScore >= 60 ? 0.55
                  : g.launched.reviewScore >= 40 ? 0.35
                  : 0.2;
  const startingMau = Math.round(g.launched.firstWeekSales * reviewMult);

  // ARPDAU in cents. F2P mobile and live-service shooters monetize hardest.
  // Premium-priced live-service sits lower (most revenue came at purchase).
  const arpdau = g.launched.priceAtLaunch === 0 ? 35 : 12;

  // Cadence: narrative-light genres drop faster (weekly/biweekly), story-heavy slower.
  const contentCadence =
    g.genre === "live-service"  ? 4 :
    g.genre === "mobile-casual" ? 2 :
    g.genre === "fps"           ? 6 :
    g.genre === "sports"        ? 12 :
                                  8;

  return {
    ...g,
    liveService: {
      mau: startingMau,
      peakMau: startingMau,
      arpdau,
      contentCadence,
      lastContentDropWeek: weekNow,
    },
  };
}

// =====================================================================================
// Weekly tick
// =====================================================================================

export interface LiveServiceTickResult {
  game: Game;
  /** Revenue from live-service this week, AFTER platform rev-share (caller credits). */
  revenue: number;
  /** MAU delta for the dashboard. */
  mauDelta: number;
  /** Did a content drop fire this week? */
  contentDropped: boolean;
}

/**
 * Advance the live-service state by one week: apply churn, apply content
 * drops on cadence, update MAU, compute revenue. The caller handles cash
 * credit and event emission.
 */
export function tickLiveService(
  g: Game,
  weekNow: number,
  rng: RNG,
  /** Blended platform dev-rev share across shipping platforms (computed by caller). */
  platformDevShare: number,
): LiveServiceTickResult {
  if (!g.liveService || !hasLaunched(g)) {
    return { game: g, revenue: 0, mauDelta: 0, contentDropped: false };
  }

  const ls = g.liveService;
  const weeksSinceDrop = weekNow - ls.lastContentDropWeek;

  // 1) Churn this week — baseline + stale content penalty + review-bomb tax.
  const staleChurn = Math.max(0, weeksSinceDrop - ls.contentCadence) * STALE_CONTENT_CHURN_PER_WEEK;
  const bombChurn = g.reviewBomb ? REVIEW_BOMB_WEEKLY_CHURN * g.reviewBomb.severity : 0;
  const churn = Math.min(MAX_WEEKLY_CHURN, BASE_WEEKLY_CHURN + staleChurn + bombChurn);
  const lost = Math.round(ls.mau * churn);

  // 2) Growth — some organic discovery pulls players back if the game isn't declining.
  //    Growth is strongest when MAU is well below peak (room to recover) and the game
  //    is fresh. Exponentially dampens as weeks accumulate since release.
  const weeksSinceLaunch = weekNow - (g.launched?.week ?? weekNow);
  const maturityDecay = Math.max(0.2, 1 - weeksSinceLaunch / 78); // 78 weeks ~ 1.5 years
  const peakHeadroom = Math.max(0, ls.peakMau - ls.mau);
  const growth = Math.round(peakHeadroom * GROWTH_RECOVERY_PER_WEEK * maturityDecay * rng.range(0.7, 1.3));

  // 3) Content drop — fires on cadence.
  let contentDropped = false;
  let lastContentDropWeek = ls.lastContentDropWeek;
  let dropBoost = 0;
  if (weeksSinceDrop >= ls.contentCadence) {
    contentDropped = true;
    lastContentDropWeek = weekNow;
    dropBoost = Math.round(ls.peakMau * CONTENT_DROP_MAU_BOOST);
  }

  // 4) Resolve new MAU and peak.
  const newMau = Math.max(0, ls.mau - lost + growth + dropBoost);
  const peakMau = Math.max(ls.peakMau, newMau);
  const mauDelta = newMau - ls.mau;

  // 5) Revenue = MAU * DAU/MAU ratio * 7 days * ARPDAU (cents → dollars).
  const grossRevenue = Math.round((newMau * DAU_OVER_MAU * 7 * ls.arpdau) / 100);
  const revenue = Math.round(grossRevenue * platformDevShare);

  const updatedGame: Game = {
    ...g,
    liveService: {
      ...ls,
      mau: newMau,
      peakMau,
      lastContentDropWeek,
      lastChurnSpikeWeek: churn >= 0.2 ? weekNow : ls.lastChurnSpikeWeek,
    },
    lifetimeRevenue: g.lifetimeRevenue + revenue,
  };

  return { game: updatedGame, revenue, mauDelta, contentDropped };
}

// =====================================================================================
// DLC pipeline
// =====================================================================================

export interface NewDlcParams {
  id: string;
  name: string;
  /** Dev cost as fraction of base-game dev budget. Typical: 0.1 (map pack) .. 0.3 (expansion). */
  costMult: number;
  /** Week the studio plans to ship. Dev starts immediately; plannedWeek is advisory. */
  plannedWeek: number;
  /** Boost multiplier on base-game sales tail when this DLC ships. */
  salesSpike?: number;
}

/** Queue a DLC for development. Requires game to be launched. */
export function queueDlc(g: Game, params: NewDlcParams): Game {
  if (!hasLaunched(g)) return g;
  const pack: DlcPack = {
    id: params.id,
    name: params.name,
    costMult: Math.max(0.05, Math.min(0.5, params.costMult)),
    plannedWeek: params.plannedWeek,
    devProgress: 0,
    revenue: 0,
    salesSpike: params.salesSpike ?? 1.5,
  };
  return { ...g, dlcPipeline: [...g.dlcPipeline, pack] };
}

/**
 * Advance DLC development by one week. Returns the updated game and any DLC
 * packs that shipped this week (so the caller can emit events + credit the
 * sales spike against the base game tail).
 *
 * Progress per week = (team fraction assigned to DLC) / (weeks needed).
 * Weeks needed = costMult * base targetDevWeeks, floored at 2 weeks.
 */
export function tickDlcPipeline(
  g: Game,
  weekNow: number,
  rng: RNG,
  platformDevShare: number,
): { game: Game; shipped: DlcPack[]; revenueFromShips: number } {
  if (!hasLaunched(g) || g.dlcPipeline.length === 0) {
    return { game: g, shipped: [], revenueFromShips: 0 };
  }

  const shipped: DlcPack[] = [];
  let revenueFromShips = 0;

  const nextPipeline = g.dlcPipeline.map(pack => {
    if (pack.releasedWeek != null) return pack; // already out

    const weeksNeeded = Math.max(2, Math.round(g.targetDevWeeks * pack.costMult));
    const progressPerWeek = 1 / weeksNeeded;
    const newProgress = Math.min(1, pack.devProgress + progressPerWeek);

    if (newProgress >= 1) {
      // Ship it — compute launch-week revenue for the DLC itself.
      // DLC price heuristic: costMult * 3 * base price, floored at $5.
      const basePrice = g.launched?.priceAtLaunch ?? 20;
      const dlcPrice = Math.max(5, Math.round(basePrice * pack.costMult * 3));
      // Attach rate: ~20-40% of base-game owners buy the DLC, weighted by review.
      const reviewScore = g.launched?.reviewScore ?? 60;
      const baseAttach = 0.2 + (reviewScore / 100) * 0.2;
      const attachJitter = rng.range(0.8, 1.2);
      const attachRate = baseAttach * attachJitter;
      const baseOwners = g.launched?.totalSold ?? 0;
      const dlcSales = Math.round(baseOwners * attachRate);
      const grossDlcRevenue = dlcSales * dlcPrice;
      const netDlcRevenue = Math.round(grossDlcRevenue * platformDevShare);
      revenueFromShips += netDlcRevenue;

      const released: DlcPack = {
        ...pack,
        devProgress: 1,
        releasedWeek: weekNow,
        revenue: pack.revenue + netDlcRevenue,
      };
      shipped.push(released);
      return released;
    }
    return { ...pack, devProgress: newProgress };
  });

  const updatedGame: Game = {
    ...g,
    dlcPipeline: nextPipeline,
    lifetimeRevenue: g.lifetimeRevenue + revenueFromShips,
  };

  return { game: updatedGame, shipped, revenueFromShips };
}

/** Has this game's DLC pipeline been fully shipped? */
export function allDlcShipped(g: Game): boolean {
  return g.dlcPipeline.length > 0 && g.dlcPipeline.every(p => p.releasedWeek != null);
}

/** How many DLC packs are still in development? */
export function dlcInDevCount(g: Game): number {
  return g.dlcPipeline.filter(p => p.releasedWeek == null).length;
}

// =====================================================================================
// Forecasts + UI helpers
// =====================================================================================

/**
 * Estimated lifetime value per MAU, assuming current ARPDAU and churn stay
 * roughly constant. Useful for the "Is it worth it to keep this game alive?"
 * advisor. Units: dollars per user.
 */
export function estimatedLtvPerUser(ls: LiveServiceState): number {
  // LTV = weekly revenue per user / weekly churn.
  const weeklyRevPerUser = (DAU_OVER_MAU * 7 * ls.arpdau) / 100;
  const churn = Math.max(0.01, BASE_WEEKLY_CHURN); // floor to avoid divide-by-zero
  return Math.round(weeklyRevPerUser / churn);
}

/** Descriptor for live-service health — shown in a badge. */
export function liveServiceHealth(ls: LiveServiceState): "thriving" | "stable" | "declining" | "dying" {
  if (ls.peakMau === 0) return "dying";
  const ratio = ls.mau / ls.peakMau;
  if (ratio >= 0.8) return "thriving";
  if (ratio >= 0.4) return "stable";
  if (ratio >= 0.1) return "declining";
  return "dying";
}

/** Human-readable blurb for the live-service panel. */
export function liveServiceBlurb(g: Game): string {
  if (!g.liveService) return "Not a live-service title.";
  const h = liveServiceHealth(g.liveService);
  const mau = g.liveService.mau.toLocaleString();
  const peak = g.liveService.peakMau.toLocaleString();
  switch (h) {
    case "thriving": return `Thriving — ${mau} MAU (peak ${peak}). Keep the content flowing.`;
    case "stable":   return `Stable at ${mau} MAU. Cadence is holding.`;
    case "declining": return `Declining — ${mau} MAU of ${peak} peak. Consider a major drop.`;
    case "dying":    return `Dying — ${mau} MAU. Wind it down or swing for the fences.`;
  }
}

/**
 * Recommended DLC size for the next pack, based on the game's health and
 * how mature the live-service is. Declining games benefit from a big
 * expansion push; thriving games should keep cadence tight.
 */
export function recommendedNextDlcSize(g: Game): { costMult: number; label: string } {
  if (!g.liveService) {
    return { costMult: 0.15, label: "Small pack" };
  }
  const h = liveServiceHealth(g.liveService);
  if (h === "thriving" || h === "stable") {
    return { costMult: 0.12, label: "Content drop" };
  }
  if (h === "declining") {
    return { costMult: 0.25, label: "Major expansion" };
  }
  return { costMult: 0.35, label: "Hail-mary expansion" };
}
