/**
 * Platform deals + genre trend drift + review bombing.
 *
 * Three world-state systems that live outside individual game loops but shape
 * every game's trajectory:
 *
 *   1) Platform deals — console first-parties (PlayStation, Xbox, Nintendo)
 *      and aggregators (Epic, Game Pass) offer exclusivity or marketing
 *      support in exchange for limiting platform reach. Offers appear on the
 *      studio's desk; the player accepts, counters, or declines.
 *
 *   2) Genre trend drift — a shifting map of genre popularity. Trends do a
 *      mean-reverting random walk with occasional "regime change" jolts
 *      (a breakout indie hit revives narrative games; an overhyped AAA
 *      flop cools extraction shooters). Trends multiply hype and sales.
 *
 *   3) Review bombing — post-launch controversy events (price hike, invasive
 *      microtransactions, political statement, cancelled feature) that drag
 *      on sales and live-service MAU. Severity decays naturally or faster
 *      with a studio response.
 */

import type { RNG } from "../rng";
import { GENRE_INFO, GENRE_ORDER, PLATFORM_INFO } from "./genres";
import type {
  Game, GameGenre, GamePlatform, GenreTrend,
  PlatformDealOffer,
} from "./types";
import { hasLaunched, isInDev } from "./games";

// =====================================================================================
// Platform deals
// =====================================================================================

/** Base probability (per week, per high-profile game) that a platform sends an offer. */
const OFFER_PROBABILITY = 0.04;

/** Hype threshold for a game to even be offer-eligible — platforms don't bid on flops. */
const OFFER_HYPE_MIN = 40;

/** Base upfront payment as a fraction of estimated lifetime revenue. */
const OFFER_UPFRONT_FRAC = 0.15;

/** Platforms that actually cut exclusivity deals (no deals on mobile/web). */
const DEAL_PLATFORMS: GamePlatform[] = ["playstation", "xbox", "switch"];

/**
 * Decide whether to spawn a new offer for any in-dev games this week.
 * Returns a list of new offers to append to `platformOffers`. Caller updates
 * state and emits UI events.
 *
 * Deals are more likely for:
 *   - High-hype / high-wishlist games (platforms bid on buzz)
 *   - AA/AAA scopes (indie rarely gets exclusivity paper)
 *   - Genres that perform well on the offering platform (RPG → PlayStation, etc.)
 */
export function rollPlatformOffers(
  games: Game[],
  existingOffers: PlatformDealOffer[],
  weekNow: number,
  rng: RNG,
  idGen: (prefix: string) => string,
): PlatformDealOffer[] {
  const offers: PlatformDealOffer[] = [];
  const openOfferGameIds = new Set(
    existingOffers
      .filter(o => o.expiresWeek > weekNow)
      .map(o => o.targetGameId),
  );

  for (const g of games) {
    if (!isInDev(g)) continue;
    if (g.scope === "indie") continue; // skip indie — rare to see console deal offers
    if (g.hype < OFFER_HYPE_MIN) continue;
    if (openOfferGameIds.has(g.id)) continue; // already has an open offer

    const p = OFFER_PROBABILITY * (g.hype / 100) * (g.scope === "AAA" ? 1.5 : 1.0);
    if (!rng.chance(p)) continue;

    // Pick which platform sends the offer. Skip platforms the game already plans to ship on
    // as a primary — a Steam-first game might get a PS exclusive pitch.
    const eligiblePlatforms = DEAL_PLATFORMS.filter(plat => {
      const info = PLATFORM_INFO[plat];
      return info.exclusivityAllowed;
    });
    if (eligiblePlatforms.length === 0) continue;
    const platform = rng.pick(eligiblePlatforms);

    // Estimate the game's lifetime revenue for sizing the upfront.
    const estPrice = g.launched?.priceAtLaunch ?? 30;
    const reach = GENRE_INFO[g.genre].marketSize;
    const estLifetimeUnits = Math.round((g.hype + g.wishlist * 0.3) * reach * 120);
    const estLifetimeRev = estLifetimeUnits * estPrice;

    const upfront = Math.round(estLifetimeRev * OFFER_UPFRONT_FRAC * rng.range(0.8, 1.3));
    const timed = rng.chance(0.6) ? rng.pick([13, 26, 52]) : undefined; // timed exclusivity common
    const fullExclusivity = rng.chance(0.35) && g.scope === "AAA";
    const marketingBoost = 1 + rng.range(0.2, 0.8);

    offers.push({
      id: idGen("platform_offer"),
      platform,
      targetGameId: g.id,
      timedWeeks: timed,
      upfrontPayment: upfront,
      marketingBoost,
      offeredWeek: weekNow,
      expiresWeek: weekNow + 3, // player has ~3 weeks to decide
      fullExclusivity,
    });
  }

  return offers;
}

/**
 * Accept a platform offer — apply exclusivity to the game. Caller is
 * responsible for crediting the upfront payment and removing the offer.
 * Returns the updated game with exclusivity attached.
 */
export function acceptPlatformOffer(g: Game, offer: PlatformDealOffer, weekNow: number): Game {
  if (g.id !== offer.targetGameId) return g;
  return {
    ...g,
    exclusivity: {
      platform: offer.platform,
      signedWeek: weekNow,
      expiresWeek: offer.timedWeeks ? weekNow + offer.timedWeeks : undefined,
      upfrontPaid: offer.upfrontPayment,
      marketingBoost: offer.marketingBoost,
    },
    // For full exclusivity, restrict platforms to just the deal platform.
    // Timed exclusivity leaves the full platform list intact; the game launches
    // on the deal platform first, then others after timedWeeks (we don't model
    // delayed launches at per-platform granularity — the marketing boost is
    // the main game effect).
    platforms: offer.fullExclusivity ? [offer.platform] : g.platforms,
  };
}

/** Expire stale platform offers. */
export function expirePlatformOffers(
  offers: PlatformDealOffer[],
  weekNow: number,
): PlatformDealOffer[] {
  return offers.filter(o => o.expiresWeek > weekNow);
}

/** Has a game's timed exclusivity expired? If so, the platform list can open back up. */
export function hasExclusivityExpired(g: Game, weekNow: number): boolean {
  if (!g.exclusivity) return false;
  if (g.exclusivity.expiresWeek == null) return false; // permanent deal
  return weekNow >= g.exclusivity.expiresWeek;
}

/** Descriptor for UI — summarizes a deal offer in one line. */
export function describePlatformOffer(offer: PlatformDealOffer): string {
  const plat = PLATFORM_INFO[offer.platform].label;
  const ex = offer.fullExclusivity ? "full" : offer.timedWeeks ? `${offer.timedWeeks}-wk timed` : "permanent";
  const up = offer.upfrontPayment.toLocaleString();
  return `${plat} — ${ex} exclusivity · $${up} upfront · ${offer.marketingBoost.toFixed(1)}× marketing`;
}

// =====================================================================================
// Genre trend drift
// =====================================================================================

/** Mean-reversion pull toward 1.0 per week. Higher = trends don't drift far. */
const TREND_MEAN_REVERSION = 0.04;

/** Per-week random walk magnitude. */
const TREND_WALK_STDDEV = 0.015;

/** Weekly probability of a regime change (big jump in popularity). */
const REGIME_CHANGE_PROBABILITY = 0.01;

/** Minimum regime duration before another regime change can fire on the same genre. */
const MIN_REGIME_WEEKS = 26;

/** Build the initial genre trend table with all genres near 1.0. */
export function initGenreTrends(rng: RNG, weekNow: number): GenreTrend[] {
  return GENRE_ORDER.map(genre => ({
    genre,
    popularity: rng.range(0.9, 1.1),
    drift: rng.range(-0.01, 0.01),
    regimeStartedWeek: weekNow,
  }));
}

/**
 * Advance all genre trends one week. Each trend does a mean-reverting random
 * walk; occasionally a regime change fires and jolts popularity up or down.
 */
export function tickGenreTrends(
  trends: GenreTrend[],
  weekNow: number,
  rng: RNG,
): { trends: GenreTrend[]; regimeChanges: { genre: GameGenre; newPopularity: number }[] } {
  const regimeChanges: { genre: GameGenre; newPopularity: number }[] = [];

  const nextTrends = trends.map(t => {
    const eligibleForRegime = weekNow - t.regimeStartedWeek >= MIN_REGIME_WEEKS;
    if (eligibleForRegime && rng.chance(REGIME_CHANGE_PROBABILITY)) {
      // Flip: if currently hot, it cools; if cooling, it heats.
      const direction = t.popularity >= 1.0 ? -1 : 1;
      const jump = rng.range(0.25, 0.6) * direction;
      const newPop = Math.max(0.3, Math.min(1.8, t.popularity + jump));
      regimeChanges.push({ genre: t.genre, newPopularity: newPop });
      return {
        ...t,
        popularity: newPop,
        drift: direction > 0 ? rng.range(0.005, 0.02) : rng.range(-0.02, -0.005),
        regimeStartedWeek: weekNow,
      };
    }

    // Standard random walk with mean reversion.
    const toMean = (1.0 - t.popularity) * TREND_MEAN_REVERSION;
    const walk = rng.range(-TREND_WALK_STDDEV, TREND_WALK_STDDEV);
    const newDrift = t.drift * 0.7 + walk * 0.3; // momentum + noise
    const newPop = Math.max(0.3, Math.min(1.8, t.popularity + toMean + newDrift));

    return { ...t, popularity: newPop, drift: newDrift };
  });

  return { trends: nextTrends, regimeChanges };
}

/** Look up current popularity for a genre. Defaults to 1.0 if genre not found. */
export function genrePopularity(trends: GenreTrend[], genre: GameGenre): number {
  return trends.find(t => t.genre === genre)?.popularity ?? 1.0;
}

/** Descriptor for a popularity reading — used in trend widget. */
export function popularityDescriptor(pop: number): "cooling" | "quiet" | "neutral" | "hot" | "on-fire" {
  if (pop < 0.6) return "cooling";
  if (pop < 0.85) return "quiet";
  if (pop < 1.15) return "neutral";
  if (pop < 1.5) return "hot";
  return "on-fire";
}

/** Ranked list of genres by popularity — top 3 hot, bottom 3 cold. */
export function trendRankings(trends: GenreTrend[]): {
  hot: GenreTrend[];
  cold: GenreTrend[];
} {
  const sorted = [...trends].sort((a, b) => b.popularity - a.popularity);
  return {
    hot: sorted.slice(0, 3),
    cold: sorted.slice(-3).reverse(),
  };
}

// =====================================================================================
// Review bombing
// =====================================================================================

/** Weekly probability of a review bomb igniting on a mature live-service title. */
const REVIEW_BOMB_IGNITE_BASE = 0.003;

/** Review-bomb severity decays by this per week (natural cool-off). */
const REVIEW_BOMB_DECAY_PER_WEEK = 0.08;

/** Severity below which the bomb is considered cleared. */
const REVIEW_BOMB_CLEAR_THRESHOLD = 0.1;

/** Plausible reasons for a review bomb — drives flavor text. */
const REVIEW_BOMB_REASONS: { reason: string; min: number; max: number }[] = [
  { reason: "Sudden price hike",              min: 0.3, max: 0.6 },
  { reason: "New mandatory microtransaction", min: 0.5, max: 0.9 },
  { reason: "Cut content DLC controversy",    min: 0.4, max: 0.7 },
  { reason: "PR statement backlash",          min: 0.3, max: 0.7 },
  { reason: "Platform exclusivity outrage",   min: 0.4, max: 0.8 },
  { reason: "Cancelled promised feature",     min: 0.5, max: 0.9 },
  { reason: "Major balance patch revolt",     min: 0.2, max: 0.5 },
  { reason: "Server outages + no comms",      min: 0.4, max: 0.8 },
];

/**
 * Decide whether a review bomb ignites on a post-launch game this week. Called
 * by the studio tick for each launched game. If this returns a new bomb, the
 * caller sets `game.reviewBomb` to it and emits an event.
 */
export function maybeIgniteReviewBomb(
  g: Game,
  weekNow: number,
  rng: RNG,
): Game["reviewBomb"] | null {
  if (!hasLaunched(g)) return null;
  if (g.reviewBomb) return null; // already bombed — can't re-ignite
  const weeksSinceLaunch = weekNow - (g.launched?.week ?? weekNow);
  if (weeksSinceLaunch < 2) return null; // honeymoon period

  // Higher base chance on live-service / high-MAU titles — more visibility = more incidents.
  const visibility = g.liveService ? Math.min(2, g.liveService.mau / 100_000) : 1;
  const chance = REVIEW_BOMB_IGNITE_BASE * visibility;
  if (!rng.chance(chance)) return null;

  const template = rng.pick(REVIEW_BOMB_REASONS);
  const severity = rng.range(template.min, template.max);
  return { startedWeek: weekNow, severity, reason: template.reason };
}

/**
 * Decay an active review bomb one week. Returns the updated reviewBomb field
 * (or undefined if cleared). Caller patches the game with the result.
 */
export function decayReviewBomb(
  bomb: Game["reviewBomb"],
  weekNow: number,
): Game["reviewBomb"] | undefined {
  if (!bomb) return undefined;
  const weeksActive = weekNow - bomb.startedWeek;
  const newSeverity = bomb.severity - REVIEW_BOMB_DECAY_PER_WEEK;
  if (newSeverity < REVIEW_BOMB_CLEAR_THRESHOLD) return undefined;
  // Very long bombs (>20 weeks) cool faster — the internet moves on.
  const fatigueDecay = weeksActive > 20 ? REVIEW_BOMB_DECAY_PER_WEEK : 0;
  const finalSeverity = Math.max(REVIEW_BOMB_CLEAR_THRESHOLD, newSeverity - fatigueDecay);
  return { ...bomb, severity: finalSeverity };
}

/**
 * Player-initiated response to a review bomb. Spending money on PR ops cuts
 * severity roughly in half but costs a one-time fee. Returns the new severity
 * (or undefined = cleared). Caller deducts cash.
 */
export function respondToReviewBomb(
  bomb: Game["reviewBomb"],
  responseQuality: "apology" | "compensation" | "rollback",
): { cost: number; newBomb: Game["reviewBomb"] | undefined } {
  if (!bomb) return { cost: 0, newBomb: undefined };
  const costs = { apology: 10_000, compensation: 75_000, rollback: 250_000 };
  const severityMults = { apology: 0.7, compensation: 0.4, rollback: 0.15 };
  const newSeverity = bomb.severity * severityMults[responseQuality];
  const newBomb = newSeverity < REVIEW_BOMB_CLEAR_THRESHOLD
    ? undefined
    : { ...bomb, severity: newSeverity };
  return { cost: costs[responseQuality], newBomb };
}

/** Descriptor for a review bomb severity. */
export function reviewBombDescriptor(severity: number): "smoldering" | "burning" | "inferno" {
  if (severity < 0.4) return "smoldering";
  if (severity < 0.7) return "burning";
  return "inferno";
}

/** Blurb for the UI widget. */
export function reviewBombBlurb(bomb: NonNullable<Game["reviewBomb"]>): string {
  const d = reviewBombDescriptor(bomb.severity);
  return `${bomb.reason} — ${d} (severity ${(bomb.severity * 100).toFixed(0)}%).`;
}
