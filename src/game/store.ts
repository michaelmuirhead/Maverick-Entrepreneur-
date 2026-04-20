"use client";

import { create } from "zustand";
import { Employee, GameState, OfferTier, Product, ProductCategory } from "./types";
import { newGame, NewGameConfig, suggestProductName } from "./init";
import { advanceWeek } from "./tick";
import { makeIdGen, makeRng } from "./rng";
import { applyFundingRound, fundingOffer, pitchForFunding, PitchOutcome } from "./finance";
import { counterOfferCost, retentionBonusCost, salaryFor } from "./team";
import { startNextVersion, canStartNextVersion } from "./products";
import { ZERO_USERS, derivePricing } from "./segments";
import { revenueModelFor } from "./categories";
import { buildArchiveEntry } from "./archive";
import { isRefactorActive, refactorWeeklyCost } from "./debt";
import { applyPlayerAcquisition } from "./mergers";
import { teamEffects } from "./roles";
import { loadGame, saveGame } from "@/lib/storage";
import { money } from "@/lib/format";

interface GameStore {
  state: GameState | null;
  hydrated: boolean;

  // Lifecycle
  hydrate: () => Promise<void>;
  startNewGame: (config: NewGameConfig) => void;
  resetGame: () => void;
  loadExternalSave: (state: GameState) => void;

  // Tick
  advance: () => void;

  // Product actions
  renameProduct: (id: string, name: string) => void;
  setDevBudget: (id: string, budget: number) => void;
  setMarketingBudget: (id: string, budget: number) => void;
  assignEngineer: (productId: string, employeeId: string) => void;
  unassignEngineer: (productId: string, employeeId: string) => void;
  designNewProduct: (name: string, category: ProductCategory, pricePerUser: number) => void;
  sunsetProduct: (id: string) => void;
  /** Kick off development of the product's next major version (v2/v3/...). */
  startProductNextVersion: (id: string, weeklyBudget: number) => void;
  /** Cancel an in-flight vNext effort (budget was sunk, progress is lost). */
  cancelProductNextVersion: (id: string) => void;

  /** Kick off a refactor sprint — burns tech debt fast at the cost of velocity + cash. */
  startRefactorSprint: (id: string, weeks: number) => void;
  /** Cut the sprint short. Debt paydown stops; velocity returns to normal next tick. */
  cancelRefactorSprint: (id: string) => void;

  /**
   * Make an acquisition bid on a competitor at a given tier (lowball / fair / premium).
   * If the target accepts, cash is deducted and an absorbed Product is added to the
   * player's portfolio. If they reject, a 6-week cooldown is set.
   */
  attemptAcquisition: (competitorId: string, tier: OfferTier) => void;

  // Team actions
  hireCandidate: (candidate: Employee) => void;
  fireEmployee: (id: string) => void;
  /** Match the competing offer with a salary bump. Costs cash (salary raise paid immediately as signing bonus proxy). */
  counterOffer: (id: string) => void;
  /** One-time bonus — more expensive, but gives a bigger morale bump. */
  retentionBonus: (id: string) => void;

  // Finance
  acceptFundingOffer: () => void;
  /**
   * Player actively pitches investors. Returns the outcome (offer / reasons passed)
   * AND records the attempt as an event so the EventLog reflects the pitch either way.
   * If an offer comes back, it's up to the caller (the Finance UI) to display and
   * let the player accept it.
   */
  pitchForRound: () => PitchOutcome;
}

export const useGame = create<GameStore>((set, get) => ({
  state: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const saved = await loadGame();
      set({ state: saved, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  startNewGame: (config) => {
    const s = newGame(config);
    set({ state: s });
    void saveGame(s);
  },

  resetGame: () => { set({ state: null }); void saveGame(null); },

  loadExternalSave: (s) => { set({ state: s }); void saveGame(s); },

  advance: () => {
    const cur = get().state;
    if (!cur) return;
    const next = advanceWeek(cur);
    set({ state: next });
    void saveGame(next);
  },

  renameProduct: (id, name) => update(set, get, (s) => ({
    ...s, products: s.products.map(p => p.id === id ? { ...p, name } : p),
  })),

  setDevBudget: (id, budget) => update(set, get, (s) => ({
    ...s, products: s.products.map(p => p.id === id ? { ...p, devBudget: Math.max(0, budget) } : p),
  })),

  setMarketingBudget: (id, budget) => update(set, get, (s) => ({
    ...s, products: s.products.map(p => p.id === id ? { ...p, marketingBudget: Math.max(0, budget) } : p),
  })),

  assignEngineer: (productId, employeeId) => update(set, get, (s) => ({
    ...s,
    employees: s.employees.map(e => e.id === employeeId ? { ...e, assignedProductId: productId } : e),
    products: s.products.map(p => p.id === productId
      ? { ...p, assignedEngineers: Array.from(new Set([...p.assignedEngineers, employeeId])) }
      : { ...p, assignedEngineers: p.assignedEngineers.filter(id => id !== employeeId) }
    ),
  })),

  unassignEngineer: (productId, employeeId) => update(set, get, (s) => ({
    ...s,
    employees: s.employees.map(e => e.id === employeeId ? { ...e, assignedProductId: undefined } : e),
    products: s.products.map(p => p.id === productId
      ? { ...p, assignedEngineers: p.assignedEngineers.filter(id => id !== employeeId) }
      : p
    ),
  })),

  designNewProduct: (name, category, pricePerUser) => update(set, get, (s) => {
    const rng = makeRng(`${s.seed}:p${s.products.length + s.archivedProducts.length}`);
    const newId = makeIdGen(rng);
    const finalName = name.trim() || suggestProductName(category, rng);
    const p: Product = {
      id: newId("p"),
      name: finalName,
      category,
      stage: "concept",
      version: "0.1",
      health: 85,
      quality: 60,
      users: { ...ZERO_USERS },
      lastWeekUserTotal: 0,
      pricing: derivePricing(pricePerUser),
      revenueModel: revenueModelFor(category),
      devProgress: 0,
      devBudget: 0,
      marketingBudget: 0,
      weeksAtStage: 0,
      weeksSinceLaunch: 0,
      ageWeeks: 0,
      assignedEngineers: [],
      lifetimeRevenue: 0,
      lifetimeCost: 0,
      lifetimeDevCost: 0,
      lifetimeMarketingCost: 0,
      peakUsers: 0,
      peakMrr: 0,
      techDebt: 0,
    };
    return { ...s, products: [...s.products, p] };
  }),

  sunsetProduct: (id) => update(set, get, (s) => {
    const target = s.products.find(p => p.id === id);
    if (!target) return s;
    // Build a post-mortem and move the product off the active roster into the archive.
    // Any employees assigned to it are released (unassigned, not fired).
    const archived = buildArchiveEntry(target, s.week, "sunset");
    return {
      ...s,
      products: s.products.filter(p => p.id !== id),
      archivedProducts: [archived, ...s.archivedProducts],
      employees: s.employees.map(e =>
        e.assignedProductId === id ? { ...e, assignedProductId: undefined } : e,
      ),
      events: [
        { id: `ev_${s.week}_sunset_${id}`, week: s.week, severity: "warn",
          message: `Sunset ${target.name}. Lifetime revenue: ${money(archived.lifetimeRevenue, { short: true })} against ${money(archived.lifetimeCost, { short: true })} spent. Verdict: ${archived.verdict}.`,
          relatedProductId: id },
        ...s.events,
      ],
    };
  }),

  startProductNextVersion: (id, weeklyBudget) => update(set, get, (s) => {
    const target = s.products.find(p => p.id === id);
    if (!target || !canStartNextVersion(target)) return s;
    const updated = startNextVersion(target, s.week, weeklyBudget);
    if (updated === target) return s;
    const version = updated.nextVersion?.targetVersion ?? "2.0";
    return {
      ...s,
      products: s.products.map(p => p.id === id ? updated : p),
      events: [
        { id: `ev_${s.week}_vstart_${id}`, week: s.week, severity: "info",
          message: `Kicked off ${target.name} ${version} development at ${money(weeklyBudget, { short: true })}/wk. Engineers assigned to ${target.name} will split time between keep-the-lights-on and the new build.` },
        ...s.events,
      ],
    };
  }),

  cancelProductNextVersion: (id) => update(set, get, (s) => {
    const target = s.products.find(p => p.id === id);
    if (!target || !target.nextVersion) return s;
    return {
      ...s,
      products: s.products.map(p => p.id === id ? { ...p, nextVersion: undefined } : p),
      events: [
        { id: `ev_${s.week}_vcancel_${id}`, week: s.week, severity: "warn",
          message: `Cancelled ${target.name} ${target.nextVersion.targetVersion}. Progress lost, lessons learned — supposedly.` },
        ...s.events,
      ],
    };
  }),

  startRefactorSprint: (id, weeks) => update(set, get, (s) => {
    const target = s.products.find(p => p.id === id);
    if (!target) return s;
    // Only makes sense on products that exist as a codebase — dev or post-launch.
    if (!["dev", "launched", "mature", "declining"].includes(target.stage)) return s;
    if (isRefactorActive(target, s.week)) return s;
    const weeksClamped = Math.max(1, Math.min(12, Math.round(weeks)));
    const until = s.week + weeksClamped;
    return {
      ...s,
      products: s.products.map(p => p.id === id ? { ...p, refactorSprintUntil: until } : p),
      events: [
        { id: `ev_${s.week}_refactor_${id}`, week: s.week, severity: "info",
          message: `Refactor sprint on ${target.name} — ${weeksClamped} week${weeksClamped === 1 ? "" : "s"} of paying down debt. Velocity will be halved while it runs; expect about ${Math.round(refactorWeeklyCost(target, teamEffects(target.assignedEngineers, s.employees)) / 1000)}K/wk extra spend.`,
          relatedProductId: id },
        ...s.events,
      ],
    };
  }),

  cancelRefactorSprint: (id) => update(set, get, (s) => {
    const target = s.products.find(p => p.id === id);
    if (!target || !isRefactorActive(target, s.week)) return s;
    return {
      ...s,
      products: s.products.map(p => p.id === id ? { ...p, refactorSprintUntil: undefined } : p),
      events: [
        { id: `ev_${s.week}_refactor_cancel_${id}`, week: s.week, severity: "warn",
          message: `Cut the refactor sprint on ${target.name} short. The debt that remains is still there, just less in your face.`,
          relatedProductId: id },
        ...s.events,
      ],
    };
  }),

  attemptAcquisition: (competitorId, tier) => update(set, get, (s) =>
    applyPlayerAcquisition(s, competitorId, tier)
  ),

  hireCandidate: (c) => update(set, get, (s) => {
    const salary = c.salary || salaryFor(c.role, c.level);
    // Hiring costs 1 week salary in one-time onboarding/setup
    const onboarding = Math.round(salary / 52);
    if (s.finance.cash < onboarding) return s; // can't afford — no-op (UI should block)
    const newEmp: Employee = { ...c, salary, hiredWeek: s.week };
    return {
      ...s,
      employees: [...s.employees, newEmp],
      finance: { ...s.finance, cash: s.finance.cash - onboarding },
      events: [
        { id: `ev_${s.week}_hired_${c.id}`, week: s.week, severity: "good",
          message: `Hired ${c.name} as ${c.role} at $${salary.toLocaleString()}/yr. Welcome aboard.` },
        ...s.events,
      ],
    };
  }),

  counterOffer: (id) => update(set, get, (s) => {
    const e = s.employees.find(x => x.id === id);
    if (!e || typeof e.noticeEndsWeek !== "number") return s;
    const cost = counterOfferCost(e);
    if (s.finance.cash < cost) return s;
    const newSalary = e.salary + cost;
    return {
      ...s,
      finance: { ...s.finance, cash: s.finance.cash - cost },
      employees: s.employees.map(x => x.id === id ? {
        ...x,
        salary: newSalary,
        morale: Math.min(100, (x.morale || 0) + 15),
        noticeReason: undefined,
        noticeEndsWeek: undefined,
        poacherId: undefined,
        retentionSaves: (x.retentionSaves ?? 0) + 1,
      } : x),
      events: [
        { id: `ev_${s.week}_counter_${id}`, week: s.week, severity: "good",
          message: `Counter-offered ${e.name}: salary up to $${newSalary.toLocaleString()}/yr. They're staying. (This time.)` },
        ...s.events,
      ],
    };
  }),

  retentionBonus: (id) => update(set, get, (s) => {
    const e = s.employees.find(x => x.id === id);
    if (!e || typeof e.noticeEndsWeek !== "number") return s;
    const cost = retentionBonusCost(e);
    if (s.finance.cash < cost) return s;
    return {
      ...s,
      finance: { ...s.finance, cash: s.finance.cash - cost },
      employees: s.employees.map(x => x.id === id ? {
        ...x,
        morale: Math.min(100, (x.morale || 0) + 25),
        noticeReason: undefined,
        noticeEndsWeek: undefined,
        poacherId: undefined,
        retentionSaves: (x.retentionSaves ?? 0) + 1,
      } : x),
      events: [
        { id: `ev_${s.week}_bonus_${id}`, week: s.week, severity: "good",
          message: `Paid ${e.name} a $${cost.toLocaleString()} retention bonus. Smiles restored, stock refresh pending.` },
        ...s.events,
      ],
    };
  }),

  fireEmployee: (id) => update(set, get, (s) => {
    const e = s.employees.find(x => x.id === id);
    if (!e || e.role === "founder") return s;
    return {
      ...s,
      employees: s.employees.filter(x => x.id !== id),
      products: s.products.map(p => ({ ...p, assignedEngineers: p.assignedEngineers.filter(x => x !== id) })),
      events: [
        { id: `ev_${s.week}_fired_${id}`, week: s.week, severity: "warn",
          message: `Let ${e.name} go. Severance handled; morale took a small hit.` },
        ...s.employees.map(emp => emp.id !== id ? null : null).filter(Boolean) as any,
        ...s.events,
      ],
    };
  }),

  acceptFundingOffer: () => update(set, get, (s) => {
    const offer = fundingOffer(s);
    if (!offer) return s;
    const events = [...s.events];
    const next = applyFundingRound(s, offer, events);
    return { ...next, events };
  }),

  pitchForRound: () => {
    const s = get().state;
    if (!s) return { kind: "passed" as const, nextRound: "—", reasons: ["No company yet."], diagnostics: { mrr: 0, required: null } };
    const outcome = pitchForFunding(s);

    if (outcome.kind === "offer") {
      // Offer events only fire if the pitch actually landed — keeps the log honest.
      const pitchEvent = {
        id: `ev_${s.week}_pitch_${outcome.offer.label.replace(/\s+/g, "-")}`,
        week: s.week,
        severity: "good" as const,
        message: `Pitched investors for ${outcome.offer.label}. ${outcome.commentary}`,
      };
      const nextState = { ...s, events: [pitchEvent, ...s.events] };
      set({ state: nextState });
      void saveGame(nextState);
    } else {
      // "Passed" — still log it so the player can see they tried.
      const pitchEvent = {
        id: `ev_${s.week}_pitch_${outcome.nextRound}_passed_${Math.floor(Math.random() * 9999)}`,
        week: s.week,
        severity: "warn" as const,
        message: `Pitched investors for ${outcome.nextRound}; they passed. "${outcome.reasons[0]?.split(".")[0] ?? "Come back with more traction"}."`,
      };
      const nextState = { ...s, events: [pitchEvent, ...s.events] };
      set({ state: nextState });
      void saveGame(nextState);
    }

    return outcome;
  },
}));

function update(set: any, get: any, fn: (s: GameState) => GameState) {
  const cur = get().state;
  if (!cur) return;
  const next = fn(cur);
  set({ state: next });
  void saveGame(next);
}
