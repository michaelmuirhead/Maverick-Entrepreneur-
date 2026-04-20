/**
 * Single source of truth for per-genre and per-scope / per-platform metadata.
 *
 * As with CATEGORY_INFO for the SaaS sim, nothing else in the studio sim
 * should branch on genre/scope/platform ids — look everything up from these
 * tables instead.
 */

import type {
  GameGenre,
  GamePlatform,
  GameScope,
  GenreInfo,
  PlatformInfo,
  ScopeInfo,
} from "./types";

// =====================================================================================
// Genres
// =====================================================================================

export const GENRE_INFO: Record<GameGenre, GenreInfo> = {
  fps: {
    id: "fps",
    label: "FPS",
    blurb: "First-person shooters — technical, marketable, competitive.",
    devWeeksBase: 60,
    teamSizeMin: 4,
    marketSize: 1.3,
    reviewWeight: 0.6,
    liveServiceViable: true,
    competitionDensity: 0.85,
    defaultPrice: 60,
    hypeMultiplier: 1.2,
    nameSuffixes: ["Strike", "Fire", "Recoil", "Zero", "Legion", "Wrath", "Breach"],
  },
  rpg: {
    id: "rpg",
    label: "RPG",
    blurb: "Role-playing — huge dev cycles, hardcore audiences, review-driven.",
    devWeeksBase: 120,
    teamSizeMin: 5,
    marketSize: 1.1,
    reviewWeight: 0.85,
    liveServiceViable: true, // MMORPGs exist
    competitionDensity: 0.55,
    defaultPrice: 70,
    hypeMultiplier: 1.15,
    nameSuffixes: ["Chronicle", "Saga", "Legacy", "Relics", "Crown", "Oath"],
  },
  strategy: {
    id: "strategy",
    label: "Strategy",
    blurb: "4X, RTS, tactics — niche but loyal, long tails, mod-driven.",
    devWeeksBase: 80,
    teamSizeMin: 3,
    marketSize: 0.7,
    reviewWeight: 0.75,
    liveServiceViable: false,
    competitionDensity: 0.45,
    defaultPrice: 50,
    hypeMultiplier: 0.85,
    nameSuffixes: ["Dominion", "Empires", "Command", "Front", "Tactics"],
  },
  sim: {
    id: "sim",
    label: "Simulation",
    blurb: "Life/city/management sims — evergreen, compound via DLC.",
    devWeeksBase: 72,
    teamSizeMin: 3,
    marketSize: 1.2,
    reviewWeight: 0.55,
    liveServiceViable: false,
    competitionDensity: 0.4,
    defaultPrice: 40,
    hypeMultiplier: 0.95,
    nameSuffixes: ["Tycoon", "Builder", "Lives", "Works", "World"],
  },
  platformer: {
    id: "platformer",
    label: "Platformer",
    blurb: "2D/3D platformers — timeless, artstyle-driven, smaller teams.",
    devWeeksBase: 52,
    teamSizeMin: 2,
    marketSize: 0.85,
    reviewWeight: 0.7,
    liveServiceViable: false,
    competitionDensity: 0.55,
    defaultPrice: 30,
    hypeMultiplier: 0.9,
    nameSuffixes: ["Jumper", "Leap", "Stride", "Hop", "Run"],
  },
  puzzle: {
    id: "puzzle",
    label: "Puzzle",
    blurb: "Puzzle / casual — small teams, big mobile TAM, low CAC.",
    devWeeksBase: 28,
    teamSizeMin: 1,
    marketSize: 1.1,
    reviewWeight: 0.35,
    liveServiceViable: true,
    competitionDensity: 0.9,
    defaultPrice: 15,
    hypeMultiplier: 0.6,
    nameSuffixes: ["Blocks", "Lines", "Grid", "Match", "Link"],
  },
  racing: {
    id: "racing",
    label: "Racing",
    blurb: "Arcade to sim racing — hardware tie-ins, license-hungry.",
    devWeeksBase: 68,
    teamSizeMin: 4,
    marketSize: 0.95,
    reviewWeight: 0.6,
    liveServiceViable: true,
    competitionDensity: 0.5,
    defaultPrice: 60,
    hypeMultiplier: 1.0,
    nameSuffixes: ["Circuit", "Rally", "GT", "Drift", "Velocity"],
  },
  fighting: {
    id: "fighting",
    label: "Fighting",
    blurb: "1v1 fighters / brawlers — tournament-driven, small but devoted.",
    devWeeksBase: 64,
    teamSizeMin: 3,
    marketSize: 0.6,
    reviewWeight: 0.65,
    liveServiceViable: true,
    competitionDensity: 0.45,
    defaultPrice: 60,
    hypeMultiplier: 1.05,
    nameSuffixes: ["Brawl", "Fury", "Clash", "Combat", "Duelists"],
  },
  sports: {
    id: "sports",
    label: "Sports",
    blurb: "Annualized sports — license-locked, stable revenue, low ceiling.",
    devWeeksBase: 48,
    teamSizeMin: 4,
    marketSize: 1.2,
    reviewWeight: 0.35,
    liveServiceViable: true,
    competitionDensity: 0.35,
    defaultPrice: 60,
    hypeMultiplier: 0.75,
    nameSuffixes: ["'26", "World", "Pro", "Elite", "Championship"],
  },
  horror: {
    id: "horror",
    label: "Horror",
    blurb: "Survival / psychological horror — streamer-friendly, viral potential.",
    devWeeksBase: 56,
    teamSizeMin: 3,
    marketSize: 0.85,
    reviewWeight: 0.75,
    liveServiceViable: false,
    competitionDensity: 0.5,
    defaultPrice: 30,
    hypeMultiplier: 1.3,
    nameSuffixes: ["Dread", "Haunting", "Rot", "Echoes", "Silent"],
  },
  "mobile-casual": {
    id: "mobile-casual",
    label: "Mobile Casual",
    blurb: "Hypercasual F2P — tiny teams, huge install base, IAP-driven.",
    devWeeksBase: 16,
    teamSizeMin: 1,
    marketSize: 1.4,
    reviewWeight: 0.2,
    liveServiceViable: true,
    competitionDensity: 0.95,
    defaultPrice: 0, // free-to-play
    hypeMultiplier: 0.4,
    nameSuffixes: ["Tap", "Crush", "Dash", "Merge", "Blast"],
  },
  "live-service": {
    id: "live-service",
    label: "Live Service",
    blurb: "MMOs, extraction, battle royale — huge if it hits, server-cost heavy.",
    devWeeksBase: 130,
    teamSizeMin: 6,
    marketSize: 1.5,
    reviewWeight: 0.45,
    liveServiceViable: true,
    competitionDensity: 0.8,
    defaultPrice: 0, // typically F2P + microtransactions
    hypeMultiplier: 1.1,
    nameSuffixes: ["Online", "World", "Zero", "Protocol", "Royale"],
  },
  narrative: {
    id: "narrative",
    label: "Narrative",
    blurb: "Story-first / walking sims — review-critical, thin margins, awards darlings.",
    devWeeksBase: 44,
    teamSizeMin: 2,
    marketSize: 0.55,
    reviewWeight: 0.95,
    liveServiceViable: false,
    competitionDensity: 0.3,
    defaultPrice: 25,
    hypeMultiplier: 0.8,
    nameSuffixes: ["Letters", "Quiet", "Threads", "Between", "Fading"],
  },
  roguelike: {
    id: "roguelike",
    label: "Roguelike",
    blurb: "Procedural runs — long tails, early-access friendly, cult audiences.",
    devWeeksBase: 40,
    teamSizeMin: 2,
    marketSize: 0.75,
    reviewWeight: 0.7,
    liveServiceViable: false,
    competitionDensity: 0.6,
    defaultPrice: 25,
    hypeMultiplier: 0.85,
    nameSuffixes: ["Depths", "Runs", "Cycle", "Descent", "Relic"],
  },
};

export const GENRE_ORDER: GameGenre[] = [
  "fps", "rpg", "strategy", "sim", "platformer", "puzzle", "racing", "fighting",
  "sports", "horror", "mobile-casual", "live-service", "narrative", "roguelike",
];

// =====================================================================================
// Scopes
// =====================================================================================

export const SCOPE_INFO: Record<GameScope, ScopeInfo> = {
  indie: {
    id: "indie",
    label: "Indie",
    devWeeksMult: 1.0,
    priceMult: 1.0,
    minTeam: 1,
    weeklyBaseCost: 1_500,
    reviewExpectationBias: 0,
  },
  AA: {
    id: "AA",
    label: "AA",
    devWeeksMult: 2.0,
    priceMult: 1.6,
    minTeam: 5,
    weeklyBaseCost: 12_000,
    reviewExpectationBias: -3, // slightly harsher at higher budget
  },
  AAA: {
    id: "AAA",
    label: "AAA",
    devWeeksMult: 3.5,
    priceMult: 2.2,
    minTeam: 15,
    weeklyBaseCost: 60_000,
    reviewExpectationBias: -6, // AAA is judged harshly
  },
};

// =====================================================================================
// Platforms
// =====================================================================================

export const PLATFORM_INFO: Record<GamePlatform, PlatformInfo> = {
  "pc-steam":       { id: "pc-steam",       label: "PC (Steam)",      reach: 1.0,  devRevShare: 0.70, portCostMult: 0,    exclusivityAllowed: false },
  playstation:      { id: "playstation",    label: "PlayStation",     reach: 0.9,  devRevShare: 0.70, portCostMult: 0.15, exclusivityAllowed: true  },
  xbox:             { id: "xbox",           label: "Xbox (+ Game Pass)", reach: 0.75, devRevShare: 0.70, portCostMult: 0.12, exclusivityAllowed: true },
  switch:           { id: "switch",         label: "Nintendo Switch", reach: 0.8,  devRevShare: 0.70, portCostMult: 0.18, exclusivityAllowed: true  },
  "mobile-ios":     { id: "mobile-ios",     label: "iOS",             reach: 1.1,  devRevShare: 0.70, portCostMult: 0.10, exclusivityAllowed: false },
  "mobile-android": { id: "mobile-android", label: "Android",         reach: 1.2,  devRevShare: 0.70, portCostMult: 0.10, exclusivityAllowed: false },
  web:              { id: "web",            label: "Web / Browser",   reach: 0.4,  devRevShare: 0.95, portCostMult: 0.05, exclusivityAllowed: false },
};

export const PLATFORM_ORDER: GamePlatform[] = [
  "pc-steam", "playstation", "xbox", "switch", "mobile-ios", "mobile-android", "web",
];

// =====================================================================================
// Helpers
// =====================================================================================

/** Dev weeks target for a game, factoring scope multiplier. */
export function targetDevWeeksFor(genre: GameGenre, scope: GameScope): number {
  return Math.round(GENRE_INFO[genre].devWeeksBase * SCOPE_INFO[scope].devWeeksMult);
}

/** Default list price at launch, factoring scope. Free-to-play genres return 0. */
export function defaultPriceFor(genre: GameGenre, scope: GameScope): number {
  const base = GENRE_INFO[genre].defaultPrice;
  if (base === 0) return 0;
  return Math.round(base * SCOPE_INFO[scope].priceMult);
}

/** Minimum viable team size — max of genre floor and scope floor. */
export function minTeamFor(genre: GameGenre, scope: GameScope): number {
  return Math.max(GENRE_INFO[genre].teamSizeMin, SCOPE_INFO[scope].minTeam);
}

/** Blended reach across a set of platforms. Steam + PS5 > Steam alone. */
export function platformReach(platforms: GamePlatform[]): number {
  if (platforms.length === 0) return 0;
  // Diminishing returns on stacking platforms — first is full, rest at 70%.
  let reach = 0;
  let discount = 1;
  for (const p of platforms) {
    reach += PLATFORM_INFO[p].reach * discount;
    discount *= 0.7;
  }
  return reach;
}

/** Is this genre typically free-to-play? */
export function isFreeToPlayGenre(genre: GameGenre): boolean {
  return genre === "mobile-casual" || genre === "live-service";
}
