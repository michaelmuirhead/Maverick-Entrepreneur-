/**
 * Game entity lifecycle — init, dev stage progression, and per-game economics.
 *
 * A game progresses through stages:
 *   concept → prototype → vertical-slice → production → polish → released
 *                                                                   ↓
 *                                                         live-service / mature / sunset
 *
 * Stage transitions fire when enough dev work has been banked relative to the
 * scope's target weeks. Quality accrues through production; polish accrues in
 * the polish stage; tech debt accrues when a game ships rushed or is crunched.
 *
 * Launch mechanics (review score, first-week sales) live in launch.ts — this
 * module only cares about what happens during development.
 */

import type { RNG } from "../rng";
import {
  GENRE_INFO,
  PLATFORM_INFO,
  SCOPE_INFO,
  defaultPriceFor,
  minTeamFor,
  targetDevWeeksFor,
} from "./genres";
import type {
  Game,
  GameDevStage,
  GameGenre,
  GamePlatform,
  GameScope,
} from "./types";

// =====================================================================================
// Stage plan — each stage is a fraction of total dev weeks, summing to 1.0.
// =====================================================================================

/** Dev-stage slicing. Numbers are fractions of total target dev weeks. */
const STAGE_BUDGET: Record<Exclude<GameDevStage, "released" | "live-service" | "mature" | "sunset">, number> = {
  "concept":         0.08,
  "prototype":       0.15,
  "vertical-slice":  0.17,
  "production":      0.45,
  "polish":          0.15,
};

/** Ordered list of pre-release stages. */
export const PRE_RELEASE_STAGES: GameDevStage[] = [
  "concept", "prototype", "vertical-slice", "production", "polish",
];

/** Post-release stages, in order. */
export const POST_RELEASE_STAGES: GameDevStage[] = [
  "released", "live-service", "mature", "sunset",
];

/** Is the game still in development (hasn't shipped)? */
export function isInDev(g: Game): boolean {
  return PRE_RELEASE_STAGES.includes(g.stage);
}

/** Has the game launched (any post-release stage)? */
export function hasLaunched(g: Game): boolean {
  return POST_RELEASE_STAGES.includes(g.stage);
}

// =====================================================================================
// Init — build a fresh Game entity
// =====================================================================================

export interface NewGameParams {
  id: string;
  title: string;
  genre: GameGenre;
  scope: GameScope;
  platforms: GamePlatform[];
  /** Week the project begins (studio's current week). */
  startedWeek: number;
  /** Initial weekly dev budget. Players can adjust after creation. */
  devBudget?: number;
  /** Initial weekly marketing budget (typically 0 until later stages). */
  marketingBudget?: number;
}

/**
 * Build a brand-new Game. Targets are derived from genre + scope and stay
 * fixed even if the player later changes scope (we treat scope as immutable
 * post-creation to keep the sim predictable).
 */
export function makeGame(p: NewGameParams): Game {
  const targetWeeks = targetDevWeeksFor(p.genre, p.scope);
  return {
    id: p.id,
    title: p.title,
    genre: p.genre,
    scope: p.scope,
    platforms: p.platforms.length > 0 ? p.platforms : ["pc-steam"],
    stage: "concept",
    version: "0.1",

    devProgress: 0,
    targetDevWeeks: targetWeeks,
    weeksInStage: 0,
    weeksSinceStart: 0,
    devBudget: Math.max(0, p.devBudget ?? estimateWeeklyDevCost(p.genre, p.scope, 0)),
    marketingBudget: Math.max(0, p.marketingBudget ?? 0),
    assignedEngineers: [],

    quality: 10,    // starts low — grows through production + polish
    polish: 0,
    techDebt: 0,
    crunchActive: false,

    hype: 5,        // a tiny trickle from the reveal post
    wishlist: 0,
    showcaseAppearances: [],

    dlcPipeline: [],

    lifetimeRevenue: 0,
    lifetimeCost: 0,
    lifetimeDevCost: 0,
    lifetimeMarketingCost: 0,
    peakWeeklySales: 0,
  };
}

// =====================================================================================
// Economics — weekly dev / marketing spend, team adequacy, velocity
// =====================================================================================

/**
 * Estimate a sensible weekly dev budget for a scope + genre with a given team
 * size. Used as the seed when the player creates a new game so they don't have
 * to set a budget from a blank slider.
 */
export function estimateWeeklyDevCost(
  genre: GameGenre,
  scope: GameScope,
  teamSize: number,
): number {
  const base = SCOPE_INFO[scope].weeklyBaseCost;
  const teamFactor = Math.max(0.5, teamSize / minTeamFor(genre, scope));
  return Math.round(base * teamFactor);
}

/** Weekly dev burn for this game — scaled by actual team size on the project. */
export function weeklyDevBurn(g: Game, teamSize: number): number {
  // Base budget represents the minimum spend; scales linearly with team once
  // the team exceeds minimum to reflect payroll + infra.
  const budget = g.devBudget;
  const minTeam = minTeamFor(g.genre, g.scope);
  const factor = teamSize <= minTeam ? 1.0 : 1.0 + 0.12 * (teamSize - minTeam);
  const crunchPremium = g.crunchActive ? 1.25 : 1.0;
  return Math.round(budget * factor * crunchPremium);
}

/** Is the team under-staffed relative to the scope/genre floor? */
export function isUnderstaffed(g: Game): boolean {
  return g.assignedEngineers.length < minTeamFor(g.genre, g.scope);
}

/**
 * Dev-progress velocity per week, in target-dev-week equivalents. A fully-staffed
 * project (exactly min team) at normal pace ships 1.0 week of progress per
 * calendar week. Under-staffed projects lag; over-staffed projects progress
 * faster with diminishing returns.
 */
export function devVelocity(g: Game): number {
  const minTeam = minTeamFor(g.genre, g.scope);
  const team = g.assignedEngineers.length;
  if (team === 0) return 0;
  if (team < minTeam) return team / minTeam; // linear penalty under-staffed
  // Diminishing returns above minimum: +20% per extra engineer, capped at +100%.
  const extra = team - minTeam;
  const bonus = Math.min(1.0, 0.2 * extra);
  const crunchBoost = g.crunchActive ? 1.4 : 1.0;
  return (1.0 + bonus) * crunchBoost;
}

// =====================================================================================
// Stage progression
// =====================================================================================

/**
 * Advance a game one week. Returns the updated game. The caller is responsible
 * for handling side effects (cash debit, event emission, crunch morale damage).
 *
 * Does NOT handle launch (that's launch.ts) or post-launch decay (tick.ts).
 */
export function advanceDev(g: Game, rng: RNG): Game {
  if (!isInDev(g)) return g;

  const velocity = devVelocity(g);
  // Progress per week measured in target-weeks. 1/targetDevWeeks completes
  // the whole project in targetDevWeeks weeks at nominal pace.
  const stageBudget = STAGE_BUDGET[g.stage as keyof typeof STAGE_BUDGET];
  const totalStageWeeks = Math.max(1, Math.round(g.targetDevWeeks * stageBudget));
  const stageProgressPerWeek = velocity / totalStageWeeks;
  const newProgress = Math.min(1, g.devProgress + stageProgressPerWeek);

  // Quality + polish + tech debt accrue differently per stage.
  let quality = g.quality;
  let polish = g.polish;
  let techDebt = g.techDebt;

  if (g.stage === "production") {
    // Main content stage — most quality gains happen here.
    quality += 1.2 * velocity + rng.range(-0.3, 0.3);
  } else if (g.stage === "vertical-slice") {
    quality += 0.8 * velocity;
  } else if (g.stage === "prototype") {
    quality += 0.4 * velocity;
  } else if (g.stage === "polish") {
    // Polish is front-loaded — early polish weeks pay off more.
    polish += 3.0 * velocity + rng.range(-0.5, 0.5);
    techDebt -= 1.0 * velocity; // polish naturally pays down some debt
  }

  // Crunch accumulates tech debt regardless of stage.
  if (g.crunchActive) {
    techDebt += 0.8;
  }

  // Understaffed projects accumulate debt from shortcuts.
  if (isUnderstaffed(g)) {
    techDebt += 0.3;
  }

  quality = Math.max(0, Math.min(100, quality));
  polish = Math.max(0, Math.min(100, polish));
  techDebt = Math.max(0, Math.min(100, techDebt));

  // Auto-advance stage if current stage is done (progress hits 1.0).
  let stage: GameDevStage = g.stage;
  let weeksInStage = g.weeksInStage + 1;
  let progress = newProgress;
  let version = g.version;

  if (newProgress >= 1) {
    const nextStage = nextDevStage(g.stage);
    if (nextStage) {
      stage = nextStage;
      weeksInStage = 0;
      progress = 0;
      if (stage === "polish") version = "0.9";
    }
  }

  return {
    ...g,
    stage,
    devProgress: progress,
    weeksInStage,
    weeksSinceStart: g.weeksSinceStart + 1,
    quality,
    polish,
    techDebt,
    version,
  };
}

/** Next pre-release stage, or null if there's no next stage (already in polish). */
export function nextDevStage(stage: GameDevStage): GameDevStage | null {
  const idx = PRE_RELEASE_STAGES.indexOf(stage);
  if (idx < 0 || idx >= PRE_RELEASE_STAGES.length - 1) return null;
  return PRE_RELEASE_STAGES[idx + 1];
}

/** Is the game ready to launch? (Hit polish and cooled in polish for ≥2 weeks, or
 *  the player manually presses the Ship button — this is just the auto-check.) */
export function isReadyToShip(g: Game): boolean {
  return g.stage === "polish" && g.devProgress >= 0.85;
}

// =====================================================================================
// Forecasts & UX helpers
// =====================================================================================

/** Predicted list price at launch based on genre + scope. */
export function launchPrice(g: Game): number {
  return defaultPriceFor(g.genre, g.scope);
}

/** Estimated weeks remaining until ship, based on current stage + velocity. */
export function estimatedWeeksToShip(g: Game): number {
  if (hasLaunched(g)) return 0;
  const velocity = devVelocity(g);
  if (velocity <= 0) return Number.POSITIVE_INFINITY;
  const curStageIdx = PRE_RELEASE_STAGES.indexOf(g.stage);
  let weeks = 0;
  for (let i = curStageIdx; i < PRE_RELEASE_STAGES.length; i++) {
    const stage = PRE_RELEASE_STAGES[i];
    const stageBudget = STAGE_BUDGET[stage as keyof typeof STAGE_BUDGET];
    const totalStageWeeks = Math.max(1, Math.round(g.targetDevWeeks * stageBudget));
    const remainingInStage = i === curStageIdx ? (1 - g.devProgress) : 1;
    weeks += (remainingInStage * totalStageWeeks) / velocity;
  }
  return Math.ceil(weeks);
}

/** Anticipated review score ceiling given current quality/polish/techDebt. Used
 *  for pre-launch UI to warn players they're shipping a half-baked game. */
export function qualityForecast(g: Game): {
  score: number;
  descriptor: "disaster" | "rough" | "mixed" | "good" | "great" | "masterwork";
} {
  // Weighted blend — polish matters more for genres with high reviewWeight.
  const reviewWeight = GENRE_INFO[g.genre].reviewWeight;
  const core = (g.quality * 0.6 + g.polish * 0.4) - g.techDebt * 0.3;
  const weighted = core * (0.7 + 0.3 * reviewWeight);
  const clamped = Math.max(0, Math.min(100, Math.round(weighted)));
  const descriptor: "disaster" | "rough" | "mixed" | "good" | "great" | "masterwork" =
    clamped < 30 ? "disaster" :
    clamped < 50 ? "rough" :
    clamped < 65 ? "mixed" :
    clamped < 80 ? "good" :
    clamped < 90 ? "great" :
    "masterwork";
  return { score: clamped, descriptor };
}

/** Sum of per-platform port costs (fraction of devBudget) spent at launch. */
export function totalPortCost(g: Game, devBudgetTotal: number): number {
  if (g.platforms.length <= 1) return 0;
  const [, ...secondary] = g.platforms;
  const mult = secondary.reduce((sum, p) => sum + PLATFORM_INFO[p].portCostMult, 0);
  return Math.round(devBudgetTotal * mult);
}
