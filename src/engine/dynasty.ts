import type {
  Founder,
  GameState,
  Heir,
  HeirStatus,
  HeirTrait,
  HeirTraitKind,
} from "@/types";
import {
  ADULT_BIO_TEMPLATES,
  CHILD_BIO_TEMPLATES,
  CONFLICTING_TRAIT_PAIRS,
  DoctorsNoteContext,
  HEIR_ADULT_AGE,
  HEIR_ESTABLISHED_AGE,
  HEIR_FIRST_BIRTH_MONTH_MAX,
  HEIR_FIRST_BIRTH_MONTH_MIN,
  HEIR_FIRST_NAMES_A,
  HEIR_FIRST_NAMES_B,
  HEIR_SPACING_MAX,
  HEIR_SPACING_MIN,
  HEIR_TRAITS,
  MAX_HEIRS,
  TRAIT_KINDS,
  pickDoctorsNote,
} from "@/data/dynasty";

function uid(): string { return Math.random().toString(36).slice(2, 10); }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function rand(a: number, b: number): number { return Math.random() * (b - a) + a; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function familyName(founderName: string): string {
  // Take the last token of the founder's name as the family surname
  const parts = founderName.trim().split(/\s+/);
  return parts[parts.length - 1] || "Hart";
}

function pickFirstName(existingHeirs: Heir[]): string {
  // Alternate between the two name pools to make siblings feel like siblings
  // (same family, slightly different flavors), while avoiding duplicates.
  const used = new Set(existingHeirs.map((h) => h.name.split(" ")[0]));
  // Choose the opposite pool from the most recent sibling to avoid run-ons
  const lastName = existingHeirs.length > 0 ? existingHeirs[existingHeirs.length - 1].name.split(" ")[0] : null;
  const useA = lastName ? !HEIR_FIRST_NAMES_A.includes(lastName) : Math.random() < 0.5;
  const pool = useA ? HEIR_FIRST_NAMES_A : HEIR_FIRST_NAMES_B;
  const avail = pool.filter((n) => !used.has(n));
  if (avail.length > 0) return pick(avail);
  const fallback = [...HEIR_FIRST_NAMES_A, ...HEIR_FIRST_NAMES_B].filter((n) => !used.has(n));
  return fallback.length > 0 ? pick(fallback) : "Jamie";
}

// Choose 1-2 adult traits that don't conflict
function rollAdultTraits(count: 1 | 2 = 2): HeirTrait[] {
  const chosen: HeirTraitKind[] = [];
  const available = [...TRAIT_KINDS];
  for (let i = 0; i < count && available.length > 0; i++) {
    const t = pick(available);
    chosen.push(t);
    // Remove conflicting pairs from the pool
    const toRemove = new Set([t]);
    for (const [a, b] of CONFLICTING_TRAIT_PAIRS) {
      if (a === t) toRemove.add(b);
      if (b === t) toRemove.add(a);
    }
    for (let j = available.length - 1; j >= 0; j--) {
      if (toRemove.has(available[j])) available.splice(j, 1);
    }
  }
  return chosen.map((k) => HEIR_TRAITS[k]);
}

function pickAdultBio(traits: HeirTrait[], primaryCompanyName: string | null): string {
  const primary = traits[0]?.kind;
  if (!primary || !ADULT_BIO_TEMPLATES[primary]) {
    return "Has grown into their role. The family watches with quiet interest.";
  }
  const template = pick(ADULT_BIO_TEMPLATES[primary]);
  return template.replace("$COMPANY", primaryCompanyName ?? "the family firm");
}

// ============================================================
// Generate a new heir (called when a birth event triggers)
// ============================================================
export function generateHeir(founder: Founder, existingHeirs: Heir[], month: number): Heir {
  const firstName = pickFirstName(existingHeirs);
  const surname = familyName(founder.name);
  // Initial stats — children start low, mostly potential. Stats drift during childhood.
  const aptitude = Math.round(rand(30, 55));
  const loyalty = Math.round(rand(55, 80));       // children default high loyalty
  const publicAppeal = Math.round(rand(30, 60));

  return {
    id: uid(),
    name: `${firstName} ${surname}`,
    age: 0,
    bornMonth: month,
    status: "child",
    aptitude,
    loyalty,
    publicAppeal,
    traits: [],                                   // no traits until adulthood
    bio: pick(CHILD_BIO_TEMPLATES),
    investmentCount: { tutoring: 0, mentorship: 0, publicRole: 0 },
  };
}

// ============================================================
// Per-month heir aging and status transitions
// ============================================================
export function ageHeirs(state: GameState): Heir[] {
  const month = state.month + 1;
  const primaryCompanyName = state.companies[0]?.name ?? null;

  return state.heirs.map((heir) => {
    const newAge = Math.floor((month - heir.bornMonth) / 12);
    if (newAge === heir.age) return heir;

    let updated: Heir = { ...heir, age: newAge };

    // Childhood drift — gentle random walk on stats
    if (newAge < HEIR_ADULT_AGE) {
      updated.aptitude = clamp(updated.aptitude + rand(-1.5, 2.5), 0, 100);
      updated.loyalty = clamp(updated.loyalty + rand(-1, 1), 0, 100);
      updated.publicAppeal = clamp(updated.publicAppeal + rand(-1, 1.5), 0, 100);
      // Swap the bio occasionally so childhood feels lived-in
      if (newAge > 0 && newAge % 5 === 0) {
        updated.bio = pick(CHILD_BIO_TEMPLATES);
      }
    }

    // Coming of age — assign traits and adult bio
    if (heir.status === "child" && newAge >= HEIR_ADULT_AGE) {
      updated.status = "adult";
      updated.traits = rollAdultTraits(2);
      // Small stat adjustments based on adult traits
      for (const trait of updated.traits) {
        if (trait.kind === "ambitious") updated.aptitude = clamp(updated.aptitude + 6, 0, 100);
        if (trait.kind === "cautious") updated.aptitude = clamp(updated.aptitude - 2, 0, 100);
        if (trait.kind === "charismatic") updated.publicAppeal = clamp(updated.publicAppeal + 10, 0, 100);
        if (trait.kind === "reckless") updated.loyalty = clamp(updated.loyalty - 8, 0, 100);
        if (trait.kind === "benevolent") updated.publicAppeal = clamp(updated.publicAppeal + 6, 0, 100);
        if (trait.kind === "ruthless") updated.loyalty = clamp(updated.loyalty - 5, 0, 100);
      }
      updated.bio = pickAdultBio(updated.traits, primaryCompanyName);
    }

    // Becoming established — lock the bio tone, stats crystallize
    if (heir.status === "adult" && newAge >= HEIR_ESTABLISHED_AGE) {
      updated.status = "established";
    }

    // Adulthood drift — trait-driven small effects monthly
    if (updated.status === "adult" || updated.status === "established") {
      for (const trait of updated.traits) {
        if (trait.kind === "ambitious") updated.loyalty = clamp(updated.loyalty - 0.15, 0, 100);
        if (trait.kind === "spendthrift") updated.aptitude = clamp(updated.aptitude - 0.1, 0, 100);
      }
    }

    return updated;
  });
}

// ============================================================
// Should a new heir be born this month?
// ============================================================
export function shouldHaveChild(state: GameState): boolean {
  if (state.heirs.length >= MAX_HEIRS) return false;

  // The founder must be within reasonable child-bearing window
  if (state.founder.age > 50) return false;

  // First child: roll a chance starting at month 96 through 144
  if (state.heirs.length === 0) {
    if (state.month < HEIR_FIRST_BIRTH_MONTH_MIN) return false;
    if (state.month > HEIR_FIRST_BIRTH_MONTH_MAX) {
      // After window: small residual chance so late-game founders still get at least one heir
      return Math.random() < 0.02;
    }
    // Within window: small monthly probability to spread births across the range
    return Math.random() < 0.04;
  }

  // Subsequent children: spaced from the most recent birth
  const lastBirth = state.heirs[state.heirs.length - 1].bornMonth;
  const gap = state.month - lastBirth;
  if (gap < HEIR_SPACING_MIN) return false;
  if (gap > HEIR_SPACING_MAX) {
    return Math.random() < 0.03;
  }
  return Math.random() < 0.025;
}

// ============================================================
// Founder aging — called once per 12 months
// ============================================================
export function ageFounder(founder: Founder, month: number): Founder {
  // Add a year every 12 months
  if (month % 12 !== 0) return founder;

  return {
    ...founder,
    age: founder.age + 1,
  };
}

// ============================================================
// Founder health drift — applied every month
// ============================================================
export function driftFounderHealth(
  founder: Founder,
  companyCount: number
): Founder {
  // Base drift — age and stress chip away, rest restores
  let health = founder.health;

  const ageRate = Math.max(0, (founder.age - 50) / 50);        // 0 at 50, 1 at 100
  const stressImpact = founder.stress / 100;                    // 0..1
  const overloadFactor = Math.max(0, (companyCount - 3) / 10);  // 0 if ≤3 companies

  // Health decreases: age + stress + overload
  const decline = (ageRate * 0.6 + stressImpact * 0.3 + overloadFactor * 0.4) * rand(0.3, 0.8);
  // Health increases: base recovery if stress is low
  const recovery = stressImpact < 0.5 ? (1 - stressImpact) * 0.2 : 0;

  health = clamp(health - decline + recovery, 0, 100);

  return {
    ...founder,
    health: Math.round(health * 10) / 10,
  };
}

// ============================================================
// Refresh the doctor's note
// ============================================================
export function refreshDoctorsNote(founder: Founder, companyCount: number): string {
  return pickDoctorsNote(
    {
      age: founder.age,
      health: founder.health,
      stress: founder.stress,
      companyCount,
    },
    founder.name
  );
}

// ============================================================
// Investment actions
// ============================================================

const TUTORING_COST = 28_000;
const PUBLIC_ROLE_COST = 12_000;
const MENTORSHIP_ENERGY_COST = 8;  // founder energy cost

export interface InvestmentResult {
  ok: boolean;
  message: string;
  updatedHeirs?: Heir[];
  updatedFounder?: Founder;
  cashDelta?: number;
}

// Diminishing returns: each successive investment yields ~70% of the prior
function diminishedGain(base: number, timesAlreadyInvested: number): number {
  return base * Math.pow(0.75, timesAlreadyInvested);
}

export function investTutoring(state: GameState, heirId: string): InvestmentResult {
  const heir = state.heirs.find((h) => h.id === heirId);
  if (!heir) return { ok: false, message: "Heir not found." };
  if (heir.status === "child") return { ok: false, message: "Heir is too young. Wait until adulthood." };
  if (state.cash < TUTORING_COST) return { ok: false, message: `Needs ${TUTORING_COST.toLocaleString()} in cash.` };

  const gain = diminishedGain(4, heir.investmentCount.tutoring);
  const updatedHeir: Heir = {
    ...heir,
    aptitude: clamp(heir.aptitude + gain, 0, 100),
    investmentCount: { ...heir.investmentCount, tutoring: heir.investmentCount.tutoring + 1 },
  };

  return {
    ok: true,
    message: `${heir.name.split(" ")[0]} sharpened — aptitude +${gain.toFixed(1)}`,
    updatedHeirs: state.heirs.map((h) => (h.id === heirId ? updatedHeir : h)),
    cashDelta: -TUTORING_COST,
  };
}

export function investMentorship(state: GameState, heirId: string): InvestmentResult {
  const heir = state.heirs.find((h) => h.id === heirId);
  if (!heir) return { ok: false, message: "Heir not found." };
  if (heir.status === "child") return { ok: false, message: "Heir is too young. Wait until adulthood." };
  if (state.founder.energy < MENTORSHIP_ENERGY_COST) {
    return { ok: false, message: "Founder is too tired to mentor this month." };
  }

  const gain = diminishedGain(6, heir.investmentCount.mentorship);
  const updatedHeir: Heir = {
    ...heir,
    loyalty: clamp(heir.loyalty + gain, 0, 100),
    investmentCount: { ...heir.investmentCount, mentorship: heir.investmentCount.mentorship + 1 },
  };

  const updatedFounder: Founder = {
    ...state.founder,
    energy: clamp(state.founder.energy - MENTORSHIP_ENERGY_COST, 0, 100),
    stress: clamp(state.founder.stress + 2, 0, 100),
  };

  return {
    ok: true,
    message: `${heir.name.split(" ")[0]} mentored — loyalty +${gain.toFixed(1)}`,
    updatedHeirs: state.heirs.map((h) => (h.id === heirId ? updatedHeir : h)),
    updatedFounder,
  };
}

export function investPublicRole(state: GameState, heirId: string): InvestmentResult {
  const heir = state.heirs.find((h) => h.id === heirId);
  if (!heir) return { ok: false, message: "Heir not found." };
  if (heir.status === "child") return { ok: false, message: "Heir is too young. Wait until adulthood." };
  if (state.cash < PUBLIC_ROLE_COST) return { ok: false, message: `Needs ${PUBLIC_ROLE_COST.toLocaleString()} in cash.` };

  const gain = diminishedGain(5, heir.investmentCount.publicRole);
  const updatedHeir: Heir = {
    ...heir,
    publicAppeal: clamp(heir.publicAppeal + gain, 0, 100),
    investmentCount: { ...heir.investmentCount, publicRole: heir.investmentCount.publicRole + 1 },
  };

  return {
    ok: true,
    message: `${heir.name.split(" ")[0]} polished — public appeal +${gain.toFixed(1)}`,
    updatedHeirs: state.heirs.map((h) => (h.id === heirId ? updatedHeir : h)),
    cashDelta: -PUBLIC_ROLE_COST,
  };
}

// Reorder succession order — move heir at index `from` to index `to`
export function reorderSuccession(order: string[], from: number, to: number): string[] {
  if (from < 0 || from >= order.length || to < 0 || to >= order.length) return order;
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// ============================================================
// Constants
// ============================================================
export const DYNASTY_COSTS = {
  TUTORING: TUTORING_COST,
  PUBLIC_ROLE: PUBLIC_ROLE_COST,
  MENTORSHIP_ENERGY: MENTORSHIP_ENERGY_COST,
};
