import { ArchivedProduct, GameEvent, GameState, Product } from "./types";
import { makeRng, RNG } from "./rng";
import { advanceProductStage, agingDecay, signupsThisWeek, maintenanceCost, weeklyRevenue } from "./products";
import { updateMoraleAndAttrition, weeklyPayroll } from "./team";
import { computeMrr } from "./finance";
import { updateTrends, demandFor } from "./market";
import { pressureOn, runCompetitorAi } from "./competitors";
import { rollRandomEvent } from "./events";
import { teamEffects } from "./roles";
import { applySegmentChanges, blendedMrr, partitionSignups, totalUsers } from "./segments";
import { buildArchiveEntry } from "./archive";
import { debtDriftPostLaunch, debtGainFromDev, debtGainFromVNext, isRefactorActive, refactorProgress, refactorWeeklyCost } from "./debt";

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

  // 2) Competitor moves — may mutate player employees via poaching, so we thread
  //    the returned employees list into the rest of the tick as the "current" roster.
  const {
    competitors: nextCompetitors,
    employees: employeesAfterPoach,
  } = runCompetitorAi({ ...state, week: nextWeek, trends: nextTrends }, events, rng);

  // 3) Product simulation: signups, churn, health decay, stage transitions
  const nextProducts: Product[] = state.products.map((p) => {
    let np = { ...p };
    const marketDemand = demandFor(np.category, nextTrends);
    const pressure = pressureOn(np.category, nextCompetitors);
    // Snapshot the team's role contributions once per product, then feed into every system
    // below (signups, churn, dev velocity, vNext, launch quality). Using the post-poach
    // roster keeps role effects consistent with the people actually still in seats.
    const team = teamEffects(np.assignedEngineers, employeesAfterPoach);

    // Signups + churn (only for live products). Signups are computed as a total, then
    // partitioned across segments based on category mix modulated by sales/marketing team.
    const signupTotal = signupsThisWeek(np, { marketDemand, competitorPressure: pressure, rng, team });
    const signupsBySeg = partitionSignups(signupTotal, np, team, rng);
    np.users = applySegmentChanges(np, signupsBySeg, team);
    const signups = signupTotal;

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
    np = advanceProductStage(np, events, nextWeek, rng, team);

    // Tech debt: accumulate from dev pressure / vNext work / slow post-launch drift. If
    // a refactor sprint is active this week, burn debt off fast and forgo accumulation.
    const refactorActiveNow = isRefactorActive(np, nextWeek);
    const prevDebt = np.techDebt ?? 0;
    let debtDelta = 0;
    let refactorSpend = 0;
    if (refactorActiveNow) {
      debtDelta = -refactorProgress(team);
      refactorSpend = refactorWeeklyCost(np, team);
    } else {
      debtDelta =
        debtGainFromDev(np, team) +
        debtGainFromVNext(np, team) +
        debtDriftPostLaunch(np, team);
    }
    np.techDebt = Math.max(0, Math.min(100, prevDebt + debtDelta));
    // Clean up refactorSprintUntil if it has expired this tick.
    if (typeof np.refactorSprintUntil === "number" && np.refactorSprintUntil <= nextWeek) {
      if (refactorActiveNow) {
        events.push({
          id: `ev_${nextWeek}_refactor_done_${np.id}`,
          week: nextWeek, severity: "good",
          message: `${np.name}'s refactor sprint wrapped. Debt dropped from ${Math.round(prevDebt)} to ${Math.round(np.techDebt)}. Engineers are briefly cheerful.`,
          relatedProductId: np.id,
        });
      }
      np.refactorSprintUntil = undefined;
    }
    // Debt-crossed-threshold flavor: warn the player once they're in "Brittle" or "On fire" territory.
    if (prevDebt < 60 && np.techDebt >= 60) {
      events.push({
        id: `ev_${nextWeek}_debt_brittle_${np.id}`,
        week: nextWeek, severity: "warn",
        message: `${np.name}'s codebase is getting brittle (debt ${Math.round(np.techDebt)}/100). Velocity's dragging and churn is creeping up. A refactor sprint would help.`,
        relatedProductId: np.id,
      });
    } else if (prevDebt < 85 && np.techDebt >= 85) {
      events.push({
        id: `ev_${nextWeek}_debt_fire_${np.id}`,
        week: nextWeek, severity: "bad",
        message: `${np.name} is on fire — tech debt at ${Math.round(np.techDebt)}. On-call is burning out. Pay it down or kiss this product's users goodbye.`,
        relatedProductId: np.id,
      });
    }

    // Lifetime tallies — roll revenue earned and cost spent this week into the product's
    // running totals. These drive the archive post-mortem when the product eventually closes.
    const weekRev = weeklyRevenue(np);
    const baseWeekCost = maintenanceCost(np);
    const weekCost = baseWeekCost + refactorSpend;
    const weekDevCost = (np.stage === "dev" ? np.devBudget : 0) + (np.nextVersion ? np.nextVersion.devBudget : 0) + refactorSpend;
    const weekMarketingCost = ["launched", "mature", "declining"].includes(np.stage) ? (np.marketingBudget ?? 0) : 0;
    np.lifetimeRevenue = (np.lifetimeRevenue ?? 0) + weekRev;
    np.lifetimeCost = (np.lifetimeCost ?? 0) + weekCost;
    np.lifetimeDevCost = (np.lifetimeDevCost ?? 0) + weekDevCost;
    np.lifetimeMarketingCost = (np.lifetimeMarketingCost ?? 0) + weekMarketingCost;
    const curUsers = totalUsers(np);
    const curMrr = blendedMrr(np);
    np.peakUsers = Math.max(np.peakUsers ?? 0, curUsers);
    np.peakMrr = Math.max(np.peakMrr ?? 0, curMrr);

    // Stash the refactor spend on the product as a transient "extraCost" so the
    // finance rollup below can charge it as part of the week's burn.
    (np as Product & { _refactorCostThisTick?: number })._refactorCostThisTick = refactorSpend;

    return np;
  });

  // Auto-archive any products that aged out to EOL this tick. They move off the
  // active roster and their final stats get snapshotted into archivedProducts.
  const freshlyEol = nextProducts.filter(p => p.stage === "eol");
  const newArchiveEntries: ArchivedProduct[] = freshlyEol.map(p =>
    buildArchiveEntry(p, nextWeek, "decayed"),
  );
  const survivingProductsWithTransient = nextProducts.filter(p => p.stage !== "eol");
  // Read the refactor-cost transient before stripping it, so we charge it in the finance rollup.
  const refactorBurn = survivingProductsWithTransient.reduce((s, p) => {
    const tp = p as Product & { _refactorCostThisTick?: number };
    return s + (tp._refactorCostThisTick ?? 0);
  }, 0);
  // Strip the transient refactor-cost field now that we've captured it.
  const survivingProducts: Product[] = survivingProductsWithTransient.map(p => {
    const { _refactorCostThisTick: _drop, ...rest } = p as Product & { _refactorCostThisTick?: number };
    void _drop;
    return rest as Product;
  });
  // Release anyone assigned to an archived product.
  const archivedIds = new Set(freshlyEol.map(p => p.id));
  const employeesPostArchive = employeesAfterPoach.map(e =>
    e.assignedProductId && archivedIds.has(e.assignedProductId)
      ? { ...e, assignedProductId: undefined }
      : e,
  );

  // 4) Finance: revenue - expenses. We use the surviving roster here so archived
  //    (just-closed) products don't keep burning or earning for the week they end.
  //    Their contribution for the week was already counted above when we ran signups/revenue
  //    through the tick; archiving just stops future weeks from accruing.
  const revenue = survivingProducts.reduce((s, p) => s + weeklyRevenue(p), 0);
  const maintenance = survivingProducts.reduce((s, p) => s + maintenanceCost(p), 0);
  const payroll = weeklyPayroll(employeesPostArchive);
  const weeklyBurn = payroll + maintenance + refactorBurn;
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

  // 5) Team: morale + attrition (operates on employees post-poaching and
  //    post-archive-release so rivals that flipped someone into notice this tick
  //    don't get undone here, and recently-archived assignments are cleared.).
  const staged: GameState = {
    ...state,
    week: nextWeek,
    finance: {
      ...state.finance,
      cash: nextCash,
      mrr: survivingProducts.reduce((s, p) => s + (["launched","mature","declining"].includes(p.stage) ? blendedMrr(p) : 0), 0),
    },
    products: survivingProducts,
    archivedProducts: [...newArchiveEntries, ...(state.archivedProducts ?? [])],
    employees: employeesPostArchive,
  };
  const nextEmployees = updateMoraleAndAttrition(staged, events, rng);

  // Events: call out each newly-archived product so the player sees the post-mortem verdict
  //         surface in the news ticker instead of only in the archive page.
  for (const arch of newArchiveEntries) {
    events.push({
      id: `ev_${nextWeek}_archive_${arch.id}`,
      week: nextWeek, severity: "warn",
      message: `${arch.name} has been archived. ${arch.narrative}`,
      relatedProductId: arch.id,
    });
  }

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

  // 10) Snapshot this tick's headline deltas so the HQ can render an inline recap.
  const prevUsers = state.products.reduce((s, p) => s + totalUsers(p), 0);
  const nextUsers = survivingProducts.reduce((s, p) => s + totalUsers(p), 0);
  const lastTickDeltas = {
    week: nextWeek,
    cash: nextCash - state.finance.cash,
    mrr: staged.finance.mrr - state.finance.mrr,
    users: nextUsers - prevUsers,
  };

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
    lastTickDeltas,
  };
}

/** Convenience selector used by UI for headline numbers. */
export function getHeadlineStats(s: GameState) {
  const mrr = computeMrr(s);
  const monthlyBurn = ((s.finance.weeklyBurnHistory.slice(-4).reduce((a, b) => a + b, 0)) / 4) * 4.33 || (weeklyPayroll(s.employees) * 4.33);
  const runwayMo = monthlyBurn > 0 ? s.finance.cash / monthlyBurn : 999;
  return { mrr, monthlyBurn, runwayMo };
}
