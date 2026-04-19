import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  BackgroundId,
  Company,
  EventChoice,
  GameState,
  Location,
} from "@/types";
import { BACKGROUND_MAP } from "@/data/backgrounds";
import { INDUSTRIES } from "@/data/industries";
import { CITIES } from "@/data/cities";
import { SEED_RIVALS } from "@/data/rivals";
import { DEFAULT_STAKEHOLDERS } from "@/data/politics";
import { pickStreetDetail } from "@/data/operations";
import {
  applyAutomation,
  applyDonation,
  applyRelocation,
  cancelLobbyingCampaign,
  startLobbyingCampaign,
} from "@/engine/politics";
import {
  applyLocationUpgrade,
  applyMarketingSpend,
  applyStaffTierChange,
} from "@/engine/operations";
import {
  applyBorrowSecured,
  applyDevelop,
  applyHostEvent,
  applyLeaseOut,
  applyOccupy,
  applyPurchase,
  applyRepaySecured,
  applySale,
  bestCompanyForProperty,
  refreshListings,
} from "@/engine/realEstate";
import {
  investMentorship,
  investPublicRole,
  investTutoring,
  reorderSuccession,
} from "@/engine/dynasty";
import { advanceMonth, formatMoney } from "@/engine/simulation";
import { executeSuccession, initiateStepDown } from "@/engine/succession";

interface StoreActions {
  createFounder: (input: {
    name: string;
    age: number;
    background: BackgroundId;
    traits: string[];
    startingCity: string;
    startingIndustry: string;
    companyName: string;
  }) => void;
  advance: () => { headline: string; newEventId: string | null };
  advanceDay: () => { headline: string | null; newEventId: string | null; isNewMonth: boolean };
  resolveEvent: (eventId: string, choice: EventChoice) => void;
  openLocation: (companyId: string, cityId: string) => { ok: boolean; message: string };
  takeLoan: (amount: number) => void;
  repayDebt: (amount: number) => void;
  startNewCompany: (industryId: string, name: string, cityId: string) => { ok: boolean; message: string };
  // Phase 2.2 — Politics actions
  donate: (optionId: string) => { ok: boolean; message: string };
  startLobbying: (templateId: string) => { ok: boolean; message: string };
  cancelLobbying: (campaignId: string) => { ok: boolean; message: string };
  relocate: (targetCityId: string) => { ok: boolean; message: string };
  automate: (optionId: string) => { ok: boolean; message: string };
  // Phase 2.3 — Real Estate actions
  purchaseProperty: (listingId: string) => { ok: boolean; message: string };
  sellProperty: (propertyId: string) => { ok: boolean; message: string };
  leaseOut: (propertyId: string) => { ok: boolean; message: string };
  occupyProperty: (propertyId: string) => { ok: boolean; message: string };
  developProperty: (propertyId: string) => { ok: boolean; message: string };
  borrowSecured: (amount: number) => { ok: boolean; message: string };
  repaySecured: (amount: number) => { ok: boolean; message: string };
  hostEvent: (propertyId: string) => { ok: boolean; message: string };
  // Phase 2.4 — Operations actions
  setStaffTier: (companyId: string, tier: 1 | 2 | 3 | 4) => { ok: boolean; message: string };
  setMarketingSpend: (companyId: string, amount: number) => { ok: boolean; message: string };
  upgradeLocation: (companyId: string, locationId: string) => { ok: boolean; message: string };
  // Phase 3.1 — Dynasty actions
  tutorHeir: (heirId: string) => { ok: boolean; message: string };
  mentorHeir: (heirId: string) => { ok: boolean; message: string };
  publicizeHeir: (heirId: string) => { ok: boolean; message: string };
  reorderSuccession: (fromIndex: number, toIndex: number) => { ok: boolean; message: string };
  // Phase 3.2 — Succession
  requestStepDown: () => { ok: boolean; message: string };
  acknowledgeSuccession: () => { ok: boolean; message: string };
  // Phase 3.3 — Explicit dynasty end (surfaces the eulogy screen)
  endDynasty: () => void;
  reset: () => void;
  lastReportHeadline: string;
}

type Store = GameState & StoreActions;

const initialState: GameState = {
  started: false,
  month: 0,
  dayInMonth: 0,
  startYear: 2025,
  founder: {
    name: "",
    age: 28,
    background: "developer",
    traits: [],
    energy: 85,
    stress: 20,
    health: 90,
  },
  heirs: [],
  cash: 0,
  debt: 0,
  legacyScore: 0,
  companies: [],
  rivals: SEED_RIVALS,
  rivalMoves: [],
  rivalThreats: [],
  economy: {
    gdpGrowth: 0.022,
    interestRate: 0.05,
    inflation: 0.028,
    consumerConfidence: 62,
    phase: "expansion",
  },
  politics: {
    corporateTax: 0.21,
    laborRegulation: 40,       // 0..100 scale now
    antitrustPressure: 20,
    climatePhase: "stable",
  },
  stakeholders: DEFAULT_STAKEHOLDERS,
  lobbyingCampaigns: [],
  automationInvestments: [],
  politicalActions: [],
  headquarters: { cityId: "austin", relocatedMonth: null },
  properties: [],
  propertyListings: [],
  realEstateActions: [],
  securedDebt: 0,
  successionOrder: [],
  dynastyEnded: false,
  founderDoctorsNote: "",
  generation: 1,
  pendingSuccession: null,
  dynastyHistory: [],
  defectedHeirs: [],
  peakNetWorth: 0,
  rivalsDefeated: [],
  industriesEntered: [],
  citiesEntered: [],
  events: [],
  monthlyReports: [],
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useGame = create<Store>()(
  persist(
    (set, get) => ({
      ...initialState,
      lastReportHeadline: "",

      createFounder: (input) => {
        const bg = BACKGROUND_MAP[input.background];
        const industry = INDUSTRIES[input.startingIndustry];
        if (!bg || !industry) return;

        const firstLocation: Location = {
          id: uid(),
          cityId: input.startingCity,
          industry: industry.id,
          qualityTier: 1,
          openedMonth: 0,
          monthlyRevenue: 0,
          monthlyProfit: 0,
          streetDetail: pickStreetDetail(input.startingCity),
        };

        const firstCompany: Company = {
          id: uid(),
          name: input.companyName,
          industry: industry.id,
          locations: [firstLocation],
          foundedMonth: 0,
          brandStrength: 18,
          morale: 55,         // Start below Tier 1 Lean cap of 60 so upgrading feels meaningful
          reputation: 30,
          founderOwnership: 1.0,
          investorOwnership: 0,
          cashInvested: industry.startingCost,
          staffTier: 1,
          marketingSpend: 0,
        };

        // Seed initial marketplace listings so the Real Estate page isn't empty
        const seededState = { ...initialState, month: 0 } as GameState;
        const initialListings = refreshListings(seededState, 0);

        set({
          ...initialState,
          started: true,
          founder: {
            name: input.name,
            age: input.age,
            background: input.background,
            traits: input.traits,
            energy: 85,
            stress: 20,
            health: 90,
          },
          companies: [firstCompany],
          cash: bg.startingCash - industry.startingCost,
          headquarters: { cityId: input.startingCity, relocatedMonth: null },
          propertyListings: initialListings,
          industriesEntered: [industry.id],
          citiesEntered: [input.startingCity],
          peakNetWorth: bg.startingCash - industry.startingCost,
          founderDoctorsNote: `${input.name.split(" ")[0]} is in the prime years. Body keeping up, mind sharper than ever.`,
          lastReportHeadline: `${input.name} founded ${input.companyName} in ${input.startingCity.toUpperCase()}.`,
        });
      },

      advance: () => {
        const state = get();
        const { state: next, report, newEvent } = advanceMonth(state);
        set({ ...next, dayInMonth: 0, lastReportHeadline: report.headline });
        return { headline: report.headline, newEventId: newEvent?.id ?? null };
      },

      advanceDay: () => {
        const state = get();
        // Every 30th day triggers a real monthly advance
        if (state.dayInMonth >= 29) {
          const { state: next, report, newEvent } = advanceMonth(state);
          set({ ...next, dayInMonth: 0, lastReportHeadline: report.headline });
          return {
            headline: report.headline,
            newEventId: newEvent?.id ?? null,
            isNewMonth: true,
          };
        }
        // Otherwise just increment the day counter
        set({ dayInMonth: state.dayInMonth + 1 });
        return { headline: null, newEventId: null, isNewMonth: false };
      },

      resolveEvent: (eventId, choice) => {
        const state = get();
        const events = state.events.map((e) =>
          e.id === eventId ? { ...e, resolved: true } : e
        );
        const effect = choice.effect;
        const cash = state.cash + (effect.cash ?? 0);
        const companies = state.companies.map((c, i) =>
          i === 0
            ? {
                ...c,
                brandStrength: clamp(c.brandStrength + (effect.brand ?? 0), 0, 100),
                reputation: clamp(c.reputation + (effect.reputation ?? 0), 0, 100),
                morale: clamp(c.morale + (effect.morale ?? 0), 0, 100),
              }
            : c
        );
        const founder = {
          ...state.founder,
          stress: clamp(state.founder.stress + (effect.stress ?? 0), 0, 100),
        };
        set({
          events,
          cash,
          companies,
          founder,
          lastReportHeadline: choice.resultText,
        });
      },

      openLocation: (companyId, cityId) => {
        const state = get();
        const company = state.companies.find((c) => c.id === companyId);
        if (!company) return { ok: false, message: "No such company." };
        const industry = INDUSTRIES[company.industry];
        const cost = Math.round(industry.startingCost * 0.7);
        if (state.cash < cost) {
          return { ok: false, message: `Need ${formatMoney(cost)} to open a new location.` };
        }
        const loc: Location = {
          id: uid(),
          cityId,
          industry: company.industry,
          qualityTier: 1,
          openedMonth: state.month,
          monthlyRevenue: 0,
          monthlyProfit: 0,
          streetDetail: pickStreetDetail(cityId),
        };
        set({
          cash: state.cash - cost,
          companies: state.companies.map((c) =>
            c.id === companyId ? { ...c, locations: [...c.locations, loc] } : c
          ),
          lastReportHeadline: `New ${industry.name} location opened in ${CITIES.find((x) => x.id === cityId)?.name ?? cityId}.`,
        });
        return { ok: true, message: `Opened for ${formatMoney(cost)}.` };
      },

      takeLoan: (amount) => {
        const s = get();
        set({ cash: s.cash + amount, debt: s.debt + amount });
      },

      repayDebt: (amount) => {
        const s = get();
        const pay = Math.min(amount, s.debt, s.cash);
        set({ cash: s.cash - pay, debt: s.debt - pay });
      },

      startNewCompany: (industryId, name, cityId) => {
        const s = get();
        const industry = INDUSTRIES[industryId];
        if (!industry) return { ok: false, message: "Unknown industry." };
        if (s.cash < industry.startingCost) {
          return {
            ok: false,
            message: `Need ${formatMoney(industry.startingCost)} to launch.`,
          };
        }
        const loc: Location = {
          id: uid(),
          cityId,
          industry: industry.id,
          qualityTier: 1,
          openedMonth: s.month,
          monthlyRevenue: 0,
          monthlyProfit: 0,
          streetDetail: pickStreetDetail(cityId),
        };
        const company: Company = {
          id: uid(),
          name,
          industry: industry.id,
          locations: [loc],
          foundedMonth: s.month,
          brandStrength: 15,
          morale: 55,
          reputation: 25,
          founderOwnership: 1.0,
          investorOwnership: 0,
          cashInvested: industry.startingCost,
          staffTier: 1,
          marketingSpend: 0,
        };
        set({
          cash: s.cash - industry.startingCost,
          companies: [...s.companies, company],
          lastReportHeadline: `${name} — a new ${industry.name.toLowerCase()} — is founded.`,
        });
        return { ok: true, message: `${name} is open for business.` };
      },

      // ---------- Phase 2.2 Politics actions ----------
      donate: (optionId) => {
        const s = get();
        const result = applyDonation(s, optionId);
        if (!result) return { ok: false, message: "Insufficient funds or invalid option." };
        set({
          ...result.newState,
          politicalActions: [...s.politicalActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      startLobbying: (templateId) => {
        const s = get();
        const result = startLobbyingCampaign(s, templateId);
        if (!result) return { ok: false, message: "Unknown campaign." };
        set({
          ...result.newState,
          politicalActions: [...s.politicalActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      cancelLobbying: (campaignId) => {
        const s = get();
        const result = cancelLobbyingCampaign(s, campaignId);
        if (!result) return { ok: false, message: "Campaign not active." };
        set({
          ...result.newState,
          politicalActions: [...s.politicalActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      relocate: (targetCityId) => {
        const s = get();
        const result = applyRelocation(s, targetCityId);
        if (!result) {
          return { ok: false, message: "Insufficient funds, same city, or invalid target." };
        }
        set({
          ...result.newState,
          politicalActions: [...s.politicalActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      automate: (optionId) => {
        const s = get();
        const result = applyAutomation(s, optionId);
        if (!result) {
          return {
            ok: false,
            message: "Insufficient funds or you don't operate in that industry.",
          };
        }
        set({
          ...result.newState,
          politicalActions: [...s.politicalActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      // ---------- Phase 2.3 Real Estate actions ----------
      purchaseProperty: (listingId) => {
        const s = get();
        const result = applyPurchase(s, listingId);
        if (!result) return { ok: false, message: "Insufficient funds or listing no longer available." };
        set({
          ...result.newState,
          realEstateActions: [...s.realEstateActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      sellProperty: (propertyId) => {
        const s = get();
        const result = applySale(s, propertyId);
        if (!result) return { ok: false, message: "Cannot sell — secured debt would exceed remaining collateral." };
        set({
          ...result.newState,
          realEstateActions: [...s.realEstateActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      leaseOut: (propertyId) => {
        const s = get();
        const result = applyLeaseOut(s, propertyId);
        if (!result) return { ok: false, message: "Cannot lease this property." };
        set({
          ...result.newState,
          realEstateActions: [...s.realEstateActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      occupyProperty: (propertyId) => {
        const s = get();
        const property = s.properties.find((p) => p.id === propertyId);
        if (!property) return { ok: false, message: "Property not found." };
        const companyId = bestCompanyForProperty(s, property);
        if (!companyId) return { ok: false, message: "No compatible company to occupy this property." };
        const result = applyOccupy(s, propertyId, companyId);
        if (!result) return { ok: false, message: "Occupation failed." };
        set({
          ...result.newState,
          realEstateActions: [...s.realEstateActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      developProperty: (propertyId) => {
        const s = get();
        const result = applyDevelop(s, propertyId);
        if (!result) return { ok: false, message: "Insufficient funds or nothing to develop." };
        set({
          ...result.newState,
          realEstateActions: [...s.realEstateActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      borrowSecured: (amount) => {
        const s = get();
        const result = applyBorrowSecured(s, amount);
        if (!result) return { ok: false, message: "Amount exceeds available secured credit." };
        set({
          ...result.newState,
          realEstateActions: [...s.realEstateActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      repaySecured: (amount) => {
        const s = get();
        const result = applyRepaySecured(s, amount);
        if (!result) return { ok: false, message: "Nothing to repay or insufficient cash." };
        set({
          ...result.newState,
          realEstateActions: [...s.realEstateActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      hostEvent: (propertyId) => {
        const s = get();
        const result = applyHostEvent(s, propertyId);
        if (!result) return { ok: false, message: "Not a prestige property or insufficient funds." };
        set({
          ...result.newState,
          realEstateActions: [...s.realEstateActions, result.action].slice(-80),
          lastReportHeadline: result.action.headline,
        });
        return { ok: true, message: result.action.headline };
      },

      // ---------- Phase 2.4 Operations actions ----------
      setStaffTier: (companyId, tier) => {
        const s = get();
        const result = applyStaffTierChange(s, companyId, tier);
        if (!result) return { ok: false, message: "Cannot change tier — check cash or location count requirement." };
        set({ ...result.newState, lastReportHeadline: result.message });
        return { ok: true, message: result.message };
      },

      setMarketingSpend: (companyId, amount) => {
        const s = get();
        const result = applyMarketingSpend(s, companyId, amount);
        if (!result) return { ok: false, message: "Company not found." };
        set({ ...result.newState, lastReportHeadline: result.message });
        return { ok: true, message: result.message };
      },

      upgradeLocation: (companyId, locationId) => {
        const s = get();
        const result = applyLocationUpgrade(s, companyId, locationId);
        if (!result) return { ok: false, message: "Insufficient funds or location already at max tier." };
        set({ ...result.newState, lastReportHeadline: result.message });
        return { ok: true, message: result.message };
      },

      // ---------- Phase 3.1 Dynasty actions ----------
      tutorHeir: (heirId) => {
        const s = get();
        const result = investTutoring(s, heirId);
        if (!result.ok) return { ok: false, message: result.message };
        const patch: Partial<GameState> = {};
        if (result.updatedHeirs) patch.heirs = result.updatedHeirs;
        if (result.cashDelta) patch.cash = s.cash + result.cashDelta;
        set({ ...patch, lastReportHeadline: result.message });
        return { ok: true, message: result.message };
      },

      mentorHeir: (heirId) => {
        const s = get();
        const result = investMentorship(s, heirId);
        if (!result.ok) return { ok: false, message: result.message };
        const patch: Partial<GameState> = {};
        if (result.updatedHeirs) patch.heirs = result.updatedHeirs;
        if (result.updatedFounder) patch.founder = result.updatedFounder;
        set({ ...patch, lastReportHeadline: result.message });
        return { ok: true, message: result.message };
      },

      publicizeHeir: (heirId) => {
        const s = get();
        const result = investPublicRole(s, heirId);
        if (!result.ok) return { ok: false, message: result.message };
        const patch: Partial<GameState> = {};
        if (result.updatedHeirs) patch.heirs = result.updatedHeirs;
        if (result.cashDelta) patch.cash = s.cash + result.cashDelta;
        set({ ...patch, lastReportHeadline: result.message });
        return { ok: true, message: result.message };
      },

      reorderSuccession: (fromIndex, toIndex) => {
        const s = get();
        const next = reorderSuccession(s.successionOrder, fromIndex, toIndex);
        if (next === s.successionOrder) return { ok: false, message: "Invalid reorder." };
        set({ successionOrder: next });
        return { ok: true, message: "Succession order updated." };
      },

      requestStepDown: () => {
        const s = get();
        if (s.pendingSuccession) {
          return { ok: false, message: "A transition is already in progress." };
        }
        if (s.dynastyEnded) {
          return { ok: false, message: "The dynasty has already ended." };
        }
        if (s.founder.age < 60) {
          return { ok: false, message: `You must be at least 60 to step down. You are ${s.founder.age}.` };
        }
        const pending = initiateStepDown(s);
        if (!pending) {
          return {
            ok: false,
            message: "No eligible adult heir to receive the transition.",
          };
        }
        set({ pendingSuccession: pending });
        return { ok: true, message: "Step-down initiated. Review the handoff on People." };
      },

      acknowledgeSuccession: () => {
        const s = get();
        if (!s.pendingSuccession) {
          return { ok: false, message: "No pending succession." };
        }
        const result = executeSuccession(s, s.pendingSuccession);
        set({ ...result.patch, lastReportHeadline: result.summary });
        return { ok: true, message: result.summary };
      },

      endDynasty: () => set({ dynastyEnded: true }),
      reset: () => set({ ...initialState, lastReportHeadline: "" }),
    }),
    {
      name: "maverick-entrepreneur-save",
      version: 9,
    }
  )
);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
