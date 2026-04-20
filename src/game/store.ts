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
import { acceptPlayerBuyout, applyPlayerAcquisition, declinePlayerBuyout } from "./mergers";
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
import type {
  GameGenre, GamePlatform, GameScope, GameStudioState,
} from "./studio/types";
import { newStudio, NewStudioConfig } from "./studio/init";
import { addGameToStudio, cancelGame, tickStudio } from "./studio/tick";
import { makeGame } from "./studio/games";
import { launchGame } from "./studio/launch";
import { startCrunch, endCrunch } from "./studio/crunch";
import { acceptPlatformOffer, respondToReviewBomb } from "./studio/platforms";
import { queueDlc } from "./studio/live-service";
import { GENRE_INFO, PLATFORM_INFO } from "./studio/genres";
import { acceptContract, declineContract } from "./studio/contracts";
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
  /** Start a fresh playthrough with a Game Studio as the first venture.
   *  Replaces any existing entrepreneur — use `addVenture(newStudio(...))` to
   *  add a studio to an existing portfolio instead. */
  startNewStudio: (config: NewStudioConfig) => void;
  /** Switch the currently-displayed venture. No-op if the id doesn't match. */
  switchVenture: (ventureId: string) => void;
  /** Add a brand-new venture into the portfolio (any kind) and make it active.
   *  Caller is responsible for constructing the venture state. */
  addVenture: (venture: AnyVentureState) => void;
  /**
   * Found a new SaaS venture using personal wealth as seed capital. The
   * invested amount is deducted from `entrepreneur.personalWealth` and becomes
   * the new venture's starting cash. No-ops if:
   *   - No entrepreneur exists yet (use `startNewGame` for the first venture).
   *   - `invest` exceeds available personal wealth.
   *   - `invest` is non-positive.
   * Returns the id of the new venture on success; `null` otherwise.
   */
  foundAdditionalSaas: (config: NewGameConfig, invest: number) => string | null;
  /** Symmetric to `foundAdditionalSaas` for the Game Studio vertical. */
  foundAdditionalStudio: (config: NewStudioConfig, invest: number) => string | null;
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

  /**
   * Accept an incoming buyout offer from an AI competitor. Cash is credited,
   * a completed deal is recorded, and the game enters a "game-over-via-success"
   * state with reason `"acquired"`. Irreversible — the only way back is to
   * start a new venture.
   */
  acceptBuyoutOffer: (offerId: string) => void;
  /**
   * Decline an incoming buyout offer. The offer is removed and the suitor goes
   * into a long cooldown before they'll try again.
   */
  declineBuyoutOffer: (offerId: string) => void;

  // Team actions
  hireCandidate: (candidate: Employee) => void;
  fireEmployee: (id: string) => void;
  /** Match the competing offer with a salary bump. Costs cash (salary raise paid immediately as signing bonus proxy). */
  counterOffer: (id: string) => void;
  /** One-time bonus — more expensive, but gives a bigger morale bump. */
  retentionBonus: (id: string) => void;

  // Finance
  acceptFundingOffer: () => void;
  /** Set the founder's weekly salary on the active venture. Clamped to >= 0.
   *  The draw is applied during `advance` and routed to `personalWealth`. */
  setFounderSalary: (amount: number) => void;
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

  // ==========================================================================
  // Studio actions — only meaningful when the active venture is a Game Studio.
  // Each studio action no-ops if the active venture isn't a studio.
  // ==========================================================================
  /** Greenlight a new game in the active studio. Title will be auto-filled if
   *  blank. Returns the new game's id, or null if the action was refused. */
  createStudioGame: (params: {
    title: string;
    genre: GameGenre;
    scope: GameScope;
    platforms: GamePlatform[];
    devBudget?: number;
  }) => string | null;
  /** Assign an engineer to a game. Also unassigns them from any other game they
   *  were on, so engineers are never double-booked at the model layer. */
  assignGameEngineer: (gameId: string, employeeId: string) => void;
  unassignGameEngineer: (gameId: string, employeeId: string) => void;
  setGameDevBudget: (gameId: string, budget: number) => void;
  setGameMarketingBudget: (gameId: string, budget: number) => void;
  /** Flip the crunch flag on a game. UI should warn on the ethics before calling. */
  toggleGameCrunch: (gameId: string) => void;
  /** Set or clear the planned launch week for a game. Required once in polish. */
  setGamePlannedLaunchWeek: (gameId: string, week: number | null) => void;
  /** Ship a game right now — forces it through launch regardless of stage. Use
   *  when the player hits "Launch" manually rather than waiting for the tick. */
  shipGameNow: (gameId: string) => void;
  /** Cancel an in-flight game. Archives the project and emits a sunset event. */
  cancelStudioGame: (gameId: string) => void;
  /** Accept an open platform deal offer. Credits the upfront payment and
   *  attaches exclusivity to the target game. */
  acceptStudioPlatformOffer: (offerId: string) => void;
  /** Decline an open platform deal offer. Removes it from the pool. */
  declineStudioPlatformOffer: (offerId: string) => void;
  /** Queue a new DLC pack for a launched game. */
  queueStudioDlc: (gameId: string, params: {
    name: string;
    costMult: number;
    plannedWeek: number;
    salesSpike?: number;
  }) => void;
  /** Respond to an active review bomb on a game with a PR intervention. */
  respondToStudioReviewBomb: (
    gameId: string,
    quality: "apology" | "compensation" | "rollback",
  ) => void;
  /** Accept an open contract offer. Player must supply at least the required
   *  number of engineers/designers; action validates staffing and credits the
   *  upfront payment. No-op if the offer is expired, already taken, or the
   *  player's selected staff don't meet minimums. */
  acceptStudioContract: (
    offerId: string,
    engineerIds: string[],
    designerIds: string[],
  ) => void;
  /** Decline an open contract offer. Marks it declined; doesn't remove it from
   *  history so the UI can still show "you passed on this." */
  declineStudioContract: (offerId: string) => void;
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

/** Pull the entrepreneur's display name off a venture. Both SaaS and Studio
 *  verticals store the founder as `employees[0]` at creation time, so this
 *  works across verticals. Falls back to the company name if no founder found. */
function founderDisplayName(v: AnyVentureState): string {
  const founder = v.employees.find(e => e.role === "founder");
  return founder?.name ?? v.company.name;
}

/** Wrap a freshly-created SaaS `GameState` in a brand-new entrepreneur. Used
 *  from `startNewGame` so first-time SaaS founders pick up the portfolio
 *  wrapper automatically. */
function freshEntrepreneurFromSaas(s: GameState): EntrepreneurState {
  return {
    personalWealth: 0,
    founderName: founderDisplayName(s),
    week: s.week,
    ventures: [s],
    activeVentureId: s.seed,
    schemaVersion: ENTREPRENEUR_SCHEMA_VERSION,
  };
}

/** Wrap a freshly-created studio in a brand-new entrepreneur. Symmetric to
 *  `freshEntrepreneurFromSaas` — the player's first venture is a studio. */
function freshEntrepreneurFromStudio(s: GameStudioState): EntrepreneurState {
  return {
    personalWealth: 0,
    founderName: founderDisplayName(s),
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

  startNewStudio: (config) => {
    const s = newStudio(config);
    const e = freshEntrepreneurFromStudio(s);
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

  foundAdditionalSaas: (config, invest) => {
    const cur = get().entrepreneur;
    if (!cur) return null;
    const amount = Math.floor(invest);
    if (!(amount > 0)) return null;
    if (amount > cur.personalWealth) return null;
    // Force a unique seed so we never collide with an existing venture even
    // if the caller reused a company name.
    const seed = config.seed && !cur.ventures.some(v => v.seed === config.seed)
      ? config.seed
      : `saas-${Date.now().toString(36)}-${cur.ventures.length}`;
    const built = newGame({ ...config, seed });
    // Overwrite the tier-based starting cash with the player's chosen
    // personal-wealth investment. Everything else from `newGame` (products,
    // employees, economy seed, etc.) is preserved.
    const venture: GameState = {
      ...built,
      finance: { ...built.finance, cash: amount },
    };
    const next: EntrepreneurState = {
      ...cur,
      personalWealth: cur.personalWealth - amount,
      ventures: [...cur.ventures, venture],
      activeVentureId: venture.seed,
    };
    const projection = projectActive(next);
    set({ entrepreneur: next, ...projection });
    void saveEntrepreneur(next);
    return venture.seed;
  },

  foundAdditionalStudio: (config, invest) => {
    const cur = get().entrepreneur;
    if (!cur) return null;
    const amount = Math.floor(invest);
    if (!(amount > 0)) return null;
    if (amount > cur.personalWealth) return null;
    const seed = config.seed && !cur.ventures.some(v => v.seed === config.seed)
      ? config.seed
      : `studio-${Date.now().toString(36)}-${cur.ventures.length}`;
    const built = newStudio({ ...config, seed });
    const venture: GameStudioState = {
      ...built,
      finance: { ...built.finance, cash: amount },
    };
    const next: EntrepreneurState = {
      ...cur,
      personalWealth: cur.personalWealth - amount,
      ventures: [...cur.ventures, venture],
      activeVentureId: venture.seed,
    };
    const projection = projectActive(next);
    set({ entrepreneur: next, ...projection });
    void saveEntrepreneur(next);
    return venture.seed;
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
    // SaaS and Studio each have their own tick engines. The store routes based
    // on the active venture kind; multi-venture-parallel ticking is a future
    // enhancement (each venture would tick independently once per week).
    let tickedVenture: AnyVentureState = active;
    if (isSaasVenture(active)) {
      tickedVenture = advanceWeek(active);
    } else if (isStudioVenture(active)) {
      tickedVenture = tickStudio(active);
    }
    // Founder salary — the tick engine already debited the draw from venture
    // cash and stashed the realized amount in `lastTickDeltas.founderDraw`.
    // Credit that to `entrepreneur.personalWealth` so the two pots net out.
    const founderDraw = Math.max(0, tickedVenture.lastTickDeltas?.founderDraw ?? 0);
    const nextE: EntrepreneurState = {
      ...replaceVenture(cur, tickedVenture),
      personalWealth: cur.personalWealth + founderDraw,
      // Wall-clock week moves in lockstep with the active venture's week
      // count. When multiple ventures coexist we'll revisit this (e.g. tick
      // every venture each week), but for now single-venture parity is fine.
      week: cur.week + 1,
    };
    const projection = projectActive(nextE);
    set({ entrepreneur: nextE, ...projection });
    void saveEntrepreneur(nextE);
  },

  setFounderSalary: (amount) => {
    const cur = get().entrepreneur;
    if (!cur) return;
    const active = getActiveVenture(cur);
    if (!active) return;
    const next: AnyVentureState = { ...active, founderSalary: Math.max(0, Math.round(amount)) };
    const nextE = replaceVenture(cur, next);
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

  acceptBuyoutOffer: (offerId) => {
    // Inline (not using the `update` helper) because on an accepted buyout we
    // credit the founder's equity-weighted share of the acquisition price to
    // `entrepreneur.personalWealth` — above the venture boundary.
    const cur = get().entrepreneur;
    if (!cur) return;
    const active = getActiveVenture(cur);
    if (!active || !isSaasVenture(active)) return;

    const offer = (active.buyoutOffers ?? []).find(o => o.id === offerId);
    // Found-offer gate mirrors acceptPlayerBuyout's own no-op guards. Compute
    // the founder payout *before* running the pure function so we capture the
    // pre-exit equity (the returned state has `gameOver` set and we don't want
    // to rely on stale struct).
    const founderEquity = active.employees.find(e => e.role === "founder")?.equity ?? 0;
    const founderPayout = offer && active.week < offer.expiresWeek && !active.gameOver
      ? Math.round(founderEquity * offer.price)
      : 0;

    const nextVenture = acceptPlayerBuyout(active, offerId);
    if (nextVenture === active) return; // no-op (expired, missing, already over)

    let eventsWithFounder = nextVenture.events;
    if (founderPayout > 0) {
      eventsWithFounder = [
        {
          id: `ev_${nextVenture.week}_acq_founder_payout`,
          week: nextVenture.week,
          severity: "good",
          message: `Your equity stake cashes out at ${money(founderPayout, { short: true })}. Added to personal wealth — fund your next venture whenever you're ready.`,
        },
        ...nextVenture.events,
      ];
    }
    const finalVenture: GameState = { ...nextVenture, events: eventsWithFounder };

    const nextE: EntrepreneurState = {
      ...replaceVenture(cur, finalVenture),
      personalWealth: cur.personalWealth + founderPayout,
    };
    const projection = projectActive(nextE);
    set({ entrepreneur: nextE, ...projection });
    void saveEntrepreneur(nextE);
  },

  declineBuyoutOffer: (offerId) => update(set, get, (s) =>
    declinePlayerBuyout(s, offerId)
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
        pendingUpgrade: { toTier: target, startedWeek: s.week, readyWeek: s.week + weeks, buildOutCost: cash },
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
  advanceIpo: () => {
    // Inline (not using the `update` helper) because the "priced" stage
    // transition pays the founder's secondary allocation into
    // `entrepreneur.personalWealth` — which lives above the venture boundary.
    const cur = get().entrepreneur;
    if (!cur) return;
    const active = getActiveVenture(cur);
    if (!active || !isSaasVenture(active)) return;
    const s = active;

    const ipo = s.ipo ?? { stage: "none" as IpoStage, stageStartedWeek: 0 };
    // Stage gating:
    //  - none → exploring : requires ipoEligible() ok
    //  - others            : require min dwell in the current stage
    if (ipo.stage === "none") {
      const elig = ipoEligible(s);
      if (!elig.ok) return;
    } else {
      const dwell = ipoMinDwell(ipo.stage);
      if (s.week - ipo.stageStartedWeek < dwell) return;
    }
    const nextIpo = advanceIpoStage(ipo, s.week);
    if (nextIpo.stage === ipo.stage) return;

    let finance = s.finance;
    let proceeds = nextIpo.proceeds;
    let founderPayout = 0;
    // Market cap at pricing — mirror of the proceeds math below.
    let marketCap = 0;

    if (nextIpo.stage === "public") {
      // Booked valuation × 0.2 as free-float raise.
      const mrrAnnual = (s.finance.mrr ?? 0) * 12;
      marketCap = Math.round(mrrAnnual * 10);
      proceeds = Math.round(marketCap * 0.2);
      finance = { ...s.finance, cash: s.finance.cash + proceeds };

      // Founder secondary — 20% of the founder's equity stake is sold in the
      // offering and flows to personal wealth. Lock-up covers the rest.
      const founderEquity = s.employees.find(e => e.role === "founder")?.equity ?? 0;
      founderPayout = Math.round(founderEquity * marketCap * 0.2);
    }

    const events: typeof s.events = [
      { id: `ev_${s.week}_ipo_${nextIpo.stage}`, week: s.week,
        severity: nextIpo.stage === "public" ? "good" : "info",
        message: nextIpo.stage === "public"
          ? `IPO priced. ${money(proceeds ?? 0, { short: true })} raised by the company. Lock-up starts now.`
          : `IPO status advanced to "${nextIpo.stage}." The bankers are on the phone.` },
      ...s.events,
    ];
    if (founderPayout > 0) {
      events.unshift({
        id: `ev_${s.week}_ipo_founder_secondary`,
        week: s.week,
        severity: "good",
        message: `You sold a secondary block in the IPO — ${money(founderPayout, { short: true })} hits your personal wealth. The rest of your stake is locked up.`,
      });
    }

    const nextVenture: GameState = {
      ...s,
      finance,
      ipo: { ...nextIpo, proceeds },
      events,
    };
    const nextE: EntrepreneurState = {
      ...replaceVenture(cur, nextVenture),
      personalWealth: cur.personalWealth + founderPayout,
    };
    const projection = projectActive(nextE);
    set({ entrepreneur: nextE, ...projection });
    void saveEntrepreneur(nextE);
  },

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

  // ==========================================================================
  // Studio actions
  // ==========================================================================
  createStudioGame: (params) => {
    const cur = get().activeStudioVenture;
    if (!cur) return null;
    // Lean studios can only juggle one project at a time until they ship
    // something. The rule reflects the tier fantasy: you're a scrappy
    // bedroom studio — no bandwidth for parallel greenlights.
    if (cur.startingTier === "lean") {
      const inDevCount = cur.games.filter(g =>
        !g.launched && g.stage !== "released" && g.stage !== "live-service"
        && g.stage !== "mature" && g.stage !== "sunset"
      ).length;
      // Archived games don't carry a `launched` flag — they have `launchedWeek`
      // set iff they actually shipped before being sunset (some are cancelled).
      const hasShipped = cur.games.some(g => !!g.launched)
        || cur.archivedGames.some(g => g.launchedWeek != null);
      if (inDevCount >= 1 && !hasShipped) {
        // Refuse. Surface a player-visible event so the UI rejection is legible.
        studioUpdate(set, get, (s) => ({
          ...s,
          events: [
            {
              id: `ev_${s.week}_lean_cap_${params.title.slice(0, 12)}_${s.games.length}`,
              week: s.week,
              severity: "warn" as const,
              message: `Lean studios run one project at a time until the first title ships. Finish "${cur.games.find(g => !g.launched)?.title ?? "the current game"}" first, or hire up and change tier.`,
            },
            ...s.events,
          ],
        }));
        return null;
      }
    }

    // Derive the new game id from a seed-scoped RNG so the same save always
    // produces the same ids on replay. Includes project count so back-to-back
    // creations don't collide.
    const projCount = cur.games.length + cur.archivedGames.length;
    const rng = makeRng(`${cur.seed}:g${projCount}`);
    const newId = makeIdGen(rng);
    const id = newId("g");
    const title = params.title.trim() || generateGameTitle(params.genre, rng);
    const platforms = params.platforms.length > 0 ? params.platforms : ["pc-steam"];
    const g = makeGame({
      id,
      title,
      genre: params.genre,
      scope: params.scope,
      platforms: platforms as GamePlatform[],
      startedWeek: cur.week,
      devBudget: params.devBudget,
    });
    studioUpdate(set, get, (s) => {
      const next = addGameToStudio(s, g);
      return {
        ...next,
        events: [
          {
            id: `ev_${s.week}_greenlight_${id}`,
            week: s.week,
            severity: "good" as const,
            message: `Greenlit ${title} — ${g.scope} ${g.genre}. Target: ${g.targetDevWeeks} weeks, min ${g.assignedEngineers.length} engineers assigned so far.`,
          },
          ...next.events,
        ],
      };
    });
    return id;
  },

  assignGameEngineer: (gameId, employeeId) => studioUpdate(set, get, (s) => ({
    ...s,
    employees: s.employees.map(e =>
      e.id === employeeId ? { ...e, assignedProductId: gameId } : e,
    ),
    games: s.games.map(g =>
      g.id === gameId
        ? { ...g, assignedEngineers: Array.from(new Set([...g.assignedEngineers, employeeId])) }
        : { ...g, assignedEngineers: g.assignedEngineers.filter(x => x !== employeeId) },
    ),
  })),

  unassignGameEngineer: (gameId, employeeId) => studioUpdate(set, get, (s) => ({
    ...s,
    employees: s.employees.map(e =>
      e.id === employeeId ? { ...e, assignedProductId: undefined } : e,
    ),
    games: s.games.map(g =>
      g.id === gameId
        ? { ...g, assignedEngineers: g.assignedEngineers.filter(x => x !== employeeId) }
        : g,
    ),
  })),

  setGameDevBudget: (gameId, budget) => studioUpdate(set, get, (s) => ({
    ...s,
    games: s.games.map(g =>
      g.id === gameId ? { ...g, devBudget: Math.max(0, Math.round(budget)) } : g,
    ),
  })),

  setGameMarketingBudget: (gameId, budget) => studioUpdate(set, get, (s) => ({
    ...s,
    games: s.games.map(g =>
      g.id === gameId ? { ...g, marketingBudget: Math.max(0, Math.round(budget)) } : g,
    ),
  })),

  toggleGameCrunch: (gameId) => studioUpdate(set, get, (s) => {
    const g = s.games.find(x => x.id === gameId);
    if (!g) return s;
    const next = g.crunchActive ? endCrunch(g) : startCrunch(g);
    if (next === g) return s;
    return {
      ...s,
      games: s.games.map(x => x.id === gameId ? next : x),
      events: [
        {
          id: `ev_${s.week}_crunch_${next.crunchActive ? "on" : "off"}_${gameId}`,
          week: s.week,
          severity: next.crunchActive ? "warn" as const : "info" as const,
          message: next.crunchActive
            ? `Crunch started on ${g.title}. +40% velocity, +25% burn, attrition risk climbs after week 8.`
            : `Crunch ended on ${g.title}. Team can breathe again.`,
        },
        ...s.events,
      ],
    };
  }),

  setGamePlannedLaunchWeek: (gameId, week) => studioUpdate(set, get, (s) => ({
    ...s,
    games: s.games.map(g =>
      g.id === gameId
        ? { ...g, plannedLaunchWeek: week == null ? undefined : Math.max(s.week, Math.round(week)) }
        : g,
    ),
  })),

  shipGameNow: (gameId) => studioUpdate(set, get, (s) => {
    const g = s.games.find(x => x.id === gameId);
    if (!g) return s;
    // Only ship pre-release games. Post-release games have already shipped.
    if (g.stage === "released" || g.stage === "live-service"
        || g.stage === "mature" || g.stage === "sunset") return s;
    const rng = makeRng(`${s.seed}:launch:${gameId}:${s.week}`);
    const result = launchGame(g, s.week, rng);
    return {
      ...s,
      games: s.games.map(x => x.id === gameId ? result.game : x),
      finance: {
        ...s.finance,
        cash: s.finance.cash + result.netCashToStudio,
      },
      events: [
        {
          id: `ev_${s.week}_launch_${gameId}`,
          week: s.week,
          severity: (result.reviewScore >= 75 ? "good" as const : result.reviewScore >= 55 ? "info" as const : "warn" as const),
          message: `${g.title} shipped. Review score ${result.reviewScore}/100. First week: ${result.firstWeekSales.toLocaleString()} units at $${result.listPrice} → ${money(result.netCashToStudio, { short: true })} to the studio.`,
        },
        ...s.events,
      ],
    };
  }),

  cancelStudioGame: (gameId) => studioUpdate(set, get, (s) => {
    const next = cancelGame(s, gameId);
    if (next === s) return s;
    // Release any engineers from this cancelled game so they aren't left
    // assignedProductId-ing to a game that no longer exists.
    return {
      ...next,
      employees: next.employees.map(e =>
        e.assignedProductId === gameId ? { ...e, assignedProductId: undefined } : e,
      ),
    };
  }),

  acceptStudioPlatformOffer: (offerId) => studioUpdate(set, get, (s) => {
    const offer = s.platformOffers.find(o => o.id === offerId);
    if (!offer) return s;
    const target = s.games.find(g => g.id === offer.targetGameId);
    if (!target) return { ...s, platformOffers: s.platformOffers.filter(o => o.id !== offerId) };
    const updatedGame = acceptPlatformOffer(target, offer, s.week);
    return {
      ...s,
      games: s.games.map(g => g.id === target.id ? updatedGame : g),
      finance: { ...s.finance, cash: s.finance.cash + offer.upfrontPayment },
      platformOffers: s.platformOffers.filter(o => o.id !== offerId),
      events: [
        {
          id: `ev_${s.week}_platform_accept_${offerId}`,
          week: s.week,
          severity: "good" as const,
          message: `Signed ${PLATFORM_INFO[offer.platform].label} deal for ${target.title}. ${money(offer.upfrontPayment, { short: true })} upfront, ${offer.marketingBoost.toFixed(1)}× marketing boost${offer.fullExclusivity ? ", full exclusivity" : offer.timedWeeks ? `, ${offer.timedWeeks}-week timed exclusivity` : ""}.`,
        },
        ...s.events,
      ],
    };
  }),

  declineStudioPlatformOffer: (offerId) => studioUpdate(set, get, (s) => {
    const offer = s.platformOffers.find(o => o.id === offerId);
    if (!offer) return s;
    const target = s.games.find(g => g.id === offer.targetGameId);
    return {
      ...s,
      platformOffers: s.platformOffers.filter(o => o.id !== offerId),
      events: [
        {
          id: `ev_${s.week}_platform_decline_${offerId}`,
          week: s.week,
          severity: "info" as const,
          message: `Passed on the ${PLATFORM_INFO[offer.platform].label} deal${target ? ` for ${target.title}` : ""}.`,
        },
        ...s.events,
      ],
    };
  }),

  queueStudioDlc: (gameId, params) => studioUpdate(set, get, (s) => {
    const g = s.games.find(x => x.id === gameId);
    if (!g) return s;
    const projCount = g.dlcPipeline.length;
    const rng = makeRng(`${s.seed}:dlc:${gameId}:${projCount}`);
    const newId = makeIdGen(rng);
    const id = newId("dlc");
    const updated = queueDlc(g, {
      id,
      name: params.name.trim() || "Untitled DLC",
      costMult: params.costMult,
      plannedWeek: Math.max(s.week + 1, Math.round(params.plannedWeek)),
      salesSpike: params.salesSpike,
    });
    if (updated === g) return s;
    return {
      ...s,
      games: s.games.map(x => x.id === gameId ? updated : x),
      events: [
        {
          id: `ev_${s.week}_dlc_queue_${id}`,
          week: s.week,
          severity: "info" as const,
          message: `Queued "${params.name.trim() || "Untitled DLC"}" for ${g.title}. ~${Math.round(params.costMult * 100)}% of base-game dev cost.`,
        },
        ...s.events,
      ],
    };
  }),

  respondToStudioReviewBomb: (gameId, quality) => studioUpdate(set, get, (s) => {
    const g = s.games.find(x => x.id === gameId);
    if (!g || !g.reviewBomb) return s;
    const { cost, newBomb } = respondToReviewBomb(g.reviewBomb, quality);
    if (s.finance.cash < cost) return s;
    return {
      ...s,
      finance: { ...s.finance, cash: s.finance.cash - cost },
      games: s.games.map(x => x.id === gameId ? { ...x, reviewBomb: newBomb } : x),
      events: [
        {
          id: `ev_${s.week}_bomb_response_${gameId}_${quality}`,
          week: s.week,
          severity: (newBomb ? "info" as const : "good" as const),
          message: newBomb
            ? `Issued ${quality} for ${g.title} — ${money(cost, { short: true })} spent. Severity dropping; not yet cleared.`
            : `Issued ${quality} for ${g.title} — ${money(cost, { short: true })} spent. Controversy cleared.`,
        },
        ...s.events,
      ],
    };
  }),

  acceptStudioContract: (offerId, engineerIds, designerIds) => studioUpdate(set, get, (s) => {
    const contracts = s.contracts ?? [];
    const offer = contracts.find(c => c.id === offerId);
    if (!offer) return s;
    // Only pick staff that currently exist on the employees list. Guards
    // against stale UI selection if someone quit between render and accept.
    const presentIds = new Set(s.employees.map(e => e.id));
    const engIds = engineerIds.filter(id => presentIds.has(id));
    const desIds = designerIds.filter(id => presentIds.has(id));
    const result = acceptContract(offer, engIds, desIds, s.week);
    if (!result) return s;
    const nextContracts = contracts.map(c => c.id === offerId ? result.contract : c);
    return {
      ...s,
      contracts: nextContracts,
      finance: { ...s.finance, cash: s.finance.cash + result.upfrontCash },
      events: [
        {
          id: `ev_${s.week}_contract_accept_${offerId}`,
          week: s.week,
          severity: "good" as const,
          message:
            `Signed contract with ${offer.clientName}: "${offer.title}". $${result.upfrontCash.toLocaleString()} upfront, $${(offer.payout - result.upfrontCash).toLocaleString()} on delivery. Deadline: week ${result.contract.deadlineWeek}.`,
        },
        ...s.events,
      ],
    };
  }),

  declineStudioContract: (offerId) => studioUpdate(set, get, (s) => {
    const contracts = s.contracts ?? [];
    const offer = contracts.find(c => c.id === offerId);
    if (!offer) return s;
    const declined = declineContract(offer, s.week);
    if (!declined) return s;
    return {
      ...s,
      contracts: contracts.map(c => c.id === offerId ? declined : c),
      events: [
        {
          id: `ev_${s.week}_contract_decline_${offerId}`,
          week: s.week,
          severity: "info" as const,
          message: `Passed on ${offer.clientName}'s offer for "${offer.title}".`,
        },
        ...s.events,
      ],
    };
  }),
}));

/** Lightweight auto-title generator when the player leaves the title blank.
 *  Picks a suffix from the genre's preferred vocabulary and pairs it with a
 *  short evocative prefix so the game doesn't ship as "Untitled". */
function generateGameTitle(genre: GameGenre, rng: { pick<T>(arr: readonly T[]): T }): string {
  const PREFIXES = ["Crimson", "Silent", "Broken", "Iron", "Hollow", "Last", "Neon", "Ember", "Stormwake", "Verdant"];
  const prefix = rng.pick(PREFIXES);
  const suffix = rng.pick(GENRE_INFO[genre].nameSuffixes);
  return `${prefix} ${suffix}`;
}

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

/**
 * Studio mutation helper — symmetric to `update`, but scoped to Game Studio
 * ventures. Resolves the active studio, applies `fn`, stitches the updated
 * venture back into the entrepreneur portfolio, and persists. No-ops if the
 * active venture isn't a studio (SaaS actions have their own `update` path).
 */
function studioUpdate(
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
  fn: (s: GameStudioState) => GameStudioState,
) {
  const cur = get().entrepreneur;
  if (!cur) return;
  const active = getActiveVenture(cur);
  if (!active || !isStudioVenture(active)) return;
  const next = fn(active);
  if (next === active) return;
  const nextE = replaceVenture(cur, next);
  const projection = projectActive(nextE);
  set({ entrepreneur: nextE, ...projection });
  void saveEntrepreneur(nextE);
}
