import type {
  Company,
  EconomyState,
  GameEvent,
  GameState,
  Heir,
  Location,
  MonthlyReport,
  PoliticalAction,
  PoliticsState,
  Property,
  RivalMove,
} from "@/types";
import { INDUSTRIES } from "@/data/industries";
import { CITY_MAP } from "@/data/cities";
import { EVENT_TEMPLATES } from "@/data/events";
import {
  BRAND_DECAY_PER_MONTH,
  companyOpsOverhead,
  locationTierRevenueMultiplier,
  marketingBrandGain,
  marketingReputationGain,
  STAFF_TIERS,
} from "@/data/operations";
import { applyMoveEffects, generateThreats, rollRivalMoves } from "@/engine/rivals";
import { detectDefeats } from "@/engine/rivalDefeat";
import {
  evolveClimate,
  evolveStakeholders,
  industryLaborReduction,
  resolveLobbying,
} from "@/engine/politics";
import {
  ageFounder,
  ageHeirs,
  driftFounderHealth,
  generateHeir,
  refreshDoctorsNote,
  shouldHaveChild,
} from "@/engine/dynasty";
import {
  appreciateProperty,
  refreshListings,
  totalRealEstateCashDelta,
} from "@/engine/realEstate";
import { SECURED_RATE_ANNUAL } from "@/data/realEstate";
import { rollSuddenDeath } from "@/engine/succession";

// ------- RNG -------
function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function chance(p: number): boolean {
  return Math.random() < p;
}

// ------- Revenue / Profit -------
export function computeLocationFinances(
  location: Location,
  company: Company,
  economy: EconomyState,
  politics: PoliticsState,
  automationReduction: number = 0,
  governmentRep: number = 50
): { revenue: number; profit: number } {
  const industry = INDUSTRIES[location.industry];
  const city = CITY_MAP[location.cityId];
  if (!industry || !city) return { revenue: 0, profit: 0 };

  const isLaw = location.industry === "law";

  const fit = city.industryFit[location.industry] ?? 1.0;

  // Law firms: brand matters disproportionately — a famous firm earns multiples of what a no-name firm earns
  const brandMult = isLaw
    ? 0.55 + (company.brandStrength / 100) * 1.0  // 0.55..1.55
    : 0.75 + (company.brandStrength / 100) * 0.6; // 0.75..1.35

  const qualityTierBase = locationTierRevenueMultiplier(location.qualityTier); // 1.0 / 1.20 / 1.32
  // Law firms: an additional +15% on top of the Tier III flagship multiplier — partners care about the address
  const qualityMult = isLaw && location.qualityTier === 3 ? qualityTierBase * 1.15 : qualityTierBase;

  const staffTierBase = STAFF_TIERS[company.staffTier].revenueMultiplier;      // 1.0 / 1.08 / 1.18 / 1.32
  // Law firms: Elite tier is named partners — buff to 1.5x
  const staffMult = isLaw && company.staffTier === 4 ? 1.5 : staffTierBase;

  // Law firms: recession-resistant. GDP growth matters 0.8x instead of 3x
  const econMult = isLaw
    ? 1 + economy.gdpGrowth * 0.8 + (economy.consumerConfidence - 50) / 400
    : 1 + economy.gdpGrowth * 3 + (economy.consumerConfidence - 50) / 200;

  // Law firms: government stakeholder coupling. High government rep = more regulatory/advisory work
  // +15% revenue when government rep is above 70, -5% when below 30
  const govMult = isLaw
    ? governmentRep > 70
      ? 1 + (governmentRep - 70) / 200  // up to +15% at 100
      : governmentRep < 30
      ? 0.95 - (30 - governmentRep) / 400 // down to -12% at 0
      : 1.0
    : 1.0;

  const variance = 1 + rand(-industry.volatility, industry.volatility) * 0.5;

  const revenue =
    industry.baseMonthlyRevenue *
    fit *
    brandMult *
    qualityMult *
    staffMult *
    econMult *
    govMult *
    variance;

  // Labor regulation now 0..100 scale. Automation reduces effective exposure.
  // Law firms have very high labor exposure — cost structure is ~70% labor vs. 55% default
  const laborShare = isLaw ? 0.7 : 0.55;
  const laborExposure = Math.max(0, politics.laborRegulation - automationReduction) / 100;
  const laborCost = industry.baseMonthlyCost * laborShare * city.laborIndex * (1 + laborExposure * 0.25);
  const rentCost = industry.baseMonthlyCost * (isLaw ? 0.15 : 0.2) * city.rentIndex;
  const otherCost = industry.baseMonthlyCost * (isLaw ? 0.15 : 0.25) * (1 + economy.inflation);

  const costs = laborCost + rentCost + otherCost;
  const grossProfit = revenue - costs;
  const afterTax = grossProfit * (1 - politics.corporateTax);

  return { revenue: Math.round(revenue), profit: Math.round(afterTax) };
}

export function computeCompanyFinances(
  company: Company,
  economy: EconomyState,
  politics: PoliticsState,
  automationReduction: number = 0,
  governmentRep: number = 50
): { revenue: number; profit: number; updatedLocations: Location[] } {
  let revenue = 0;
  let profit = 0;
  const updatedLocations = company.locations.map((loc) => {
    const { revenue: r, profit: p } = computeLocationFinances(
      loc,
      company,
      economy,
      politics,
      automationReduction,
      governmentRep
    );
    revenue += r;
    profit += p;
    return { ...loc, monthlyRevenue: r, monthlyProfit: p };
  });
  // Management strain: profit dampening when locations exceed capacity
  const capacity = 3 + Math.floor(company.brandStrength / 20);
  if (company.locations.length > capacity) {
    const strain = (company.locations.length - capacity) * 0.08;
    profit = Math.round(profit * (1 - Math.min(strain, 0.5)));
  }
  return { revenue, profit, updatedLocations };
}

// ------- Economy evolution -------
export function evolveEconomy(current: EconomyState): EconomyState {
  let { gdpGrowth, interestRate, inflation, consumerConfidence, phase } = current;

  // Random walk
  gdpGrowth = clamp(gdpGrowth + rand(-0.008, 0.008), -0.04, 0.05);
  inflation = clamp(inflation + rand(-0.003, 0.003), 0, 0.12);
  interestRate = clamp(interestRate + rand(-0.004, 0.004), 0.01, 0.15);
  consumerConfidence = clamp(consumerConfidence + rand(-4, 4), 10, 95);

  // Phase transitions
  if (gdpGrowth > 0.02 && consumerConfidence > 60) phase = "expansion";
  else if (gdpGrowth > 0.035) phase = "peak";
  else if (gdpGrowth < -0.01) phase = "recession";
  else if (gdpGrowth >= -0.01 && gdpGrowth <= 0.015 && phase === "recession") phase = "recovery";

  return { gdpGrowth, interestRate, inflation, consumerConfidence, phase };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ------- Events -------
export function maybeRollEvent(month: number): GameEvent | null {
  // 55% chance per month of an event
  if (!chance(0.55)) return null;
  const eligible = EVENT_TEMPLATES.filter((t) => (t.minMonth ?? 0) <= month);
  if (eligible.length === 0) return null;
  const total = eligible.reduce((s, t) => s + t.weight, 0);
  let roll = Math.random() * total;
  for (const t of eligible) {
    roll -= t.weight;
    if (roll <= 0) return t.build(month);
  }
  return eligible[0].build(month);
}

// ------- Monthly turn -------
export interface AdvanceResult {
  state: GameState;
  report: MonthlyReport;
  newEvent: GameEvent | null;
  newRivalMoves: RivalMove[];
}

export function advanceMonth(state: GameState): AdvanceResult {
  const nextMonth = state.month + 1;

  // Evolve economy
  const economy = evolveEconomy(state.economy);

  // Evolve regulatory climate and resolve active lobbying
  const { politics: evolvedPolitics, newExternalAction } = evolveClimate(state);
  const {
    updatedCampaigns,
    politicsDelta,
    cashDelta: lobbyingCashDelta,
    newActions: lobbyingActions,
  } = resolveLobbying(state, nextMonth);

  // Merge any successful lobbying effects into politics
  const politics: PoliticsState = {
    ...evolvedPolitics,
    corporateTax: clamp(
      evolvedPolitics.corporateTax + (politicsDelta.corporateTax ?? 0),
      0.12,
      0.4
    ),
    laborRegulation: clamp(
      evolvedPolitics.laborRegulation + (politicsDelta.laborRegulation ?? 0),
      0,
      100
    ),
    antitrustPressure: clamp(
      evolvedPolitics.antitrustPressure + (politicsDelta.antitrustPressure ?? 0),
      0,
      100
    ),
  };

  // Recompute company finances (each industry may have automation offsetting labor regulation)
  let totalRevenue = 0;
  let totalProfit = 0;

  // Pre-compute rent savings per company from occupied real estate
  const rentSavingsByCompany = new Map<string, number>();
  for (const p of state.properties) {
    if (p.usage.kind === "occupied") {
      rentSavingsByCompany.set(
        p.usage.companyId,
        (rentSavingsByCompany.get(p.usage.companyId) ?? 0) + p.usage.rentSaved
      );
    }
  }

  const companies: Company[] = state.companies.map((c) => {
    const automationReduction = industryLaborReduction(state, c.industry);
    const { revenue, profit, updatedLocations } = computeCompanyFinances(
      c,
      economy,
      politics,
      automationReduction,
      state.stakeholders.government
    );
    const rentSaved = rentSavingsByCompany.get(c.id) ?? 0;

    // Operations overhead: staff salary delta + marketing spend
    const overhead = companyOpsOverhead(c.staffTier, c.marketingSpend);
    const adjustedProfit = profit + rentSaved - overhead;
    totalRevenue += revenue;
    totalProfit += adjustedProfit;

    // Brand: marketing spend drives growth; absent that, brand decays
    const marketingGain = marketingBrandGain(c.marketingSpend);
    const brandDelta = marketingGain - BRAND_DECAY_PER_MONTH + (revenue > 0 ? 0.1 : -0.3);
    const repDelta = marketingReputationGain(c.marketingSpend) + (adjustedProfit > 0 ? 0.15 : -0.3);

    // Morale is capped by staff tier
    const staffCap = STAFF_TIERS[c.staffTier].moraleCap;
    const moraleDrift = adjustedProfit > 0 ? 0.3 : -0.5;
    const newMorale = Math.min(staffCap, clamp(c.morale + moraleDrift, 0, 100));

    return {
      ...c,
      locations: updatedLocations,
      brandStrength: clamp(c.brandStrength + brandDelta, 0, 100),
      morale: newMorale,
      reputation: clamp(c.reputation + repDelta, 0, 100),
    };
  });

  // ---- Real estate: appreciate, compute net cash flow ----
  const appreciatedProperties: Property[] = state.properties.map(appreciateProperty);
  const reCashFlow = totalRealEstateCashDelta(appreciatedProperties);

  // Debt interest: unsecured + secured
  const interestCost = Math.round(state.debt * (state.economy.interestRate / 12));
  const securedInterest = Math.round(state.securedDebt * (SECURED_RATE_ANNUAL / 12));
  const cashDelta =
    totalProfit - interestCost - securedInterest + lobbyingCashDelta + reCashFlow.net;
  const cash = Math.round(state.cash + cashDelta);

  // Founder fatigue
  const energyDrift = clamp(
    state.founder.energy + (companies.length > 3 ? -2 : 1),
    0,
    100
  );
  const stressDrift = clamp(
    state.founder.stress + (companies.length > 3 ? 2 : -1) + (totalProfit < 0 ? 4 : -1),
    0,
    100
  );
  // Aged founder (age advances on year boundaries)
  const agedFounder = ageFounder(
    { ...state.founder, energy: energyDrift, stress: stressDrift },
    nextMonth
  );
  // Health drift — based on age, stress, and company load
  const founder = driftFounderHealth(agedFounder, companies.length);

  // ---- Phase 3.1 Dynasty: age heirs, maybe spawn a new one, refresh doctor's note ----
  const intermediateStateForDynasty: GameState = { ...state, founder, month: nextMonth };
  let heirs: Heir[] = ageHeirs(intermediateStateForDynasty);
  if (shouldHaveChild(intermediateStateForDynasty)) {
    heirs = [...heirs, generateHeir(founder, heirs, nextMonth)];
  }
  // Auto-maintain successionOrder: newly adult heirs get appended; removed heirs get filtered
  const heirIds = new Set(heirs.map((h) => h.id));
  const prevOrder = state.successionOrder.filter((id) => heirIds.has(id));
  const newAdultIds = heirs
    .filter((h) => h.status !== "child" && !prevOrder.includes(h.id))
    .map((h) => h.id);
  const successionOrder = [...prevOrder, ...newAdultIds];

  const founderDoctorsNote = refreshDoctorsNote(founder, companies.length);

  // Legacy score accumulation
  const legacyScore = Math.round(
    cash / 1000 +
      companies.reduce((s, c) => s + c.brandStrength + c.reputation + c.locations.length * 10, 0) +
      companies.length * 40
  );

  // Event roll
  const newEvent = maybeRollEvent(nextMonth);
  const events = newEvent ? [...state.events, newEvent] : state.events;

  const report: MonthlyReport = {
    month: nextMonth,
    revenue: totalRevenue,
    costs: totalRevenue - totalProfit,
    profit: totalProfit,
    cashDelta,
    cashEnd: cash,
    headline:
      totalProfit > 0
        ? `Month ${nextMonth}: Profitable — ${formatMoney(totalProfit)} in the black.`
        : `Month ${nextMonth}: Loss — ${formatMoney(-totalProfit)} drained.`,
  };

  // Evolve stakeholder reputation based on this month's performance
  const stakeholders = evolveStakeholders(
    { ...state, companies } as GameState,
    totalProfit
  );

  // Collect all new political actions (lobbying resolutions + external events)
  const newPoliticalActions: PoliticalAction[] = [...lobbyingActions];
  if (newExternalAction) newPoliticalActions.push(newExternalAction);

  // ---- Real estate: refresh marketplace listings ----
  const refreshedListings = refreshListings(state, nextMonth);

  // ---- Rival turn ----
  // Build an intermediate state so rival moves can reference updated companies/cash/month
  const intermediateState: GameState = {
    ...state,
    month: nextMonth,
    economy,
    politics,
    companies,
    founder,
    heirs,
    successionOrder,
    founderDoctorsNote,
    cash,
    legacyScore,
    events,
    stakeholders,
    lobbyingCampaigns: updatedCampaigns,
    politicalActions: [...(state.politicalActions ?? []), ...newPoliticalActions].slice(-80),
    properties: appreciatedProperties,
    propertyListings: refreshedListings,
    monthlyReports: [...state.monthlyReports, report].slice(-48),
  };

  const newRivalMoves = rollRivalMoves(intermediateState);
  const stateAfterRivals = applyMoveEffects(intermediateState, newRivalMoves);
  const newThreats = generateThreats(stateAfterRivals);

  // Phase 3.3 — rival defeat detection. Rivals whose cash goes deeply negative
  // or whose market share collapses are archived to rivalsDefeated, removed
  // from the active roster, and get a narrative feed entry.
  const defeatResult = detectDefeats(stateAfterRivals, nextMonth);

  // Phase 3.2 — succession roll. Each monthly tick, check if founder dies.
  // We only roll if there isn't already a pending succession, and dynasty hasn't ended.
  const pendingFromRoll = rollSuddenDeath(stateAfterRivals, Math.random());

  // Phase 3.3 — legacy tracking. Keep running totals of the dynasty's
  // breadth and peak across time; these feed into the final Legacy Score.
  const propertyValue = appreciatedProperties.reduce((s, p) => s + p.currentValue, 0);
  const currentNetWorth = cash + propertyValue - state.debt - state.securedDebt;
  const peakNetWorth = Math.max(state.peakNetWorth ?? 0, currentNetWorth);

  const industriesSet = new Set(state.industriesEntered ?? []);
  for (const c of companies) industriesSet.add(c.industry);
  const industriesEntered = Array.from(industriesSet);

  const citiesSet = new Set(state.citiesEntered ?? []);
  for (const c of companies) for (const l of c.locations) citiesSet.add(l.cityId);
  const citiesEntered = Array.from(citiesSet);

  const allRivalMoves = [
    ...(state.rivalMoves ?? []),
    ...newRivalMoves,
    ...defeatResult.defeatMoves,
  ].slice(-60);

  return {
    state: {
      ...stateAfterRivals,
      rivals: defeatResult.survivingRivals,
      rivalsDefeated: [...state.rivalsDefeated, ...defeatResult.defeatedIds],
      rivalMoves: allRivalMoves,
      rivalThreats: newThreats,
      pendingSuccession: pendingFromRoll ?? stateAfterRivals.pendingSuccession ?? null,
      peakNetWorth,
      industriesEntered,
      citiesEntered,
    },
    report,
    newEvent,
    newRivalMoves: [...newRivalMoves, ...defeatResult.defeatMoves],
  };
}

export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatDate(month: number, startYear: number): string {
  const y = startYear + Math.floor(month / 12);
  const m = month % 12;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m]} ${y}`;
}

// ============================================================
// Day-scale helpers (Phase 4.1)
// ============================================================
// The engine continues to compute month-level economics; day-scale is
// presentation-layer. 30 days = 1 month. Day counter persists across
// months so "Day 117" means 117 days since founding.

export const DAYS_PER_MONTH = 30;

// Total days elapsed since founding (month * 30 + day-in-month)
export function totalDays(month: number, dayInMonth: number): number {
  return month * DAYS_PER_MONTH + dayInMonth;
}

// Get the weekday (0..6, where 0=Monday) for a given day-in-month.
// We align so day 1 of founding is Monday.
export function weekdayIndex(dayInMonth: number, month: number): number {
  return (month * DAYS_PER_MONTH + dayInMonth) % 7;
}

// Day-scale formatters
export function formatDailyMoney(monthlyAmount: number): number {
  return Math.round(monthlyAmount / DAYS_PER_MONTH);
}

export function formatDateWithDay(
  month: number,
  dayInMonth: number,
  startYear: number
): string {
  const y = startYear + Math.floor(month / 12);
  const m = month % 12;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m]} ${dayInMonth}, ${y}`;
}

