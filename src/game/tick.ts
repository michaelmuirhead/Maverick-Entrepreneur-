import { GameEvent, GameState, Product } from "./types";
import { makeRng, RNG } from "./rng";
import { advanceProductStage, agingDecay, churnRate, signupsThisWeek, maintenanceCost, weeklyRevenue } from "./products";
import { updateMoraleAndAttrition, weeklyPayroll } from "./team";
import { computeMrr } from "./finance";
import { updateTrends, demandFor } from "./market";
import { pressureOn, runCompetitorAi } from "./competitors";
import { rollRandomEvent } from "./events";

const HISTORY_LIMIT = 52;       // keep 52 weeks of chart data
const EVENT_LIMIT = 200;        // keep latest N events

/**
 * advanceWeek — the entire simulation step as a pure function.
 * Given a state and an RNG, produce the next state.
 *
 * Determinism: if you pass the same state and seed, you get the same output.
 * Purity: no references to Date, Math.random, localStorage, etc.
 */
export function advanceWeek(state: GameState): GameState {
  if (state.gameOver) return state; // no-op

  // Build a per-tick RNG from the master seed + week so ticks are reproducible.
  const rng: RNG = makeRng(`${state.seed}:w${state.week + 1}`);
  const nextWeek = state.week + 1;

  // Events accumulate across systems this tick
  const events: GameEvent[] = [];

  // 1) Update market trends
  const nextTrends = updateTrends({ ...state, week: nextWeek }, events, rng);

  // 2) Competitor moves
  const nextCompetitors = runCompetitorAi({ ...state, week: nextWeek, trends: nextTrends }, events, rng);

  // 3) Product simulation: signups, churn, health decay, stage transitions
  const nextProducts: Product[] = state.products.map((p) => {
    let np = { ...p };
    const marketDemand = demandFor(np.category, nextTrends);
    const pressure = pressureOn(np.category, nextCompetitors);

    // Signups + churn (only for live products)
    const signups = signupsThisWeek(np, { marketDemand, competitorPressure: pressure, rng });
    const churn = Math.floor(np.users * churnRate(np));
    np.users = Math.max(0, np.users + signups - churn);

    // Marketing flavor: big spend + big conversion = a headline. Big spend + weak conversion = a lesson.
    if ((np.marketingBudget ?? 0) >= 3000 && ["launched", "mature"].includes(np.stage)) {
      const costPerSignup = signups > 0 ? np.marketingBudget / signups : Infinity;
      if (signups > 25 && costPerSignup < 120 && rng.chance(0.35)) {
        events.push({
          id: `ev_${nextWeek}_mkt_hit_${np.id}`,
          week: nextWeek, severity: "good",
          message: `${np.name}'s campaign is converting — ${signups} signups this week at about $${Math.round(costPerSignup)} CAC. The CFO almost smiled.`,
          relatedProductId: np.id,
        });
      } else if (costPerSignup > 400 && rng.chance(0.25)) {
        events.push({
          id: `ev_${nextWeek}_mkt_miss_${np.id}`,
          week: nextWeek, severity: "warn",
          message: `${np.name}'s ad spend isn't landing. CAC is hovering around $${Math.round(Math.min(9999, costPerSignup))}. Worth a creative refresh — or a budget cut.`,
          relatedProductId: np.id,
        });
      }
    }

    // Health decay
    const decay = agingDecay(np, rng);
    np.health = Math.max(0, np.health - decay);

    // Stage transitions (including shipping from dev)
    np = advanceProductStage(np, events, nextWeek, rng);

    return np;
  });

  // 4) Finance: revenue - expenses
  const revenue = nextProducts.reduce((s, p) => s + weeklyRevenue(p), 0);
  const maintenance = nextProducts.reduce((s, p) => s + maintenanceCost(p), 0);
  const payroll = weeklyPayroll(state.employees);
  const weeklyBurn = payroll + maintenance;
  const netChange = revenue - weeklyBurn;
  let nextCash = state.finance.cash + netChange;

  // Bankruptcy check
  let nextGameOver: GameState["gameOver"] = state.gameOver;
  if (nextCash < 0 && !nextGameOver) {
    nextGameOver = {
      reason: "bankrupt",
      week: nextWeek,
      narrative: `${state.company.name} ran out of cash. The lights are off but the lessons are on.`,
    };
    events.push({
      id: `ev_${nextWeek}_bankrupt`,
      week: nextWeek, severity: "bad",
      message: nextGameOver.narrative,
    });
    nextCash = 0;
  }

  // 5) Team: morale + attrition
  const staged: GameState = {
    ...state,
    week: nextWeek,
    finance: {
      ...state.finance,
      cash: nextCash,
      mrr: nextProducts.reduce((s, p) => s + (["launched","mature","declining"].includes(p.stage) ? p.users * p.pricePerUser : 0), 0),
    },
    products: nextProducts,
  };
  const nextEmployees = updateMoraleAndAttrition(staged, events, rng);

  // 6) Random flavor event (at most one per week)
  const flavor = rollRandomEvent({ ...staged, employees: nextEmployees }, rng);
  if (flavor) events.push(flavor);

  // 7) Push revenue + burn into history (weekly)
  const weeklyRevenueHistory = [...state.finance.weeklyRevenueHistory, Math.round(staged.finance.mrr)].slice(-HISTORY_LIMIT);
  const weeklyBurnHistory = [...state.finance.weeklyBurnHistory, Math.round(weeklyBurn)].slice(-HISTORY_LIMIT);

  // 8) Roll year/quarter
  const year = 1 + Math.floor(nextWeek / 52);
  const quarterFromWeek = (((Math.floor((nextWeek % 52) / 13)) % 4) + 1) as 1 | 2 | 3 | 4;

  // 9) Merge events (latest first, capped)
  const mergedEvents = [...events.reverse(), ...state.events].slice(0, EVENT_LIMIT);

  return {
    ...staged,
    year,
    quarter: quarterFromWeek,
    competitors: nextCompetitors,
    trends: nextTrends,
    employees: nextEmployees,
    finance: {
      ...staged.finance,
      weeklyRevenueHistory,
      weeklyBurnHistory,
    },
    events: mergedEvents,
    gameOver: nextGameOver,
  };
}

/** Convenience selector used by UI for headline numbers. */
export function getHeadlineStats(s: GameState) {
  const mrr = computeMrr(s);
  const monthlyBurn = ((s.finance.weeklyBurnHistory.slice(-4).reduce((a, b) => a + b, 0)) / 4) * 4.33 || (weeklyPayroll(s.employees) * 4.33);
  const runwayMo = monthlyBurn > 0 ? s.finance.cash / monthlyBurn : 999;
  return { mrr, monthlyBurn, runwayMo };
}
