"use client";

import { create } from "zustand";
import {
  Employee, GameState, IpoStage, MarketingChannel, OfferTier,
  OfficeTier, Partnership, PerkKind, Product, ProductCategory, Region,
} from "./types";
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
import { OFFICE_TIERS, canUpgradeTo, upgradeCost } from "./office";
import { PERKS, recomputeCultureScore } from "./culture";
import { createCampaign } from "./campaigns";
import {
  advanceIpoStage, createOssProject, createPartnership, expandInto,
  fileNewPatent, ipoEligible, ipoMinDwell, patentFilingCost,
} from "./portfolio";
import { loadEntrepreneur, saveEntrepreneur } from "@/lib/storage";
import { money } from "@/lib/format";
import type { GameStudioState } from "./studio/types";
import {
  AnyVentureState,
  ENTREPRENEUR_SCHEMA_VERSION,
  EntrepreneurState,
  getActiveVenture,
  isSaasVenture,
  isStudioVenture,
  replaceVenture,
  ventureId,
} from "./entrepreneur";

interface GameStore {
  /**
   * The authoritative portfolio state — holds every venture the player has
   * founded, plus the entrepreneur's personal wealth and wall-clock week.
   * `state` below is a derived mirror of the active venture when it's the
   * SaaS flavor, for backwards compatibility with every existing page that
   * pre-dates the multi-venture refactor.
   */
  entrepreneur: EntrepreneurState | null;
  /**
   * Legacy handle: reflects the active venture when it's a SaaS venture.
   * For studio ventures this is null — studio pages should read
   * `activeStudioVenture` (or use `useGame(s => s.entrepreneur)` directly).
   * Keep this field stable so existing selectors (`useGame(s => s.state)`)
   * keep compiling without changes across the codebase.
   */
  state: GameState | null;
  /** Active venture, cast to the studio shape, or null if the active venture
   *  is a SaaS venture. Symmetric with `state`. */
  activeStudioVenture: GameStudioState | null;
  hydrated: boolean;

  // Lifecycle
  hydrate: () => Promise<void>;
  startNewGame: (config: NewGameConfig) => void;
  /** Switch the currently-displayed venture. No-op if the id doesn't match. */
  switchVenture: (ventureId: string) => void;
  /** Add a brand-new venture into the portfolio (any kind) and make it active.
   *  Caller is responsible for constructing the venture state. */
  addVenture: (venture: AnyVentureState) => void;
  resetGame: () => void;
  loadExternalSave: (state: GameState | EntrepreneurState) => void;

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

  // --- Office ---
  /** Kick off an upgrade to a higher office tier. Cash is charged immediately; the
   *  tier only actually switches after `buildOutWeeks` — `resolvePendingUpgrade` in
   *  the tick handles the move-in event. Idempotent on invalid upgrades. */
  startOfficeUpgrade: (target: OfficeTier) => void;

  // --- Culture ---
  /** Turn a perk on/off. Already-enabled perks are disabled; otherwise they're added. */
  togglePerk: (perk: PerkKind) => void;

  // --- Marketing campaigns ---
  /** Launch a new marketing campaign. Returns the created campaign id for the UI to
   *  optionally deep-link to it; returns null if invariants failed (unknown product,
   *  insufficient budget). The total budget is debited upfront. */
  launchCampaign: (params: {
    name: string;
    channel: MarketingChannel;
    productId: string;
    budget: number;
  }) => string | null;

  // --- Regions ---
  /** Expand into a region. Charges the one-time cost. No-op if already present or
   *  if cash is insufficient. */
  expandRegion: (region: Region) => void;

  // --- Patents ---
  /** File a new patent covering a product category. Costs filing fee upfront. */
  filePatent: (title: string, category: ProductCategory) => void;

  // --- Open source ---
  /** Start sponsoring an open-source project. Seeds it with 5 stars and queues
   *  weekly spend as ongoing burn. */
  startOssProject: (params: { name: string; category: ProductCategory; weeklyBudget: number }) => void;
  /** Adjust weekly budget for an existing OSS project. */
  setOssBudget: (id: string, weeklyBudget: number) => void;
  /** Shut down an OSS project (ends the weekly burn, keeps the brand memory). */
  stopOssProject: (id: string) => void;

  // --- Partnerships ---
  /** Sign a new partnership. */
  signPartnership: (params: {
    partnerName: string;
    kind: Partnership["kind"];
    weeklyCost: number;
    signupMultiplier: number;
    benefitsCategory: ProductCategory;
  }) => void;
  /** End a partnership. */
  endPartnership: (id: string) => void;

  // --- IPO ---
  /** Advance to the next IPO stage. Caller is responsible for checking eligibility
   *  and dwell time first; this just refuses to advance if they haven't. */
  advanceIpo: () => void;
}

/** Derive the `state` / `activeStudioVenture` projection from an
 *  entrepreneur. Kept as a pure function so every mutation can re-run it
 *  instead of hand-syncing the fields at each call site. */
function projectActive(e: EntrepreneurState | null): {
  state: GameState | null;
  activeStudioVenture: GameStudioState | null;
} {
  if (!e) return { state: null, activeStudioVenture: null };
  const active = getActiveVenture(e);
  if (!active) return { state: null, activeStudioVenture: null };
  if (isStudioVenture(active)) return { state: null, activeStudioVenture: active };
  // isSaasVenture covers the legacy no-discriminator case.
  return { state: active as GameState, activeStudioVenture: null };
}

/** Wrap a freshly-created SaaS `GameState` in a brand-new entrepreneur. Used
 *  from `startNewGame` so first-time SaaS founders pick up the portfolio
 *  wrapper automatically. */
function freshEntrepreneurFromSaas(s: GameState): EntrepreneurState {
  return {
    personalWealth: 0,
    founderName: s.company.founderName,
    week: s.week,
    ventures: [s],
    activeVentureId: s.seed,
    schemaVersion: ENTREPRENEUR_SCHEMA_VERSION,
  };
}

export const useGame = create<GameStore>((set, get) => ({
  entrepreneur: null,
  state: null,
  activeStudioVenture: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const saved = await loadEntrepreneur();
      const projection = projectActive(saved);
      set({ entrepreneur: saved, ...projection, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  startNewGame: (config) => {
    const s = newGame(config);
    const e = freshEntrepreneurFromSaas(s);
    const projection = projectActive(e);
    set({ entrepreneur: e, ...projection });
    void saveEntrepreneur(e);
  },

  switchVenture: (id) => {
    const cur = get().entrepreneur;
    if (!cur) return;
    if (!cur.ventures.some(v => ventureId(v) === id)) return;
    if (cur.activeVentureId === id) return;
    const next: EntrepreneurState = { ...cur, activeVentureId: id };
    const projection = projectActive(next);
    set({ entrepreneur: next, ...projection });
    void saveEntrepreneur(next);
  },

  addVenture: (venture) => {
    const cur = get().entrepreneur;
    if (!cur) return;
    const id = ventureId(venture);
    // Refuse duplicate ids (same seed) — the caller should have generated a
    // unique seed for the new venture.
    if (cur.ventures.some(v => ventureId(v) === id)) return;
    const next: EntrepreneurState = {
      ...cur,
      ventures: [...cur.ventures, venture],
      activeVentureId: id,
    };
    const projection = projectActive(next);
    set({ entrepreneur: next, ...projection });
    void saveEntrepreneur(next);
  },

  resetGame: () => {
    set({ entrepreneur: null, state: null, activeStudioVenture: null });
    void saveEntrepreneur(null);
  },

  loadExternalSave: (s) => {
    // Accept either a legacy bare GameState or a new EntrepreneurState —
    // normalize via the entrepreneur shape check.
    const e: EntrepreneurState = "ventures" in s && Array.isArray((s as EntrepreneurState).ventures)
      ? (s as EntrepreneurState)
      : freshEntrepreneurFromSaas(s as GameState);
    const projection = projectActive(e);
    set({ entrepreneur: e, ...projection });
    void saveEntrepreneur(e);
  },

  advance: () => {
    const cur = get().entrepreneur;
    if (!cur) return;
    const active = getActiveVenture(cur);
    if (!active) return;
    // SaaS: advanceWeek applies to the SaaS slot. Studio: deferred until the
    // studio tick engine lands (task #42). For now, a studio-only save
    // advances the wall-clock week but does nothing else.
    let tickedVenture: AnyVentureState = active;
    if (isSaasVenture(active)) {
      tickedVenture = advanceWeek(active);
    } else if (isStudioVenture(active)) {
      // Placeholder until studio tick exists — just bump the week counter so
      // the UI doesn't appear frozen while we're building the engine.
      tickedVenture = { ...active, week: active.week + 1 };
    }
    const nextE: EntrepreneurState = {
      ...replaceVenture(cur, tickedVenture),
      // Wall-clock week moves in lockstep with the active venture's week
      // count. When multiple ventures coexist we'll revisit this (e.g. tick
      // every venture each week), but for now single-venture parity is fine.
      week: cur.week + 1,
    };
    const projection = projectActive(nextE);
    set({ entrepreneur: nextE, ...projection });
    void saveEntrepreneur(nextE);
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

  // ==========================================================================
  // Office
  // ==========================================================================
  startOfficeUpgrade: (target) => update(set, get, (s) => {
    const current = s.office?.tier ?? "garage";
    if (!canUpgradeTo(current, target)) return s;
    if (s.office?.pendingUpgrade) return s; // one upgrade at a time
    const { cash, weeks } = upgradeCost(target);
    if (s.finance.cash < cash) return s;
    const sinceWeek = s.office?.sinceWeek ?? 0;
    return {
      ...s,
      finance: { ...s.finance, cash: s.finance.cash - cash },
      office: {
        tier: current,
        sinceWeek,
        pendingUpgrade: { toTier: target, startedWeek: s.week, readyWeek: s.week + weeks },
      },
      events: [
        { id: `ev_${s.week}_office_${target}`, week: s.week, severity: "info",
          message: `Signed the lease on the new ${OFFICE_TIERS[target].label.toLowerCase()}. Build-out runs ${weeks} week${weeks === 1 ? "" : "s"} — ${money(cash, { short: true })} committed upfront.` },
        ...s.events,
      ],
    };
  }),

  // ==========================================================================
  // Culture
  // ==========================================================================
  togglePerk: (perk) => update(set, get, (s) => {
    const cur = s.culture ?? { perks: [], cultureScore: 40 };
    const enabled = cur.perks.includes(perk);
    const nextPerks = enabled
      ? cur.perks.filter(p => p !== perk)
      : [...cur.perks, perk];
    const avgMorale = s.employees.length > 0
      ? s.employees.reduce((sum, e) => sum + (e.morale ?? 70), 0) / s.employees.length
      : 70;
    const cultureScore = recomputeCultureScore({ ...cur, perks: nextPerks }, avgMorale);
    const info = PERKS[perk];
    return {
      ...s,
      culture: { perks: nextPerks, cultureScore },
      events: [
        { id: `ev_${s.week}_perk_${perk}_${enabled ? "off" : "on"}`, week: s.week,
          severity: enabled ? "warn" : "good",
          message: enabled
            ? `Turned off "${info.label}." Team noticed instantly.`
            : `Enabled "${info.label}." Costs $${info.weeklyCostPerEmployee}/employee/week.` },
        ...s.events,
      ],
    };
  }),

  // ==========================================================================
  // Marketing campaigns
  // ==========================================================================
  launchCampaign: (params) => {
    const cur = get().state;
    if (!cur) return null;
    const product = cur.products.find(p => p.id === params.productId);
    if (!product) return null;
    if (cur.finance.cash < params.budget) return null;
    const id = `camp_${cur.week}_${Math.random().toString(36).slice(2, 8)}`;
    const rng = makeRng(`${cur.seed}:camp:${id}`);
    const campaign = createCampaign({
      id,
      name: params.name.trim() || `${params.channel} push`,
      channel: params.channel,
      productId: params.productId,
      productCategory: product.category,
      budget: params.budget,
      week: cur.week,
      rng,
    });
    update(set, get, (s) => ({
      ...s,
      finance: { ...s.finance, cash: s.finance.cash - params.budget },
      campaigns: [...(s.campaigns ?? []), campaign],
      events: [
        { id: `ev_${s.week}_camp_${id}`, week: s.week, severity: "info",
          message: `Launched ${campaign.name} (${params.channel}) on ${product.name}. ${campaign.durationWeeks} weeks @ ${money(params.budget / campaign.durationWeeks, { short: true })}/wk.` },
        ...s.events,
      ],
    }));
    return id;
  },

  // ==========================================================================
  // Regions
  // ==========================================================================
  expandRegion: (region) => update(set, get, (s) => {
    const { regions, cost } = expandInto(s.regions, region, s.week);
    if (cost > 0 && s.finance.cash < cost) return s;
    if (cost === 0 && regions === (s.regions ?? [])) return s;
    return {
      ...s,
      finance: { ...s.finance, cash: s.finance.cash - cost },
      regions,
      events: [
        { id: `ev_${s.week}_region_${region}`, week: s.week, severity: "good",
          message: `Opened shop in ${region.toUpperCase()}. Expansion cost ${money(cost, { short: true })}. Localization will ramp up over the next few quarters.` },
        ...s.events,
      ],
    };
  }),

  // ==========================================================================
  // Patents
  // ==========================================================================
  filePatent: (title, category) => update(set, get, (s) => {
    const cost = patentFilingCost(category);
    if (s.finance.cash < cost) return s;
    const id = `pat_${s.week}_${Math.random().toString(36).slice(2, 6)}`;
    const patent = fileNewPatent({ id, title: title.trim() || "Untitled invention", category, week: s.week });
    return {
      ...s,
      finance: { ...s.finance, cash: s.finance.cash - cost },
      patents: [...(s.patents ?? []), patent],
      events: [
        { id: `ev_${s.week}_pat_${id}`, week: s.week, severity: "info",
          message: `Filed a patent: "${patent.title}" (${category}). ${money(cost, { short: true })} to the USPTO. Grant is 4–5 quarters out.` },
        ...s.events,
      ],
    };
  }),

  // ==========================================================================
  // Open source
  // ==========================================================================
  startOssProject: (params) => update(set, get, (s) => {
    const id = `oss_${s.week}_${Math.random().toString(36).slice(2, 6)}`;
    const proj = createOssProject({
      id, name: params.name.trim() || "unnamed-oss",
      category: params.category,
      weeklyBudget: Math.max(0, params.weeklyBudget),
      week: s.week,
    });
    return {
      ...s,
      openSource: [...(s.openSource ?? []), proj],
      events: [
        { id: `ev_${s.week}_oss_${id}`, week: s.week, severity: "info",
          message: `Spun up ${proj.name} as an open-source project. ${money(proj.weeklyBudget, { short: true })}/wk — engineering will get some credibility out of it.` },
        ...s.events,
      ],
    };
  }),

  setOssBudget: (id, weeklyBudget) => update(set, get, (s) => ({
    ...s,
    openSource: (s.openSource ?? []).map(o =>
      o.id === id ? { ...o, weeklyBudget: Math.max(0, weeklyBudget) } : o,
    ),
  })),

  stopOssProject: (id) => update(set, get, (s) => {
    const proj = (s.openSource ?? []).find(o => o.id === id);
    if (!proj) return s;
    return {
      ...s,
      openSource: (s.openSource ?? []).filter(o => o.id !== id),
      events: [
        { id: `ev_${s.week}_oss_end_${id}`, week: s.week, severity: "warn",
          message: `Shut down ${proj.name}. The README will live on, briefly.` },
        ...s.events,
      ],
    };
  }),

  // ==========================================================================
  // Partnerships
  // ==========================================================================
  signPartnership: (params) => update(set, get, (s) => {
    const id = `part_${s.week}_${Math.random().toString(36).slice(2, 6)}`;
    const partnership = createPartnership({
      id, partnerName: params.partnerName.trim() || "Partner Co",
      kind: params.kind,
      weeklyCost: Math.max(0, params.weeklyCost),
      signupMultiplier: Math.max(1, params.signupMultiplier),
      benefitsCategory: params.benefitsCategory,
      week: s.week,
    });
    return {
      ...s,
      partnerships: [...(s.partnerships ?? []), partnership],
      events: [
        { id: `ev_${s.week}_part_${id}`, week: s.week, severity: "good",
          message: `Signed a ${partnership.kind} partnership with ${partnership.partnerName}. Expect a ${Math.round((partnership.signupMultiplier - 1) * 100)}% signup lift on ${params.benefitsCategory}.` },
        ...s.events,
      ],
    };
  }),

  endPartnership: (id) => update(set, get, (s) => {
    const p = (s.partnerships ?? []).find(x => x.id === id);
    if (!p) return s;
    return {
      ...s,
      partnerships: (s.partnerships ?? []).filter(x => x.id !== id),
      events: [
        { id: `ev_${s.week}_part_end_${id}`, week: s.week, severity: "info",
          message: `Wound down the partnership with ${p.partnerName}.` },
        ...s.events,
      ],
    };
  }),

  // ==========================================================================
  // IPO
  // ==========================================================================
  advanceIpo: () => update(set, get, (s) => {
    const ipo = s.ipo ?? { stage: "none" as IpoStage, stageStartedWeek: 0 };
    // Stage gating:
    //  - none → exploring : requires ipoEligible() ok
    //  - others            : require min dwell in the current stage
    if (ipo.stage === "none") {
      const elig = ipoEligible(s);
      if (!elig.ok) return s;
    } else {
      const dwell = ipoMinDwell(ipo.stage);
      if (s.week - ipo.stageStartedWeek < dwell) return s;
    }
    const nextIpo = advanceIpoStage(ipo, s.week);
    if (nextIpo.stage === ipo.stage) return s;
    let finance = s.finance;
    let proceeds = nextIpo.proceeds;
    if (nextIpo.stage === "public") {
      // Booked valuation × 0.2 as free-float raise.
      const mrrAnnual = (s.finance.mrr ?? 0) * 12;
      proceeds = Math.round(mrrAnnual * 10 * 0.2);
      finance = { ...s.finance, cash: s.finance.cash + proceeds };
    }
    return {
      ...s,
      finance,
      ipo: { ...nextIpo, proceeds },
      events: [
        { id: `ev_${s.week}_ipo_${nextIpo.stage}`, week: s.week,
          severity: nextIpo.stage === "public" ? "good" : "info",
          message: nextIpo.stage === "public"
            ? `IPO priced. ${money(proceeds ?? 0, { short: true })} raised. Lock-up starts now.`
            : `IPO status advanced to "${nextIpo.stage}." The bankers are on the phone.` },
        ...s.events,
      ],
    };
  }),

  pitchForRound: () => {
    const s = get().state;
    if (!s) return { kind: "passed" as const, nextRound: "—", reasons: ["No company yet."], diagnostics: { mrr: 0, required: null } };
    const outcome = pitchForFunding(s);

    const pitchEvent = outcome.kind === "offer"
      ? {
          id: `ev_${s.week}_pitch_${outcome.offer.label.replace(/\s+/g, "-")}`,
          week: s.week,
          severity: "good" as const,
          message: `Pitched investors for ${outcome.offer.label}. ${outcome.commentary}`,
        }
      : {
          id: `ev_${s.week}_pitch_${outcome.nextRound}_passed_${Math.floor(Math.random() * 9999)}`,
          week: s.week,
          severity: "warn" as const,
          message: `Pitched investors for ${outcome.nextRound}; they passed. "${outcome.reasons[0]?.split(".")[0] ?? "Come back with more traction"}."`,
        };

    update(set, get, (cur) => ({ ...cur, events: [pitchEvent, ...cur.events] }));
    return outcome;
  },
}));

/**
 * SaaS mutation helper. Resolves the active SaaS venture, applies `fn`, stitches
 * the updated venture back into the entrepreneur portfolio, and persists the
 * whole portfolio. No-ops if the active venture isn't a SaaS venture — studio
 * ventures have their own mutation helper once the studio actions land.
 */
function update(
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
  fn: (s: GameState) => GameState,
) {
  const cur = get().entrepreneur;
  if (!cur) return;
  const active = getActiveVenture(cur);
  if (!active || !isSaasVenture(active)) return;
  const next = fn(active);
  if (next === active) return;
  const nextE = replaceVenture(cur, next);
  const projection = projectActive(nextE);
  set({ entrepreneur: nextE, ...projection });
  void saveEntrepreneur(nextE);
}
