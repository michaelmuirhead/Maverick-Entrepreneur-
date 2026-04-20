import { AcquisitionDeal, ArchivedProduct, Competitor, GameEvent, GameState, Product } from "./types";
import { makeRng, RNG } from "./rng";
import { advanceProductStage, agingDecay, signupsThisWeek, maintenanceCost, weeklyRevenue } from "./products";
import { updateMoraleAndAttrition, weeklyPayroll } from "./team";
import { computeMrr } from "./finance";
import { updateTrends, demandFor } from "./market";
import { advanceEconomy, economyChurnMultiplier, economyDemandMultiplier } from "./economy";
import { pressureOn, runCompetitorAi } from "./competitors";
import { rollRandomEvent } from "./events";
import { teamEffects } from "./roles";
import { applySegmentChanges, blendedMrr, partitionSignups, totalUsers } from "./segments";
import { buildArchiveEntry } from "./archive";
import { debtDriftPostLaunch, debtGainFromDev, debtGainFromVNext, isRefactorActive, refactorProgress, refactorWeeklyCost } from "./debt";
import { advanceCompetitorLifecycle, runAiMandA } from "./mergers";
import { officeProductivity, resolvePendingUpgrade, weeklyOfficeCost } from "./office";
import { perkAttritionMultiplier, recomputeCultureScore, weeklyPerkCost } from "./culture";
import { campaignMultiplierForProduct, dropExpired, weeklyCampaignBurn } from "./campaigns";
import { computeSupportQuality, supportChurnMultiplier } from "./support";
import {
  advanceOss, advancePatents, advanceRegions, expireGovContracts,
  partnershipMultiplier, regionalSignupMultiplier, weeklyGovRevenue,
  weeklyOssBurn, weeklyPartnershipBurn,
} from "./portfolio";

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

  // 1b) Advance the macro-economic phase (boom/stable/recession). Slow-moving world
  //     state that feeds into demand, churn, funding, and valuations this tick.
  const nextEconomy = advanceEconomy(state.economy, nextWeek, events, rng);
  const econDemand = economyDemandMultiplier(nextEconomy);
  const econChurn = economyChurnMultiplier(nextEconomy);

  // 1c) Resolve any pending office build-out that finishes this tick. The office tier
  //     influences productivity, morale, and prestige. Skip quietly if no office set
  //     (legacy saves migrate to "garage"; fresh games start there too).
  let nextOffice = state.office;
  if (nextOffice) {
    nextOffice = resolvePendingUpgrade(nextOffice, nextWeek, (msg) => {
      events.push({
        id: `ev_${nextWeek}_office_move`,
        week: nextWeek, severity: "good",
        message: msg,
      });
    });
  }
  const officeProdMult = nextOffice
    ? officeProductivity(nextOffice, state.employees.length)
    : 1;

  // 1d) Expire any campaigns that have run their course. Drop them here so burn math
  //     below doesn't charge for finished spend.
  const activeCampaigns = dropExpired(state.campaigns, nextWeek);

  // 1e) Advance patents (filings graduate to "granted" after grant period), regions
  //     (localization slowly improves), and open-source (stars grow with budget).
  const nextPatents = advancePatents(state.patents, nextWeek);
  const nextOss = advanceOss(state.openSource, nextWeek, rng);
  const nextRegions = advanceRegions(state.regions);
  const nextGovContracts = expireGovContracts(state.govContracts, nextWeek);
  const regionMult = regionalSignupMultiplier(nextRegions);

  // 2a) Competitor lifecycle sim — each rival ages one week: revenue, burn, users,
  //     quality drift, stage transitions (scrappy → growth → mature → declining → dead).
  //     Runs before strategic moves so acquired/dead competitors are correctly skipped below.
  const competitorsPostLifecycle: Competitor[] = state.competitors.map(c =>
    advanceCompetitorLifecycle(c, nextWeek, events, rng),
  );

  // 2b) Competitor moves — may mutate player employees via poaching, so we thread
  //     the returned employees list into the rest of the tick as the "current" roster.
  const {
    competitors: competitorsPostAi,
    employees: employeesAfterPoach,
  } = runCompetitorAi(
    { ...state, week: nextWeek, trends: nextTrends, competitors: competitorsPostLifecycle },
    events, rng,
  );

  // 2c) Background M&A — cash-rich rivals occasionally buy struggling same-category peers.
  const { competitors: competitorsPostMna, deals: newAiDeals } = runAiMandA(
    { ...state, week: nextWeek, competitors: competitorsPostAi },
    events, rng,
  );
  const nextCompetitors = competitorsPostMna;

  // 3) Product simulation: signups, churn, health decay, stage transitions
  const nextProducts: Product[] = state.products.map((p) => {
    let np = { ...p };
    // Ensure the prior-user snapshot is set *before* we mutate users this tick. The
    // one-time revenue model reads this to compute new sales = currentUsers - lastWeekUserTotal.
    // On the first tick after a migration, `lastWeekUserTotal` may be undefined — we seed it
    // from the current total, which makes the first week's one-time revenue zero (no delta).
    const priorUserTotal = np.lastWeekUserTotal ?? totalUsers(np);
    np.lastWeekUserTotal = priorUserTotal;

    // Per-product demand: trend multipliers × macro economy phase × regional coverage
    // × active marketing campaigns × partnerships. Trends use their current ramp/fade
    // intensity at `nextWeek` so spawning and sunsetting trends feel gradual rather than instant.
    const trendDemand = demandFor(np.category, nextTrends, nextWeek);
    const campaignMult = campaignMultiplierForProduct(np.id, activeCampaigns, nextWeek);
    const partnerMult = partnershipMultiplier(state.partnerships, np.category);
    const marketDemand = trendDemand * econDemand * regionMult * campaignMult * partnerMult;
    const pressure = pressureOn(np.category, nextCompetitors);
    // Snapshot the team's role contributions once per product, then feed into every system
    // below (signups, churn, dev velocity, vNext, launch quality). Using the post-poach
    // roster keeps role effects consistent with the people actually still in seats.
    const team = teamEffects(np.assignedEngineers, employeesAfterPoach);

    // Signups + churn (only for live products). Signups are computed as a total, then
    // partitioned across segments based on category mix modulated by sales/marketing team.
    const signupTotal = signupsThisWeek(np, { marketDemand, competitorPressure: pressure, rng, team });
    const signupsBySeg = partitionSignups(signupTotal, np, team, rng);
    // Blend macro-economy churn with support-quality churn. Support starts at 80 (neutral);
    // a bad support operation (quality < 50) noticeably elevates churn on top of any macro effect.
    const supportChurn = supportChurnMultiplier(state.support);
    np.users = applySegmentChanges(np, signupsBySeg, team, econChurn * supportChurn);
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

    // Note: we deliberately do NOT update np.lastWeekUserTotal here. The finance rollup
    // below calls weeklyRevenue() a second time on the same product, and one-time
    // revenue needs `lastWeekUserTotal` to still reflect the *prior tick's* total so
    // "new users this week" stays consistent. We advance lastWeekUserTotal as a final
    // pass once the finance step is done.

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
  // Strip the transient refactor-cost field now that we've captured it. We'll advance
  // `lastWeekUserTotal` as a final pass further down, after the finance step runs
  // `weeklyRevenue` one more time against the pre-tick snapshot.
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
  // Revenue math is done; roll lastWeekUserTotal forward on every surviving product so
  // next tick's one-time revenue calc sees this week's totals as its "prior".
  for (const p of survivingProducts) {
    p.lastWeekUserTotal = totalUsers(p);
  }
  const maintenance = survivingProducts.reduce((s, p) => s + maintenanceCost(p), 0);
  const payroll = weeklyPayroll(employeesPostArchive);
  // New cost buckets from the v7 systems: office rent, perks, campaigns, partnerships,
  // open-source sponsorship. All scale with headcount or are flat weekly amounts.
  const officeRent = nextOffice ? weeklyOfficeCost(nextOffice) : 0;
  const perkBurn = weeklyPerkCost(state.culture, employeesPostArchive.length);
  const campaignBurn = weeklyCampaignBurn(activeCampaigns, nextWeek);
  const partnerBurn = weeklyPartnershipBurn(state.partnerships);
  const ossBurn = weeklyOssBurn(nextOss);
  // New revenue stream: government contracts recognize revenue evenly across their term.
  const govRevenue = weeklyGovRevenue(nextGovContracts, nextWeek);

  const weeklyBurn = payroll + maintenance + refactorBurn + officeRent + perkBurn + campaignBurn + partnerBurn + ossBurn;
  const netChange = (revenue + govRevenue) - weeklyBurn;
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

  // Merge any fresh AI-side M&A deals into the running deal history (newest first).
  const mergedDeals: AcquisitionDeal[] = newAiDeals.length > 0
    ? [...newAiDeals, ...(staged.deals ?? [])].slice(0, 100)
    : staged.deals ?? [];

  // Recompute support quality from the post-tick roster + user total.
  const postTickUserTotal = survivingProducts.reduce((s, p) => s + totalUsers(p), 0);
  const postTickMrr = staged.finance.mrr;
  const nextSupport = computeSupportQuality(
    { totalUsers: postTickUserTotal, mrr: postTickMrr, employees: nextEmployees },
    state.support,
  );

  // Recompute culture score from current perks + average morale. Culture drifts
  // each tick so a great hire announcement isn't needed — it just reflects reality.
  const avgMorale = nextEmployees.length > 0
    ? nextEmployees.reduce((s, e) => s + e.morale, 0) / nextEmployees.length
    : null;
  const nextCulture = state.culture
    ? { ...state.culture, cultureScore: recomputeCultureScore(state.culture, avgMorale) }
    : undefined;

  // Apply perk-driven attrition reduction as a one-liner event if someone's morale
  // is clearly being propped up this tick (informational only).
  const perkAttr = perkAttritionMultiplier(state.culture);
  void perkAttr; // reserved for future use in team.ts

  // Apply the office productivity multiplier to any in-flight dev progress this tick.
  // We scale devProgress gains up or down slightly — done post-hoc so the existing
  // stage transition logic stays untouched.
  const productivityAdjusted = survivingProducts.map(p => {
    if (p.stage !== "dev" || officeProdMult === 1) return p;
    // Nudge devProgress a little based on this tick's office productivity delta.
    const bump = (officeProdMult - 1) * 1.5;
    return { ...p, devProgress: Math.max(0, Math.min(100, p.devProgress + bump)) };
  });

  return {
    ...staged,
    products: productivityAdjusted,
    year,
    quarter: quarterFromWeek,
    competitors: nextCompetitors,
    deals: mergedDeals,
    trends: nextTrends,
    economy: nextEconomy,
    employees: nextEmployees,
    office: nextOffice ?? staged.office,
    culture: nextCulture ?? staged.culture,
    campaigns: activeCampaigns,
    support: nextSupport,
    patents: nextPatents,
    openSource: nextOss,
    partnerships: state.partnerships,
    govContracts: nextGovContracts,
    regions: nextRegions,
    ipo: state.ipo,
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
