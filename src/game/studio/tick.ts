/**
 * Studio tick engine — advance a GameStudioState by one calendar week.
 *
 * This is the game-studio equivalent of `src/game/tick.ts` (the SaaS tick).
 * A single `tickStudio(state)` call advances the world by one week:
 *
 *   1) Dev progress on all in-dev games (advance stage, accrue quality/polish/debt)
 *   2) Hype/wishlist per-game (marketing push, word-of-mouth, decay)
 *   3) Crunch side effects (morale decay, attrition, culture damage)
 *   4) Genre trend drift (random walk + occasional regime changes)
 *   5) Platform deal offers (roll new offers, expire stale ones)
 *   6) Showcase airings (apply hype bursts to featured games)
 *   7) Auto-launch for games that hit polish-stage readiness (player can also force)
 *   8) Post-launch sales tail + stage transitions (released → live-service/mature → sunset)
 *   9) Live-service MAU + ARPDAU revenue
 *  10) DLC pipeline advancement + ships
 *  11) Review-bomb ignite + decay
 *  12) Finance: dev burn, marketing burn, salaries, revenue credits
 *  13) Event emission
 *  14) Advance week/quarter/year pointers
 *
 * Tick is a pure function — takes a state, returns a new state. No side
 * effects. The store is responsible for persistence / UI reactivity.
 */

import { makeRng, makeIdGen, type RNG } from "../rng";
import type { GameEvent, ID } from "../types";
import { PLATFORM_INFO } from "./genres";
import type { Game, GameStudioState, GamePlatform, GameDevStage } from "./types";
import { advanceDev, hasLaunched, isInDev, isReadyToShip } from "./games";
import { tickHype, applyShowcaseBurst } from "./hype";
import {
  launchGame, tickPostLaunchSales, nextPostLaunchStage,
} from "./launch";
import { applyCrunchTick } from "./crunch";
import {
  initLiveService, tickLiveService, tickDlcPipeline,
} from "./live-service";
import {
  rollPlatformOffers, expirePlatformOffers,
  tickGenreTrends, maybeIgniteReviewBomb, decayReviewBomb,
} from "./platforms";

// =====================================================================================
// Helpers
// =====================================================================================

/** Blended dev rev share across a game's shipping platforms. Mirrors launch.ts. */
function blendedDevShare(platforms: GamePlatform[]): number {
  if (platforms.length === 0) return 0.7;
  let totalReach = 0;
  let weightedShare = 0;
  for (const p of platforms) {
    const info = PLATFORM_INFO[p];
    totalReach += info.reach;
    weightedShare += info.reach * info.devRevShare;
  }
  return totalReach > 0 ? weightedShare / totalReach : 0.7;
}

/** Add an event to the head of the list, capped to recent 500. */
function addEvent(events: GameEvent[], e: GameEvent): GameEvent[] {
  const next = [e, ...events];
  if (next.length > 500) next.length = 500;
  return next;
}

/** Generate a per-tick ID. Must use the same rng as the tick to stay reproducible. */
function nextIdGen(rng: RNG) {
  return makeIdGen(rng);
}

/** Advance calendar pointers. 4 quarters per year, 13 weeks per quarter. */
function advanceCalendar(state: GameStudioState): Pick<GameStudioState, "week" | "year" | "quarter"> {
  const nextWeek = state.week + 1;
  const weekInYear = nextWeek % 52;
  const quarter = (Math.floor(weekInYear / 13) + 1) as 1 | 2 | 3 | 4;
  const year = state.year + Math.floor(nextWeek / 52) - Math.floor(state.week / 52);
  return { week: nextWeek, year, quarter };
}

// =====================================================================================
// Main tick
// =====================================================================================

/**
 * Advance a GameStudioState by one week. Pure function. Caller handles
 * persistence. If `state.gameOver` is set, returns state unchanged.
 *
 * The rng state is seeded off `state.seed` + `state.week` so the tick is
 * deterministic and resume-safe.
 */
export function tickStudio(state: GameStudioState): GameStudioState {
  if (state.gameOver) return state;

  const rng = makeRng(`${state.seed}:week:${state.week}`);
  const idGen = nextIdGen(rng);
  const weekNow = state.week;

  let games = state.games;
  let employees = state.employees;
  let finance = { ...state.finance };
  let events = state.events;
  let culture = state.culture;
  let platformOffers = state.platformOffers;

  // -----------------------------------------------------------------------------------
  // 1) Dev progress for in-dev games
  // -----------------------------------------------------------------------------------
  games = games.map(g => (isInDev(g) ? advanceDev(g, rng) : g));

  // -----------------------------------------------------------------------------------
  // 2) Hype / wishlist tick for all games that are pre-launch or freshly launched
  //    (hype keeps decaying post-launch too, contributing to the tail feel).
  // -----------------------------------------------------------------------------------
  games = games.map(g => tickHype(g));

  // -----------------------------------------------------------------------------------
  // 3) Crunch tick — damage morale, risk attrition. We track per-game continuous
  //    crunch weeks on a side map cached on the tick result to avoid polluting
  //    Game. For now we reconstruct it from in-dev games with crunch flags.
  // -----------------------------------------------------------------------------------
  const priorCrunchWeeks: Record<string, number> = {};
  for (const g of games) {
    if (g.crunchActive) priorCrunchWeeks[g.id] = g.weeksInStage; // proxy: weeks in current stage
  }
  const crunchResult = applyCrunchTick(games, employees, rng, weekNow, priorCrunchWeeks);
  employees = crunchResult.employees;
  if (culture) {
    culture = {
      ...culture,
      cultureScore: Math.max(0, Math.min(100, culture.cultureScore + crunchResult.cultureDelta)),
    };
  }
  for (const resignedId of crunchResult.resignedIds) {
    const emp = employees.find(e => e.id === resignedId);
    if (emp) {
      events = addEvent(events, {
        id: idGen("evt"),
        week: weekNow,
        severity: "bad",
        message: `${emp.name} resigned during crunch. Two weeks' notice.`,
        relatedEmployeeId: emp.id,
      });
    }
  }
  // -----------------------------------------------------------------------------------
  // 4) Genre trend drift
  // -----------------------------------------------------------------------------------
  const trendResult = tickGenreTrends(state.genreTrends, weekNow, rng);
  const genreTrends = trendResult.trends;
  for (const rc of trendResult.regimeChanges) {
    events = addEvent(events, {
      id: idGen("evt"),
      week: weekNow,
      severity: rc.newPopularity > 1.3 ? "good" : rc.newPopularity < 0.7 ? "warn" : "info",
      message: rc.newPopularity > 1.0
        ? `${rc.genre} is suddenly hot again. Pop ${rc.newPopularity.toFixed(2)}×.`
        : `${rc.genre} is cooling. Pop ${rc.newPopularity.toFixed(2)}×.`,
    });
  }

  // -----------------------------------------------------------------------------------
  // 5) Platform deal offers — spawn new + expire old
  // -----------------------------------------------------------------------------------
  platformOffers = expirePlatformOffers(platformOffers, weekNow);
  const newOffers = rollPlatformOffers(games, platformOffers, weekNow, rng, idGen);
  if (newOffers.length > 0) {
    platformOffers = [...platformOffers, ...newOffers];
    for (const o of newOffers) {
      const g = games.find(g => g.id === o.targetGameId);
      events = addEvent(events, {
        id: idGen("evt"),
        week: weekNow,
        severity: "info",
        message: `${PLATFORM_INFO[o.platform].label} wants to talk exclusivity on ${g?.title ?? "your game"}.`,
      });
    }
  }

  // -----------------------------------------------------------------------------------
  // 6) Showcase airings — games featured in a showcase airing this week get a hype burst.
  // -----------------------------------------------------------------------------------
  const showcases = state.showcases;
  for (const slot of showcases) {
    if (slot.week !== weekNow) continue;
    for (const gameId of slot.featured) {
      const idx = games.findIndex(g => g.id === gameId);
      if (idx < 0) continue;
      const updated = applyShowcaseBurst(games[idx], weekNow, slot.showcase, slot.hypeBoost);
      games = [...games.slice(0, idx), updated, ...games.slice(idx + 1)];
      events = addEvent(events, {
        id: idGen("evt"),
        week: weekNow,
        severity: "good",
        message: `${updated.title} was featured at ${slot.showcase}. Hype spiking.`,
      });
    }
  }

  // -----------------------------------------------------------------------------------
  // 7) Auto-launch games that the player has marked ready (plannedLaunchWeek == now)
  //    or that hit isReadyToShip AND have a plannedLaunchWeek at/before this week.
  // -----------------------------------------------------------------------------------
  const launchedThisTick: { result: ReturnType<typeof launchGame>; originalIndex: number }[] = [];
  games = games.map((g, i) => {
    if (!isInDev(g)) return g;
    const scheduledNow = g.plannedLaunchWeek != null && g.plannedLaunchWeek <= weekNow;
    const ready = isReadyToShip(g);
    if (!scheduledNow || !ready) return g;
    const result = launchGame(g, weekNow, rng);
    launchedThisTick.push({ result, originalIndex: i });
    finance.cash += result.netCashToStudio;
    events = addEvent(events, {
      id: idGen("evt"),
      week: weekNow,
      severity: result.reviewScore >= 80 ? "good" : result.reviewScore >= 60 ? "info" : "bad",
      message: `${result.game.title} launched. Review ${result.reviewScore}. ${result.firstWeekSales.toLocaleString()} copies week 1.`,
      amount: result.netCashToStudio,
    });
    return result.game;
  });

  // -----------------------------------------------------------------------------------
  // 8) Post-launch sales tail for games in "released"/"live-service"/"mature"
  // -----------------------------------------------------------------------------------
  let weeklySalesTotal = 0;
  games = games.map(g => {
    if (!hasLaunched(g) || !g.launched) return g;
    if (g.stage === "sunset") return g;

    const { units, revenue } = tickPostLaunchSales(g, weekNow, rng);
    if (units === 0 && revenue === 0) return g;

    weeklySalesTotal += units;
    finance.cash += revenue;
    const newTotalSold = g.launched.totalSold + units;
    const nextTail = [...g.launched.weeklyTailSales, units];
    if (nextTail.length > 104) nextTail.shift(); // keep last 2 years for chart

    return {
      ...g,
      launched: {
        ...g.launched,
        totalSold: newTotalSold,
        weeklyTailSales: nextTail,
      },
      lifetimeRevenue: g.lifetimeRevenue + revenue,
      peakWeeklySales: Math.max(g.peakWeeklySales, units),
    };
  });

  // -----------------------------------------------------------------------------------
  // 9) Stage transitions — released → live-service/mature, mature → sunset
  // -----------------------------------------------------------------------------------
  games = games.map(g => {
    if (!hasLaunched(g)) return g;
    const next = nextPostLaunchStage(g, weekNow);
    if (next === g.stage) return g;
    let updated: Game = { ...g, stage: next as GameDevStage };
    if (next === "live-service") {
      updated = initLiveService(updated, weekNow);
      events = addEvent(events, {
        id: idGen("evt"),
        week: weekNow,
        severity: "info",
        message: `${g.title} is now live-service. MAU: ${updated.liveService?.mau.toLocaleString() ?? "?"}.`,
      });
    } else if (next === "mature") {
      events = addEvent(events, {
        id: idGen("evt"),
        week: weekNow,
        severity: "info",
        message: `${g.title} has matured into the long tail.`,
      });
    } else if (next === "sunset") {
      events = addEvent(events, {
        id: idGen("evt"),
        week: weekNow,
        severity: "warn",
        message: `${g.title} was sunset. ${g.launched?.totalSold.toLocaleString() ?? 0} lifetime sales.`,
      });
    }
    return updated;
  });

  // -----------------------------------------------------------------------------------
  // 10) Live-service tick for games in "live-service" stage
  // -----------------------------------------------------------------------------------
  let liveServiceMauTotal = 0;
  games = games.map(g => {
    if (g.stage !== "live-service" || !g.liveService) return g;
    const share = blendedDevShare(g.platforms);
    const res = tickLiveService(g, weekNow, rng, share);
    finance.cash += res.revenue;
    liveServiceMauTotal += res.game.liveService?.mau ?? 0;
    if (res.contentDropped) {
      events = addEvent(events, {
        id: idGen("evt"),
        week: weekNow,
        severity: "good",
        message: `Content drop live for ${g.title}. MAU surge incoming.`,
      });
    }
    return res.game;
  });

  // -----------------------------------------------------------------------------------
  // 11) DLC pipeline advancement
  // -----------------------------------------------------------------------------------
  games = games.map(g => {
    if (g.dlcPipeline.length === 0 || !hasLaunched(g)) return g;
    const share = blendedDevShare(g.platforms);
    const res = tickDlcPipeline(g, weekNow, rng, share);
    if (res.revenueFromShips > 0) {
      finance.cash += res.revenueFromShips;
      for (const pack of res.shipped) {
        events = addEvent(events, {
          id: idGen("evt"),
          week: weekNow,
          severity: "good",
          message: `${pack.name} shipped. DLC revenue: $${res.revenueFromShips.toLocaleString()}.`,
          amount: res.revenueFromShips,
        });
      }
    }
    return res.game;
  });

  // -----------------------------------------------------------------------------------
  // 12) Review bombs — decay active, maybe ignite new
  // -----------------------------------------------------------------------------------
  games = games.map(g => {
    if (!hasLaunched(g)) return g;
    let nextBomb = decayReviewBomb(g.reviewBomb, weekNow);
    if (nextBomb === undefined && g.reviewBomb) {
      events = addEvent(events, {
        id: idGen("evt"),
        week: weekNow,
        severity: "good",
        message: `Controversy around ${g.title} has blown over.`,
      });
    }
    if (!nextBomb) {
      const ignited = maybeIgniteReviewBomb(g, weekNow, rng);
      if (ignited) {
        nextBomb = ignited;
        events = addEvent(events, {
          id: idGen("evt"),
          week: weekNow,
          severity: "bad",
          message: `${g.title} is getting review-bombed: "${ignited.reason}".`,
        });
      }
    }
    return { ...g, reviewBomb: nextBomb };
  });

  // -----------------------------------------------------------------------------------
  // 13) Finance: burn (salaries, dev costs, marketing)
  // -----------------------------------------------------------------------------------
  // Salary burn — weekly slice of annual salary (÷52).
  const salaryBurn = employees.reduce((sum, e) => sum + e.salary / 52, 0);
  // Dev cost burn from all in-dev games (scales with team, crunch premium).
  const devBurn = games.reduce((sum, g) => {
    if (!isInDev(g)) return sum;
    return sum + g.devBudget * (g.crunchActive ? 1.25 : 1.0);
  }, 0);
  // Marketing burn from all pre-launch games with marketing budget.
  const marketingBurn = games.reduce((sum, g) => {
    if (hasLaunched(g)) return sum;
    return sum + g.marketingBudget;
  }, 0);

  const totalBurn = Math.round(salaryBurn + devBurn + marketingBurn);
  finance.cash -= totalBurn;

  // Accumulate on games.
  games = games.map(g => {
    if (!isInDev(g) && !hasLaunched(g)) return g;
    const gameDevCost = isInDev(g) ? g.devBudget * (g.crunchActive ? 1.25 : 1.0) : 0;
    const gameMarketing = hasLaunched(g) ? 0 : g.marketingBudget;
    return {
      ...g,
      lifetimeDevCost: g.lifetimeDevCost + gameDevCost,
      lifetimeMarketingCost: g.lifetimeMarketingCost + gameMarketing,
      lifetimeCost: g.lifetimeCost + gameDevCost + gameMarketing,
    };
  });

  // Weekly history window (last 104 weeks).
  const weeklyRevenueHistory = [...finance.weeklyRevenueHistory, Math.max(0, finance.cash - state.finance.cash + totalBurn)];
  const weeklyBurnHistory = [...finance.weeklyBurnHistory, totalBurn];
  if (weeklyRevenueHistory.length > 104) weeklyRevenueHistory.shift();
  if (weeklyBurnHistory.length > 104) weeklyBurnHistory.shift();

  finance = { ...finance, weeklyRevenueHistory, weeklyBurnHistory };

  // -----------------------------------------------------------------------------------
  // 14) Bankruptcy check
  // -----------------------------------------------------------------------------------
  let gameOver: GameStudioState["gameOver"] = state.gameOver;
  if (finance.cash <= -10_000 && !gameOver) {
    gameOver = {
      reason: "bankrupt",
      week: weekNow,
      narrative: "The studio ran out of cash. The servers go dark; the IP goes into receivership.",
    };
    events = addEvent(events, {
      id: idGen("evt"),
      week: weekNow,
      severity: "bad",
      message: "The studio is bankrupt. All projects halted.",
    });
  }

  // -----------------------------------------------------------------------------------
  // 15) Advance calendar
  // -----------------------------------------------------------------------------------
  const cal = advanceCalendar(state);
  const cashDelta = finance.cash - state.finance.cash;

  return {
    ...state,
    ...cal,
    games,
    employees,
    finance,
    events,
    culture,
    platformOffers,
    genreTrends,
    gameOver,
    lastTickDeltas: {
      week: cal.week,
      cash: cashDelta,
      weeklySales: weeklySalesTotal,
      mau: liveServiceMauTotal,
    },
  };
}

// =====================================================================================
// Utility: extract a list of "things happening this week" for the UI
// =====================================================================================

/**
 * Peek at what's likely to happen this tick. Used by the UI's "this week in
 * the studio" preview card. Doesn't actually advance state.
 */
export function peekUpcomingThisWeek(state: GameStudioState): string[] {
  const out: string[] = [];
  const weekNow = state.week;

  // Showcases airing this week or soon
  const soonShowcases = state.showcases.filter(s => s.week === weekNow + 1);
  for (const s of soonShowcases) {
    out.push(`${s.showcase} airs next week — featured: ${s.featured.length} game(s)`);
  }

  // Games about to ship
  for (const g of state.games) {
    if (g.plannedLaunchWeek === weekNow + 1 && isReadyToShip(g)) {
      out.push(`${g.title} is scheduled to launch next week`);
    }
  }

  // Expiring platform offers
  for (const o of state.platformOffers) {
    if (o.expiresWeek === weekNow + 1) {
      out.push(`${PLATFORM_INFO[o.platform].label} deal offer expires next week`);
    }
  }

  return out;
}

/** Attach a new game to an existing studio — returns patched state. */
export function addGameToStudio(state: GameStudioState, g: Game): GameStudioState {
  return { ...state, games: [...state.games, g] };
}

/** Remove a game (cancellation) — archives and refunds nothing. */
export function cancelGame(state: GameStudioState, gameId: ID): GameStudioState {
  const g = state.games.find(x => x.id === gameId);
  if (!g || hasLaunched(g)) return state;
  const nextGames = state.games.filter(x => x.id !== gameId);
  const archived = {
    id: g.id,
    title: g.title,
    genre: g.genre,
    scope: g.scope,
    platforms: g.platforms,
    foundedWeek: state.week - g.weeksSinceStart,
    sunsetWeek: state.week,
    totalSold: 0,
    lifetimeRevenue: 0,
    lifetimeCost: g.lifetimeCost,
    reason: "cancelled" as const,
    verdict: "cancelled" as const,
    narrative: `${g.title} was cancelled in ${g.stage}. ${g.weeksSinceStart} weeks of work shelved.`,
  };
  return {
    ...state,
    games: nextGames,
    archivedGames: [...state.archivedGames, archived],
    events: [{
      id: `evt_cancel_${g.id}_${state.week}`,
      week: state.week,
      severity: "warn" as const,
      message: `Cancelled ${g.title}. ${g.weeksSinceStart} weeks shelved.`,
    }, ...state.events],
  };
}
