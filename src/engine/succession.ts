// ============================================================
// Phase 3.2 — Succession mechanics
// Sudden-death rolls, voluntary step-down transitions, estate tax,
// unchosen-heir branching.
// ============================================================

import type {
  GameState,
  Founder,
  Heir,
  PendingSuccession,
  ReignRecord,
  DefectedHeir,
  Rival,
} from "@/types";
import { lifeRiskLevel } from "@/data/dynasty";

// ============================================================
// SUDDEN DEATH ROLL
// ============================================================

// Probability per monthly tick that founder dies, keyed to life-risk level.
// These are *monthly* probabilities, so over a year:
//   low:       ~1%  annual
//   watchful:  ~4%  annual
//   elevated:  ~12% annual
//   dangerous: ~35% annual
const DEATH_ODDS_PER_MONTH: Record<string, number> = {
  none: 0,
  low: 0.0008,
  watchful: 0.0034,
  elevated: 0.011,
  dangerous: 0.033,
};

export function rollSuddenDeath(state: GameState, rngRoll: number): PendingSuccession | null {
  // Already in a transition? Don't roll again.
  if (state.pendingSuccession || state.dynastyEnded) return null;

  const ctx = {
    age: state.founder.age,
    health: state.founder.health,
    stress: state.founder.stress,
    companyCount: state.companies.length,
  };
  const risk = lifeRiskLevel(ctx);
  const odds = DEATH_ODDS_PER_MONTH[risk] ?? 0;
  if (odds === 0 || rngRoll >= odds) return null;

  // Pick successor from order (first living adult)
  const successorId = findNextSuccessor(state);

  return {
    kind: "death",
    founderNameAtTransition: state.founder.name,
    founderAgeAtTransition: state.founder.age,
    reason: deathFlavor(state.founder, risk),
    successorId,
    estateTaxRate: computeEstateTaxRate(state),
    triggeredMonth: state.month,
  };
}

function deathFlavor(founder: Founder, risk: string): string {
  const first = founder.name.split(/\s+/)[0] || "The founder";
  if (risk === "dangerous") {
    return `${first} passed in the night. The doctor had been warning about this for months. At ${founder.age}, the body gave out.`;
  }
  if (risk === "elevated") {
    return `${first} collapsed at the office and did not wake up. ${founder.age} years. The staff speak in low voices for a week.`;
  }
  return `${first} died unexpectedly at ${founder.age}. An ordinary morning, then the news.`;
}

// ============================================================
// VOLUNTARY STEP-DOWN
// ============================================================

export function initiateStepDown(state: GameState): PendingSuccession | null {
  if (state.pendingSuccession || state.dynastyEnded) return null;
  if (state.founder.age < 60) return null;

  const successorId = findNextSuccessor(state);
  if (!successorId) return null; // no eligible heir to receive the transition

  return {
    kind: "stepdown",
    founderNameAtTransition: state.founder.name,
    founderAgeAtTransition: state.founder.age,
    reason: stepDownFlavor(state.founder),
    successorId,
    estateTaxRate: computeEstateTaxRate(state) * 0.5, // step-down is cheaper — estate planning pays off
    triggeredMonth: state.month,
  };
}

function stepDownFlavor(founder: Founder): string {
  const first = founder.name.split(/\s+/)[0] || "The founder";
  return `${first} announced the transition at the quarterly meeting. After ${founder.age} years, a clean handoff. The lawyers had been preparing the paperwork for some time.`;
}

// ============================================================
// ESTATE TAX
// ============================================================

export function computeEstateTaxRate(state: GameState): number {
  // Base rate 20%, scaled up by corporate tax regime (politics) and inflation pressure
  const baseRate = 0.2;
  const politicsFactor = state.politics.corporateTax * 0.6; // up to +0.3
  const inflationFactor = state.economy.inflation * 0.5;   // up to +0.06
  return Math.min(0.45, baseRate + politicsFactor + inflationFactor);
}

// ============================================================
// SUCCESSOR SELECTION
// ============================================================

function findNextSuccessor(state: GameState): string | null {
  const adults = new Set(
    state.heirs.filter((h) => h.status !== "child").map((h) => h.id)
  );
  for (const id of state.successionOrder) {
    if (adults.has(id)) return id;
  }
  return null;
}

// ============================================================
// EXECUTE SUCCESSION — the actual transition
// ============================================================

export interface SuccessionResult {
  patch: Partial<GameState>;
  summary: string;
  defections: DefectedHeir[];
  newRival: Rival | null;
  dynastyEnded: boolean;
}

export function executeSuccession(
  state: GameState,
  pending: PendingSuccession
): SuccessionResult {
  // Case 1: no eligible successor → dynasty ends
  if (!pending.successorId) {
    const archive = archiveReign(state, pending, "died");
    return {
      patch: {
        pendingSuccession: null,
        dynastyEnded: true,
        dynastyHistory: [...state.dynastyHistory, archive],
      },
      summary: `${pending.founderNameAtTransition} died with no eligible heirs. The empire fractures. The dynasty ends at generation ${state.generation}.`,
      defections: [],
      newRival: null,
      dynastyEnded: true,
    };
  }

  const successor = state.heirs.find((h) => h.id === pending.successorId);
  if (!successor) {
    // Defensive: shouldn't happen, but handle gracefully
    return {
      patch: { pendingSuccession: null },
      summary: `Succession error: successor not found.`,
      defections: [],
      newRival: null,
      dynastyEnded: false,
    };
  }

  // Apply estate tax
  const taxedCash = Math.round(state.cash * (1 - pending.estateTaxRate));
  const taxPaid = state.cash - taxedCash;

  // Build new founder from successor
  const newFounder: Founder = {
    name: successor.name,
    age: successor.age,
    background: state.founder.background, // inherit stylistic hint
    traits: successor.traits.map((t) => t.kind),
    energy: 85,
    stress: 20,
    health: 95,
  };

  // Resolve defections — non-selected adult heirs roll
  const defections: DefectedHeir[] = [];
  let newRival: Rival | null = null;
  const remainingHeirs: Heir[] = [];

  for (const h of state.heirs) {
    if (h.id === pending.successorId) continue; // the successor becomes founder, removed from heirs
    if (h.status === "child") {
      // Children stay — they'll grow up under the new regime
      remainingHeirs.push(h);
      continue;
    }
    // Adult heirs roll for defection
    const outcome = rollDefection(h);
    if (outcome === "stayed_loyal") {
      remainingHeirs.push(h);
    } else {
      defections.push({
        id: h.id,
        name: h.name,
        defectedMonth: state.month,
        outcome,
      });
      if (outcome === "became_rival") {
        newRival = buildDefectorRival(h, state);
        defections[defections.length - 1].rivalId = newRival.id;
      }
    }
  }

  // Archive the outgoing reign
  const archive = archiveReign(
    state,
    pending,
    pending.kind === "death" ? "died" : "stepped_down"
  );

  // Build the summary
  let summary = `${pending.founderNameAtTransition} ${pending.kind === "death" ? "died" : "stepped down"} at ${pending.founderAgeAtTransition}. `;
  summary += `${successor.name} takes the reins. `;
  if (taxPaid > 0) {
    summary += `Estate taxes: $${taxPaid.toLocaleString()} (${Math.round(pending.estateTaxRate * 100)}%). `;
  }
  if (defections.length > 0) {
    const rivalDefector = defections.find((d) => d.outcome === "became_rival");
    if (rivalDefector) {
      summary += `${rivalDefector.name} left and founded a competitor.`;
    } else {
      const leftCount = defections.filter((d) => d.outcome === "left_quietly").length;
      const bitterCount = defections.filter((d) => d.outcome === "stayed_bitter").length;
      if (leftCount) summary += `${leftCount} heir${leftCount > 1 ? "s" : ""} left the family.`;
      if (bitterCount)
        summary += ` ${bitterCount} stayed, resentful.`;
    }
  }

  const rivalsPatch = newRival ? [...state.rivals, newRival] : state.rivals;

  return {
    patch: {
      pendingSuccession: null,
      founder: newFounder,
      heirs: remainingHeirs,
      cash: taxedCash,
      generation: state.generation + 1,
      successionOrder: [],  // cleared; rebuilt when remaining children come of age
      dynastyHistory: [...state.dynastyHistory, archive],
      defectedHeirs: [...state.defectedHeirs, ...defections],
      rivals: rivalsPatch,
    },
    summary,
    defections,
    newRival,
    dynastyEnded: false,
  };
}

// ============================================================
// DEFECTION ROLL — what does a passed-over heir do?
// ============================================================

type DefectionOutcome = "stayed_loyal" | "left_quietly" | "stayed_bitter" | "became_rival";

function rollDefection(heir: Heir): DefectionOutcome {
  const loyalty = heir.loyalty;
  const ambitious = heir.traits.some((t) => t.kind === "ambitious");
  const ruthless = heir.traits.some((t) => t.kind === "ruthless");

  // Very high loyalty → always stays
  if (loyalty >= 70) return "stayed_loyal";

  // Ambitious + ruthless + low loyalty → rival founder
  if (loyalty < 35 && ruthless && ambitious) {
    return Math.random() < 0.7 ? "became_rival" : "left_quietly";
  }

  // Low loyalty + ambitious (not ruthless) → leaves
  if (loyalty < 50 && ambitious) {
    return "left_quietly";
  }

  // Medium loyalty → stays but bitter
  if (loyalty < 55) {
    return Math.random() < 0.5 ? "stayed_bitter" : "stayed_loyal";
  }

  return "stayed_loyal";
}

// ============================================================
// BUILD RIVAL FROM DEFECTING HEIR
// ============================================================

function buildDefectorRival(heir: Heir, state: GameState): Rival {
  const hadHomeTown = state.companies[0]?.locations[0]?.cityId ?? "nyc";
  // Cash they walk away with — a fraction of their share, capped
  const startingCash = Math.min(
    5_000_000,
    Math.max(800_000, Math.round(state.cash * 0.12))
  );
  const industry = state.companies[0]?.industry ?? "software";

  return {
    id: `defector_${heir.id}`,
    name: `${heir.name} Holdings`,
    industry,
    archetype: "disruptor",
    tagline: `${industry} · founded in spite · private`,
    quote: `I asked for my due. They said wait your turn. I didn't.`,
    quoteAttribution: `${heir.name}, to the business press`,
    aggression: 85,
    reputation: 48,
    brandStrength: 52,
    talentPull: Math.round(heir.aptitude * 0.7),
    politicalReach: Math.round(heir.publicAppeal * 0.6),
    grudge: -85,
    marketShare: 0.04,
    estimatedCash: startingCash,
    locations: 1,
    monthlyRevenue: Math.round(startingCash * 0.04),
    growth: 0.08,
    cities: [hadHomeTown],
  };
}

// ============================================================
// ARCHIVE REIGN
// ============================================================

function archiveReign(
  state: GameState,
  pending: PendingSuccession,
  endReason: "died" | "stepped_down"
): ReignRecord {
  // Peak tracking is approximate — use current values as a simple proxy.
  // Phase 3.3 will add proper peak tracking.
  return {
    generation: state.generation,
    founderName: pending.founderNameAtTransition,
    startMonth: 0,
    endMonth: pending.triggeredMonth,
    endReason,
    ageAtStart: state.founder.age - Math.floor(pending.triggeredMonth / 12),
    ageAtEnd: pending.founderAgeAtTransition,
    peakCash: state.cash,
    peakCompanies: state.companies.length,
    peakProperties: state.properties.length,
  };
}
