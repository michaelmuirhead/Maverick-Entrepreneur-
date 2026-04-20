/**
 * Crunch + parallel-project mechanics.
 *
 * Crunch is a player-toggled "overdrive" mode on a single game: the team works
 * longer hours to hit a deadline. It trades short-term velocity for long-term
 * damage — morale decay, tech debt accumulation, and attrition risk.
 *
 * Parallel-project mechanics govern how many games the studio can realistically
 * have in active development at once. The constraint is headcount: a studio
 * running three AAA projects in parallel with fifty people is going to ship
 * three broken games. We expose helpers to check capacity before starting a
 * new project and to surface warnings in the UI.
 *
 * Crunch damage model (per week of crunch, per engineer assigned to that game):
 *   - Morale: −2 baseline, up to −4 after 4+ continuous weeks (fatigue compounds)
 *   - Attrition risk: +1% per week baseline, doubles after week 8
 *   - Culture score: −0.5/wk studio-wide (the rest of the company sees the grind)
 *   - Tech debt on the game: +0.8/wk (already modeled in games.ts advanceDev)
 *
 * Crunch benefits (already modeled in games.ts):
 *   - Dev velocity: +40%
 *   - Weekly burn: +25% (overtime pay, catering, rideshares)
 *   - Review score: −4 penalty at launch (rushed = rough edges)
 */

import type { RNG } from "../rng";
import type { Employee } from "../types";
import { GENRE_INFO, SCOPE_INFO, minTeamFor } from "./genres";
import type { Game, GameScope } from "./types";
import { hasLaunched, isInDev } from "./games";

// =====================================================================================
// Tunables
// =====================================================================================

/** Base morale hit per week of crunch, per assigned engineer. */
const CRUNCH_MORALE_BASE = 2;
/** Max per-week morale hit after sustained crunch (4+ weeks). */
const CRUNCH_MORALE_MAX = 4;
/** Threshold (weeks of continuous crunch) at which morale damage maxes out. */
const CRUNCH_MORALE_FATIGUE_WEEKS = 4;

/** Base weekly attrition probability per engineer during crunch. */
const CRUNCH_ATTRITION_BASE = 0.01;
/** Attrition probability doubles after this many weeks of continuous crunch. */
const CRUNCH_ATTRITION_DOUBLE_AT = 8;
/** Hard floor on morale below which attrition is an additional coin flip. */
const CRUNCH_LOW_MORALE_THRESHOLD = 20;
/** Extra chance of walking if morale drops below the low threshold. */
const CRUNCH_LOW_MORALE_ATTRITION = 0.03;

/** Culture score damage per week of crunch (studio-wide, scaled by headcount-fraction in crunch). */
const CRUNCH_CULTURE_DAMAGE = 0.5;

// =====================================================================================
// Toggle crunch on / off
// =====================================================================================

/**
 * Start crunch on a game. No-op if already crunching or if the game is post-launch.
 * Caller should emit an event for the UI / culture feed.
 */
export function startCrunch(g: Game): Game {
  if (!isInDev(g)) return g;
  if (g.crunchActive) return g;
  return { ...g, crunchActive: true };
}

/**
 * End crunch on a game. No-op if not currently crunching. Called manually by
 * the player, automatically when the game ships (launchGame zeroes crunchActive),
 * or when the game is cancelled.
 */
export function endCrunch(g: Game): Game {
  if (!g.crunchActive) return g;
  return { ...g, crunchActive: false };
}

// =====================================================================================
// Per-tick side effects on the team
// =====================================================================================

export interface CrunchTickImpact {
  /** Updated employee records — mutated morale, possibly new noticeReason. */
  employees: Employee[];
  /** Net culture score delta across the whole studio this week. */
  cultureDelta: number;
  /** IDs of employees who decided to quit this week (added to noticeReason="resigned"). */
  resignedIds: string[];
  /** Per-game number of weeks of continuous crunch (for UI / events). */
  crunchWeeksByGame: Record<string, number>;
}

/**
 * Apply one week of crunch impact across all games that are currently crunching.
 * The caller (studio tick) passes in the current employees and games; this
 * returns patched employees + culture delta for the studio.
 *
 * Morale-damage model: we track "continuous crunch weeks" on each game by
 * counting weeks the engineer has been assigned while the game has crunchActive.
 * The studio tick is expected to have already incremented weeksInStage / similar
 * counters, so here we just inspect the current flags and employees.
 *
 * Notes on isolation of concerns:
 *   - This function does NOT update the Game records themselves; techDebt bumps
 *     from crunch are handled in games.ts `advanceDev` (same tick, different
 *     concern). Keeping them split means advancing a game without a tick also
 *     still accumulates debt.
 *   - We don't emit events here — the caller decides whether to fire
 *     `crunch-burnout`, `attrition-during-crunch`, etc.
 */
export function applyCrunchTick(
  games: Game[],
  employees: Employee[],
  rng: RNG,
  weekNow: number,
  /** Map of gameId -> how many weeks the game has been continuously crunching. */
  crunchWeeksByGame: Record<string, number>,
): CrunchTickImpact {
  // Build a set of engineers currently on a crunching game.
  const crunchingGames = games.filter(g => g.crunchActive && isInDev(g));
  if (crunchingGames.length === 0) {
    return {
      employees,
      cultureDelta: 0,
      resignedIds: [],
      crunchWeeksByGame,
    };
  }

  // Update the continuous-crunch counter per game. Games in crunch this tick
  // increment; games that have stopped crunching reset to 0 (already off, so
  // the entry simply isn't bumped — we leave stale entries for dashboard).
  const nextCrunchWeeks: Record<string, number> = { ...crunchWeeksByGame };
  for (const g of crunchingGames) {
    nextCrunchWeeks[g.id] = (nextCrunchWeeks[g.id] ?? 0) + 1;
  }

  // Engineers can be on multiple crunching games in theory — take the worst
  // fatigue across any crunching game they're assigned to.
  const fatigueByEngineer: Record<string, number> = {};
  for (const g of crunchingGames) {
    const weeks = nextCrunchWeeks[g.id] ?? 1;
    for (const eid of g.assignedEngineers) {
      const prev = fatigueByEngineer[eid] ?? 0;
      fatigueByEngineer[eid] = Math.max(prev, weeks);
    }
  }

  const resignedIds: string[] = [];
  const updatedEmployees: Employee[] = employees.map(e => {
    const weeks = fatigueByEngineer[e.id];
    if (!weeks) return e; // not on any crunching game
    // Morale damage ramps from base to max over fatigue weeks.
    const fatigueT = Math.min(1, weeks / CRUNCH_MORALE_FATIGUE_WEEKS);
    const moraleDrop = CRUNCH_MORALE_BASE + (CRUNCH_MORALE_MAX - CRUNCH_MORALE_BASE) * fatigueT;
    const newMorale = Math.max(0, e.morale - moraleDrop);

    // Attrition roll. Already-on-notice employees don't re-roll.
    if (e.noticeReason) {
      return { ...e, morale: newMorale };
    }
    const attrBase = CRUNCH_ATTRITION_BASE * (weeks >= CRUNCH_ATTRITION_DOUBLE_AT ? 2 : 1);
    const lowMoraleBump = newMorale < CRUNCH_LOW_MORALE_THRESHOLD ? CRUNCH_LOW_MORALE_ATTRITION : 0;
    const quits = rng.chance(attrBase + lowMoraleBump);

    if (quits) {
      resignedIds.push(e.id);
      return {
        ...e,
        morale: newMorale,
        noticeReason: "resigned" as const,
        noticeEndsWeek: weekNow + 2, // standard two-week notice
      };
    }
    return { ...e, morale: newMorale };
  });

  // Culture score damage — scaled by fraction of the studio in crunch.
  const fraction = employees.length > 0
    ? Object.keys(fatigueByEngineer).length / employees.length
    : 0;
  const cultureDelta = -CRUNCH_CULTURE_DAMAGE * (0.5 + fraction);

  return {
    employees: updatedEmployees,
    cultureDelta,
    resignedIds,
    crunchWeeksByGame: nextCrunchWeeks,
  };
}

/**
 * Decay the continuous-crunch counter for games that are no longer crunching
 * or have launched. Called by the studio tick to keep the map from growing
 * unboundedly.
 */
export function pruneCrunchCounters(
  crunchWeeksByGame: Record<string, number>,
  games: Game[],
): Record<string, number> {
  const live = new Set(games.filter(g => g.crunchActive && isInDev(g)).map(g => g.id));
  const out: Record<string, number> = {};
  for (const [id, weeks] of Object.entries(crunchWeeksByGame)) {
    if (live.has(id)) out[id] = weeks;
    // If not crunching anymore, drop the counter — next crunch restarts fresh.
  }
  return out;
}

// =====================================================================================
// Parallel-project capacity
// =====================================================================================

/**
 * Maximum realistic number of parallel projects for a given team size. This is
 * a soft limit — the player can push past it, but every project beyond the
 * limit triggers the `over-capacity` warning and accumulates extra tech debt.
 *
 * Rough heuristic: a healthy studio needs ~10-15 people per concurrent project
 * for AA/AAA, and can run a few more for indie if they're scoped well.
 */
export function maxParallelProjects(teamSize: number, dominantScope: GameScope): number {
  if (teamSize <= 0) return 0;
  const perProjectFloor =
    dominantScope === "AAA" ? 25 :
    dominantScope === "AA"  ? 12 :
                              6;
  // Rounded down; every studio can always attempt at least one project.
  return Math.max(1, Math.floor(teamSize / perProjectFloor));
}

/**
 * Sum of minimum team requirements across all in-dev games. Used to decide
 * whether the studio is over-committed.
 */
export function totalMinTeamRequired(games: Game[]): number {
  let total = 0;
  for (const g of games) {
    if (!isInDev(g)) continue;
    total += minTeamFor(g.genre, g.scope);
  }
  return total;
}

/** Is the studio currently trying to run more projects than headcount supports? */
export function isOverCommitted(games: Game[], teamSize: number): boolean {
  return totalMinTeamRequired(games) > teamSize;
}

/**
 * Capacity diagnostic for the UI — returns a structured snapshot of how
 * strained the team is. Used on the studio HQ page to surface "you're stretched
 * thin" warnings.
 */
export interface CapacityDiag {
  inDevCount: number;
  crunchingCount: number;
  teamSize: number;
  minTeamRequired: number;
  overCommitted: boolean;
  /** 0..1 — fraction of the team currently on a crunching game. */
  crunchFraction: number;
  /** Human-readable summary for a card header. */
  blurb: string;
}

export function capacityDiagnostics(games: Game[], employees: Employee[]): CapacityDiag {
  const inDev = games.filter(isInDev);
  const crunching = inDev.filter(g => g.crunchActive);
  const minReq = totalMinTeamRequired(inDev);
  const teamSize = employees.length;
  const overCommitted = minReq > teamSize;
  const engineersInCrunch = new Set<string>();
  for (const g of crunching) for (const id of g.assignedEngineers) engineersInCrunch.add(id);
  const crunchFraction = teamSize > 0 ? engineersInCrunch.size / teamSize : 0;

  let blurb: string;
  if (inDev.length === 0) {
    blurb = "No active projects. Pitch something.";
  } else if (overCommitted) {
    blurb = `Over-committed — ${inDev.length} project${inDev.length === 1 ? "" : "s"} need ${minReq} engineers, you have ${teamSize}.`;
  } else if (crunchFraction > 0.5) {
    blurb = `${Math.round(crunchFraction * 100)}% of the studio is crunching. Watch morale.`;
  } else if (crunching.length > 0) {
    blurb = `${crunching.length} project${crunching.length === 1 ? "" : "s"} in crunch.`;
  } else {
    blurb = `${inDev.length} active project${inDev.length === 1 ? "" : "s"}. Healthy cadence.`;
  }

  return {
    inDevCount: inDev.length,
    crunchingCount: crunching.length,
    teamSize,
    minTeamRequired: minReq,
    overCommitted,
    crunchFraction,
    blurb,
  };
}

// =====================================================================================
// Flavor + advisory helpers
// =====================================================================================

/**
 * Estimate the weeks of crunch a game "needs" to hit a given planned launch
 * week, based on remaining dev work and nominal velocity. Returns 0 if the
 * game doesn't need crunch, or null if it's already post-launch / no plan.
 * Used by the "Should I crunch?" advisor in the UI.
 */
export function crunchWeeksNeededForDeadline(
  g: Game,
  weekNow: number,
  nominalWeeksLeft: number,
): number | null {
  if (hasLaunched(g)) return null;
  if (g.plannedLaunchWeek == null) return null;
  const weeksToDeadline = g.plannedLaunchWeek - weekNow;
  if (weeksToDeadline <= 0) return Math.ceil(nominalWeeksLeft); // past deadline
  if (nominalWeeksLeft <= weeksToDeadline) return 0; // no crunch needed
  // Crunch multiplies velocity by 1.4 → weeks with crunch = nominal/1.4.
  // We need: weeksCrunch/1.4 + (nominal-weeksCrunch) ≤ deadline.
  // Solve for weeksCrunch: weeksCrunch*(1/1.4 - 1) ≤ deadline - nominal
  //                         weeksCrunch ≤ (nominal - deadline) / (1 - 1/1.4)
  const gap = nominalWeeksLeft - weeksToDeadline;
  const weeksCrunch = gap / (1 - 1 / 1.4);
  return Math.ceil(weeksCrunch);
}

/** Is this a scope the player reasonably should not crunch? (Indie solo projects etc.) */
export function isCrunchAdvisable(g: Game): boolean {
  if (g.scope === "indie" && g.assignedEngineers.length <= 2) return false; // solo burnout is the worst burnout
  return true;
}

/** Short UX blurb describing current crunch state on a game. */
export function crunchStatusBlurb(g: Game, crunchWeeks: number): string {
  if (!g.crunchActive) return "Normal cadence.";
  if (crunchWeeks <= 1) return "Crunch just started. Watch the team.";
  if (crunchWeeks <= 4) return `Week ${crunchWeeks} of crunch. Morale is slipping.`;
  if (crunchWeeks <= 8) return `Week ${crunchWeeks} of crunch. Attrition risk climbing.`;
  return `Week ${crunchWeeks} of crunch. People are going to walk.`;
}

// =====================================================================================
// Flavor: scope-weighted "recommended crunch length"
// =====================================================================================

/** A gentle reminder from the culture feed: AAA crunch disasters are a trope. */
export function scopeCrunchWarning(scope: GameScope): string {
  const info = SCOPE_INFO[scope];
  if (scope === "AAA") {
    return `${info.label} crunches have destroyed careers. Lead with care.`;
  }
  if (scope === "AA") {
    return `${info.label} timelines are tight — crunch sparingly, recover deliberately.`;
  }
  return `${info.label} projects should live or die on scope, not hours.`;
}

/** Which genre is the most frequently crunched in this studio's history? Flavor-only. */
export function mostCrunchedGenre(games: Game[]): string | null {
  const counts: Record<string, number> = {};
  for (const g of games) {
    if (g.crunchActive) {
      counts[g.genre] = (counts[g.genre] ?? 0) + 1;
    }
  }
  let top: string | null = null;
  let topN = 0;
  for (const [genre, n] of Object.entries(counts)) {
    if (n > topN) { topN = n; top = genre; }
  }
  if (!top) return null;
  return GENRE_INFO[top as keyof typeof GENRE_INFO]?.label ?? top;
}
