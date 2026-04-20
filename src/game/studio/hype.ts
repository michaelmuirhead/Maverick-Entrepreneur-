/**
 * Hype & wishlist pre-launch model.
 *
 * Hype is a decaying meter in [0, 100] that represents how much attention the
 * game is getting: reveal trailers, showcase appearances, streamer coverage,
 * marketing spend. Every week:
 *   - Hype decays exponentially (half-life ~8 weeks)
 *   - Marketing spend + current quality add hype
 *   - A fraction of hype "locks in" as wishlists
 *   - Showcase bursts hit on their airdate (applied externally in tick)
 *
 * At launch, wishlists convert to first-week buyers at ~25..45% depending on
 * review score and genre. Hype at launch acts as a multiplier on both
 * wishlist conversion and first-month organic discovery.
 */

import type { Game, GameGenre } from "./types";
import { GENRE_INFO } from "./genres";
import { hasLaunched } from "./games";

// =====================================================================================
// Tunables
// =====================================================================================

/** Weekly hype decay factor — ~8-week half life (0.917 ^ 8 ≈ 0.5). */
const HYPE_DECAY = 0.917;

/** Marketing $/wk needed to generate 1 point of hype. Higher = marketing is
 *  less efficient. Tuned so a $5k/wk indie campaign generates ~5 hype/wk. */
const MARKETING_COST_PER_HYPE = 1_000;

/** Maximum hype that marketing spend alone can sustain (before diminishing
 *  returns kick in). Showcase bursts can push above this temporarily. */
const HYPE_MARKETING_CEILING = 60;

/** Fraction of hype that converts to wishlists each week. Hype is fleeting —
 *  wishlists persist. Tuned to 0.04 so 100 hype sustained for 10 weeks yields
 *  ~40 net wishlists per potential fan per marketing cycle. */
const WISHLIST_CONVERSION_RATE = 0.04;

/** Wishlists are measured in "potential buyers" scaled up by the game's reach.
 *  The actual number of wishlists displayed to the player is `wishlist` itself
 *  — it's already in raw units. */

// =====================================================================================
// Per-week hype update
// =====================================================================================

/**
 * Apply a single week of hype mechanics. Returns the updated game. Called from
 * the studio tick for every in-dev AND freshly-launched game (hype keeps
 * decaying for a few weeks after launch, contributing to the tail).
 */
export function tickHype(g: Game): Game {
  // Don't accrue new wishlist post-launch — they've already converted or churned.
  const preLaunch = !hasLaunched(g);

  // 1) Natural decay.
  let hype = g.hype * HYPE_DECAY;

  // 2) Marketing push. Efficiency drops as we approach the ceiling.
  if (g.marketingBudget > 0 && preLaunch) {
    const rawGain = g.marketingBudget / MARKETING_COST_PER_HYPE;
    const headroom = Math.max(0, HYPE_MARKETING_CEILING - hype);
    const efficiency = headroom / HYPE_MARKETING_CEILING;
    hype += rawGain * efficiency * GENRE_INFO[g.genre].hypeMultiplier;
  }

  // 3) Quality-driven word-of-mouth — a polished, high-quality WIP leaks
  //    through previews and gets attention on its own.
  if (preLaunch && g.quality >= 40) {
    const wom = Math.max(0, (g.quality - 40)) * 0.05;
    hype += wom;
  }

  hype = Math.max(0, Math.min(100, hype));

  // 4) Wishlist conversion — fraction of hype that banks into persistent demand.
  let wishlist = g.wishlist;
  if (preLaunch) {
    // Base audience size scales with genre TAM + platform reach.
    const marketScale = GENRE_INFO[g.genre].marketSize;
    const addedWishlist = Math.round(hype * WISHLIST_CONVERSION_RATE * marketScale * 100);
    wishlist += addedWishlist;
  }

  return { ...g, hype, wishlist };
}

// =====================================================================================
// Showcase bursts
// =====================================================================================

/** Apply a showcase hype burst to a game. `boost` is the base hype points to
 *  add, before genre and scope modifiers. */
export function applyShowcaseBurst(
  g: Game,
  week: number,
  showcase: string,
  boost: number,
): Game {
  const genreMod = GENRE_INFO[g.genre].hypeMultiplier;
  // Bigger scope = more press attention.
  const scopeMod = g.scope === "AAA" ? 1.4 : g.scope === "AA" ? 1.15 : 0.9;
  const hypeDelta = boost * genreMod * scopeMod;
  const newHype = Math.min(100, g.hype + hypeDelta);
  return {
    ...g,
    hype: newHype,
    mostRecentShowcaseWeek: week,
    showcaseAppearances: [
      ...g.showcaseAppearances,
      { week, showcase, hypeDelta: Math.round(hypeDelta) },
    ],
  };
}

// =====================================================================================
// Launch forecasts
// =====================================================================================

/**
 * Estimated first-week sales if the game launched today. Used by the UI to
 * show "launch forecast: X copies / $Y" before the player pulls the trigger.
 * The real launch calculation in launch.ts uses the review score roll and RNG.
 */
export function forecastFirstWeekSales(
  g: Game,
  estimatedReviewScore: number,
): number {
  // Base conversion: review-weighted fraction of wishlists buy in week 1.
  const reviewFactor = 0.25 + (estimatedReviewScore / 100) * 0.2; // 0.25..0.45
  const hypeBoost = 1 + (g.hype / 100) * 0.5;                     // 1.0..1.5
  const wishlistBuyers = Math.round(g.wishlist * reviewFactor * hypeBoost);
  // Plus organic discovery: function of hype and genre reach.
  const reach = GENRE_INFO[g.genre].marketSize;
  const organic = Math.round(g.hype * reach * 50 * (estimatedReviewScore / 100));
  return wishlistBuyers + organic;
}

/** Descriptor for a hype level — shown as a badge in the UI. */
export function hypeDescriptor(hype: number): "none" | "buzz" | "rising" | "hot" | "viral" {
  if (hype < 10) return "none";
  if (hype < 25) return "buzz";
  if (hype < 55) return "rising";
  if (hype < 80) return "hot";
  return "viral";
}

/** Human-readable sentence for the UI summarizing pre-launch state. */
export function prelaunchBlurb(g: Game): string {
  const d = hypeDescriptor(g.hype);
  if (d === "none") return "No one's heard of it yet. Build hype before launch.";
  if (d === "buzz") return `A little buzz is starting. ${g.wishlist.toLocaleString()} wishlists.`;
  if (d === "rising") return `Press is paying attention. ${g.wishlist.toLocaleString()} wishlists.`;
  if (d === "hot") return `Hot commodity. ${g.wishlist.toLocaleString()} wishlists — launch soon or risk peaking early.`;
  return `Viral heat. ${g.wishlist.toLocaleString()} wishlists and counting. Don't squander this.`;
}

// =====================================================================================
// Helpers for other modules
// =====================================================================================

/** How much each hype point is worth in expected launch-week revenue. Used by
 *  the "should I spend more on marketing?" heuristics. */
export function hypeValuePerPoint(
  g: Game,
  estimatedReviewScore: number,
  listPrice: number,
): number {
  // Empirically: every point of hype yields ~(reach * 50) organic buyers at
  // launch, plus multiplicative boost on wishlist conversion.
  const reach = GENRE_INFO[g.genre].marketSize;
  const organicPerPoint = reach * 50 * (estimatedReviewScore / 100);
  const wishlistMultPerPoint = g.wishlist * 0.005 * (estimatedReviewScore / 100);
  return Math.round((organicPerPoint + wishlistMultPerPoint) * listPrice);
}

/** Is this genre particularly hype-driven? (Narrative and horror benefit more
 *  from viral moments than annualized sports.) */
export function isHypeSensitiveGenre(genre: GameGenre): boolean {
  return GENRE_INFO[genre].hypeMultiplier >= 1.1;
}
