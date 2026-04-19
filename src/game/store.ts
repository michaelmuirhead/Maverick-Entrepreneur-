"use client";

import { create } from "zustand";
import { Employee, GameState, Product, ProductCategory } from "./types";
import { newGame, NewGameConfig, suggestProductName } from "./init";
import { advanceWeek } from "./tick";
import { makeIdGen, makeRng } from "./rng";
import { applyFundingRound, fundingOffer } from "./finance";
import { salaryFor } from "./team";
import { loadGame, saveGame } from "@/lib/storage";

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

  // Team actions
  hireCandidate: (candidate: Employee) => void;
  fireEmployee: (id: string) => void;

  // Finance
  acceptFundingOffer: () => void;
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
    const rng = makeRng(`${s.seed}:p${s.products.length}`);
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
      users: 0,
      pricePerUser,
      devProgress: 0,
      devBudget: 0,
      marketingBudget: 0,
      weeksAtStage: 0,
      weeksSinceLaunch: 0,
      ageWeeks: 0,
      assignedEngineers: [],
    };
    return { ...s, products: [...s.products, p] };
  }),

  sunsetProduct: (id) => update(set, get, (s) => ({
    ...s, products: s.products.map(p => p.id === id ? { ...p, stage: "eol" as const, weeksAtStage: 0 } : p),
  })),

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
}));

function update(set: any, get: any, fn: (s: GameState) => GameState) {
  const cur = get().state;
  if (!cur) return;
  const next = fn(cur);
  set({ state: next });
  void saveGame(next);
}
