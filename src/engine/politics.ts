import type {
  AutomationInvestment,
  GameState,
  HeadquartersLocation,
  LobbyingCampaign,
  PoliticalAction,
  PoliticsState,
  StakeholderReputation,
} from "@/types";
import {
  AUTOMATION_OPTIONS,
  DONATION_OPTIONS,
  LOBBYING_TEMPLATES,
  RELOCATION_OPTIONS,
} from "@/data/politics";

function uid(): string { return Math.random().toString(36).slice(2, 10); }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function chance(p: number): boolean { return Math.random() < p; }

// ---------- Climate evolution ----------
// Each month, regulatory levers drift slightly. Direction depends on rival political reach
// and random external events. This runs on every advanceMonth.
export function evolveClimate(state: GameState): {
  politics: PoliticsState;
  newExternalAction: PoliticalAction | null;
} {
  let { corporateTax, laborRegulation, antitrustPressure, climatePhase } = state.politics;

  // Baseline drift: labor and antitrust trend up slightly over time unless actively fought
  const laborDrift = (Math.random() - 0.4) * 1.2;       // slight upward bias
  const antitrustDrift = (Math.random() - 0.5) * 0.8;
  const taxDrift = (Math.random() - 0.5) * 0.004;       // very slow tax drift

  laborRegulation = clamp(laborRegulation + laborDrift, 0, 100);
  antitrustPressure = clamp(antitrustPressure + antitrustDrift, 0, 100);
  corporateTax = clamp(corporateTax + taxDrift, 0.12, 0.4);

  // Determine phase
  if (laborDrift > 0.5 || antitrustDrift > 0.3) climatePhase = "tightening";
  else if (laborDrift < -0.5 && antitrustDrift < -0.2) climatePhase = "loosening";
  else climatePhase = "stable";

  // Occasional external bill / ruling generates a PoliticalAction for the ledger
  let newExternalAction: PoliticalAction | null = null;
  if (chance(0.12)) {
    const externals = [
      {
        headline: "New labor protection bill introduced in state legislature",
        detail: "Raises minimum wage, mandates 4 weeks PTO. Expected passage probability: ~70%.",
      },
      {
        headline: "Federal antitrust enforcement priorities announced",
        detail: "Regulators signal tighter review of regional concentration in consumer-facing industries.",
      },
      {
        headline: "Supreme Court declines to hear small-business tax case",
        detail: "The status quo holds. Planning now easier for the next two years.",
      },
      {
        headline: "City council rezones commercial corridors",
        detail: "Permit speed improves in three of your cities. Retail leases get marginally more competitive.",
      },
    ];
    const pick = externals[Math.floor(Math.random() * externals.length)];
    newExternalAction = {
      id: uid(),
      month: state.month + 1,
      kind: "external_bill",
      headline: pick.headline,
      detail: pick.detail,
      tone: "external",
    };
  }

  return {
    politics: { corporateTax, laborRegulation, antitrustPressure, climatePhase },
    newExternalAction,
  };
}

// ---------- Lobbying resolution ----------
// Each month, check active campaigns. If a campaign's expiresMonth == nextMonth, resolve it.
// Costs are applied per month regardless.
export function resolveLobbying(
  state: GameState,
  nextMonth: number
): {
  updatedCampaigns: LobbyingCampaign[];
  politicsDelta: Partial<PoliticsState>;
  cashDelta: number;
  newActions: PoliticalAction[];
} {
  const updatedCampaigns: LobbyingCampaign[] = [];
  const newActions: PoliticalAction[] = [];
  const politicsDelta: Partial<PoliticsState> = {};
  let cashDelta = 0;

  for (const c of state.lobbyingCampaigns) {
    if (c.status !== "active") {
      updatedCampaigns.push(c);
      continue;
    }

    // Deduct monthly cost for every active campaign
    cashDelta -= c.monthlyCost;

    // Resolve if expired
    if (nextMonth >= c.expiresMonth) {
      const succeeded = chance(c.odds);
      const resolved: LobbyingCampaign = { ...c, status: succeeded ? "succeeded" : "failed" };
      updatedCampaigns.push(resolved);

      if (succeeded) {
        if (c.target === "labor") {
          politicsDelta.laborRegulation =
            (politicsDelta.laborRegulation ?? 0) + c.targetChange;
        } else if (c.target === "tax") {
          politicsDelta.corporateTax =
            (politicsDelta.corporateTax ?? 0) + c.targetChange;
        } else if (c.target === "antitrust") {
          politicsDelta.antitrustPressure =
            (politicsDelta.antitrustPressure ?? 0) + c.targetChange;
        }
      }

      newActions.push({
        id: uid(),
        month: nextMonth,
        kind: "lobby_resolved",
        headline: succeeded
          ? `Lobbying effort succeeded: ${c.title}`
          : `Lobbying effort failed: ${c.title}`,
        detail: succeeded
          ? `The firm delivered. ${describeTargetChange(c)}.`
          : `The vote didn't go our way. The firm's final report is on your desk.`,
        tone: succeeded ? "win" : "loss",
      });
    } else {
      updatedCampaigns.push(c);
    }
  }

  return { updatedCampaigns, politicsDelta, cashDelta, newActions };
}

function describeTargetChange(c: LobbyingCampaign): string {
  if (c.target === "labor") return `Labor regulation reduced by ${Math.abs(c.targetChange)} points`;
  if (c.target === "tax") return `Corporate tax reduced by ${(Math.abs(c.targetChange) * 100).toFixed(1)}%`;
  if (c.target === "antitrust") return `Antitrust pressure reduced by ${Math.abs(c.targetChange)} points`;
  return `Permit speed improved by ${Math.abs(c.targetChange)} points`;
}

// ---------- Stakeholder drift ----------
// Each month, stakeholders slowly regress to the mean based on their own dynamics.
// Also: company profit affects investors, layoffs affect employees, etc.
export function evolveStakeholders(
  state: GameState,
  totalProfit: number
): StakeholderReputation {
  const s = { ...state.stakeholders };

  // Profit affects investors
  if (totalProfit > 10_000) s.investors = clamp(s.investors + 0.6, 0, 100);
  else if (totalProfit < 0) s.investors = clamp(s.investors - 0.8, 0, 100);

  // Morale proxy for employees
  const avgMorale = state.companies.length > 0
    ? state.companies.reduce((sum, c) => sum + c.morale, 0) / state.companies.length
    : 50;
  const moraleDrift = (avgMorale - s.employees) * 0.04;
  s.employees = clamp(s.employees + moraleDrift, 0, 100);

  // Customers drift toward average reputation
  const avgRep = state.companies.length > 0
    ? state.companies.reduce((sum, c) => sum + c.reputation, 0) / state.companies.length
    : 50;
  const repDrift = (avgRep - s.customers) * 0.03;
  s.customers = clamp(s.customers + repDrift, 0, 100);

  // All stakeholders drift slightly toward 50 (reversion to mean)
  for (const key of Object.keys(s) as (keyof StakeholderReputation)[]) {
    s[key] = clamp(s[key] + (50 - s[key]) * 0.01, 0, 100);
  }

  return s;
}

// ---------- Action helpers (called from the store) ----------
export function applyDonation(state: GameState, optionId: string): {
  newState: Partial<GameState>;
  action: PoliticalAction;
} | null {
  const option = DONATION_OPTIONS.find((o) => o.id === optionId);
  if (!option) return null;
  if (state.cash < option.amount) return null;

  const s = { ...state.stakeholders };
  const p = { ...state.politics };
  const e = option.effects;

  if (e.antitrustDelta) p.antitrustPressure = clamp(p.antitrustPressure + e.antitrustDelta, 0, 100);
  if (e.laborDelta) p.laborRegulation = clamp(p.laborRegulation + e.laborDelta, 0, 100);
  if (e.governmentDelta) s.government = clamp(s.government + e.governmentDelta, 0, 100);
  if (e.publicImageDelta) s.publicImage = clamp(s.publicImage + e.publicImageDelta, 0, 100);
  if (e.pressDelta) s.press = clamp(s.press + e.pressDelta, 0, 100);
  if (e.employeesDelta) s.employees = clamp(s.employees + e.employeesDelta, 0, 100);
  if (e.customersDelta) s.customers = clamp(s.customers + e.customersDelta, 0, 100);

  return {
    newState: {
      cash: state.cash - option.amount,
      stakeholders: s,
      politics: p,
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "donation",
      headline: `Donated $${(option.amount / 1000).toFixed(0)}K to ${option.title}`,
      detail: option.description,
      tone: "spend",
      amountDelta: -option.amount,
    },
  };
}

export function startLobbyingCampaign(state: GameState, templateId: string): {
  newState: Partial<GameState>;
  action: PoliticalAction;
} | null {
  const template = LOBBYING_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return null;

  const campaign: LobbyingCampaign = {
    id: uid(),
    startedMonth: state.month,
    expiresMonth: state.month + template.monthsToResolve,
    monthlyCost: template.monthlyCost,
    target: template.target,
    targetChange: template.targetChange,
    odds: template.odds,
    title: template.title,
    detail: template.detail,
    status: "active",
  };

  return {
    newState: {
      lobbyingCampaigns: [...state.lobbyingCampaigns, campaign],
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "lobby_start",
      headline: `Engaged lobbying firm: ${template.title}`,
      detail: `Monthly cost $${(template.monthlyCost / 1000).toFixed(0)}K. Odds of success: ${Math.round(template.odds * 100)}%.`,
      tone: "spend",
    },
  };
}

export function cancelLobbyingCampaign(state: GameState, campaignId: string): {
  newState: Partial<GameState>;
  action: PoliticalAction;
} | null {
  const campaign = state.lobbyingCampaigns.find((c) => c.id === campaignId);
  if (!campaign || campaign.status !== "active") return null;

  return {
    newState: {
      lobbyingCampaigns: state.lobbyingCampaigns.map((c) =>
        c.id === campaignId ? { ...c, status: "failed" as const } : c
      ),
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "lobby_cancel",
      headline: `Canceled retainer: ${campaign.title}`,
      detail: "The firm was notified. The campaign is wound down.",
      tone: "neutral",
    },
  };
}

export function applyRelocation(state: GameState, targetCityId: string): {
  newState: Partial<GameState>;
  action: PoliticalAction;
} | null {
  const option = RELOCATION_OPTIONS.find((o) => o.cityId === targetCityId);
  if (!option) return null;
  if (state.cash < option.cost) return null;
  if (state.headquarters.cityId === targetCityId) return null;

  const p = { ...state.politics };
  p.corporateTax = clamp(p.corporateTax + option.effects.corporateTaxDelta, 0.12, 0.4);
  p.laborRegulation = clamp(p.laborRegulation + option.effects.laborRegDelta, 0, 100);

  const s = { ...state.stakeholders };
  s.employees = clamp(s.employees + option.effects.moraleDelta, 0, 100);

  const companies = state.companies.map((c) => ({
    ...c,
    morale: clamp(c.morale + option.effects.moraleDelta, 0, 100),
    brandStrength: clamp(c.brandStrength + (option.effects.brandDelta ?? 0), 0, 100),
  }));

  const hq: HeadquartersLocation = {
    cityId: targetCityId,
    relocatedMonth: state.month,
  };

  return {
    newState: {
      cash: state.cash - option.cost,
      politics: p,
      stakeholders: s,
      companies,
      headquarters: hq,
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "relocation",
      headline: `Relocated headquarters to ${option.cityLabel}`,
      detail: `Cost: $${(option.cost / 1000).toFixed(0)}K. Employee morale took a hit. Tax and labor pressure down.`,
      tone: "spend",
      amountDelta: -option.cost,
    },
  };
}

export function applyAutomation(state: GameState, optionId: string): {
  newState: Partial<GameState>;
  action: PoliticalAction;
} | null {
  const option = AUTOMATION_OPTIONS.find((o) => o.id === optionId);
  if (!option) return null;
  if (state.cash < option.cost) return null;

  // Only apply if player has a company in that industry
  const targetCompany = state.companies.find((c) => c.industry === option.industry);
  if (!targetCompany) return null;

  const investment: AutomationInvestment = {
    id: uid(),
    installedMonth: state.month,
    industry: option.industry,
    laborExposureReduction: option.laborExposureReduction,
    label: option.title,
  };

  const s = { ...state.stakeholders };
  s.employees = clamp(s.employees + option.moraleDelta, 0, 100);
  s.publicImage = clamp(s.publicImage + option.moraleDelta * 0.5, 0, 100);

  const companies = state.companies.map((c) =>
    c.id === targetCompany.id
      ? { ...c, morale: clamp(c.morale + option.moraleDelta, 0, 100) }
      : c
  );

  return {
    newState: {
      cash: state.cash - option.cost,
      stakeholders: s,
      companies,
      automationInvestments: [...state.automationInvestments, investment],
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "automation",
      headline: `Invested in automation: ${option.title}`,
      detail: `Labor exposure in ${option.industry} reduced by ${option.laborExposureReduction} points. Morale took a hit.`,
      tone: "spend",
      amountDelta: -option.cost,
    },
  };
}

// ---------- Total automation reduction ----------
// Sum of laborExposureReduction across installed automation for a given industry.
export function industryLaborReduction(state: GameState, industry: string): number {
  return state.automationInvestments
    .filter((a) => a.industry === industry)
    .reduce((sum, a) => sum + a.laborExposureReduction, 0);
}
