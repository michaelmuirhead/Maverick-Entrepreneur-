// ============================================================
// Phase 3.3 — Legacy Score & Eulogy Generation
// ============================================================
// Multi-dimensional scoring for a completed dynasty and the narrative
// paragraphs that describe what they accomplished.

import type {
  GameState,
  LegacyBreakdown,
  LegacyTier,
  Gravestone,
  ReignRecord,
} from "@/types";

// ============================================================
// TIER CLASSIFICATION
// ============================================================

export function classifyLegacyTier(total: number): LegacyTier {
  if (total >= 1000) return "rockefeller_tier";
  if (total >= 750) return "written_into_history";
  if (total >= 500) return "institution";
  if (total >= 300) return "household_name";
  if (total >= 150) return "regional_name";
  if (total >= 50) return "remembered_locally";
  return "forgotten";
}

export const LEGACY_TIER_LABELS: Record<LegacyTier, string> = {
  forgotten: "Forgotten",
  remembered_locally: "Remembered locally",
  regional_name: "A regional name",
  household_name: "A household name",
  institution: "An institution",
  written_into_history: "A dynasty written into history",
  rockefeller_tier: "Rockefeller-tier",
};

// One-line descriptor per tier — used as a subtitle on the eulogy screen
export const LEGACY_TIER_DESCRIPTORS: Record<LegacyTier, string> = {
  forgotten: "The file will be misplaced within a decade.",
  remembered_locally: "The neighborhood remembers. Little else does.",
  regional_name: "A name with weight in a handful of cities, nowhere else.",
  household_name: "Recognized in the grocery aisle. Trusted at the bank.",
  institution: "A pillar. The kind of business textbooks cite for a paragraph.",
  written_into_history: "The chapter will have footnotes. The footnotes will have detractors.",
  rockefeller_tier: "The name will outlast the buildings it started in.",
};

// ============================================================
// SCORE COMPUTATION
// ============================================================

export function computeLegacyScore(state: GameState): LegacyBreakdown {
  // Financial: peak net worth. $1M → 1pt, $100M → 100pts, capped at 200
  const peak = Math.max(state.peakNetWorth, netWorthNow(state));
  const financial = Math.min(200, Math.round(peak / 1_000_000));

  // Brand: average brand strength across companies (current + historical proxy)
  const activeBrand =
    state.companies.length > 0
      ? state.companies.reduce((s, c) => s + c.brandStrength, 0) /
        state.companies.length
      : 0;
  const brand = Math.min(100, Math.round(activeBrand));

  // Rivals defeated: 10 pts each, capped at 80
  const rivals = Math.min(80, state.rivalsDefeated.length * 10);

  // Political: average stakeholder reputation
  const stakeholderAvg =
    Object.values(state.stakeholders).reduce((s, v) => s + v, 0) /
    Object.keys(state.stakeholders).length;
  const political = Math.min(80, Math.round(stakeholderAvg * 0.8));

  // Generational: big scaling — 25 pts per completed reign, plus 25 for current
  const generational = Math.min(200, state.generation * 25);

  // Dignity: bonuses for peaceful transitions
  const steppedDownCount = state.dynastyHistory.filter(
    (r) => r.endReason === "stepped_down"
  ).length;
  const diedOfOldAge = state.dynastyHistory.filter(
    (r) => r.endReason === "died" && r.ageAtEnd >= 75
  ).length;
  const dignity =
    Math.min(80, steppedDownCount * 25 + diedOfOldAge * 15);

  // Breadth: unique industries × 15, cities × 5
  const breadth =
    Math.min(100, state.industriesEntered.length * 15 + state.citiesEntered.length * 5);

  // Succession clarity: 10 per peaceful handoff where order was drafted
  const succession = Math.min(
    60,
    state.dynastyHistory.filter((r) => r.endReason === "stepped_down").length * 10
  );

  const total = Math.min(
    1000,
    financial + brand + rivals + political + generational + dignity + breadth + succession
  );
  const tier = classifyLegacyTier(total);

  return {
    total,
    tier,
    tierLabel: LEGACY_TIER_LABELS[tier],
    components: {
      financial,
      brand,
      rivals,
      political,
      generational,
      dignity,
      breadth,
      succession,
    },
  };
}

function netWorthNow(state: GameState): number {
  const propertyValue = state.properties.reduce((s, p) => s + p.currentValue, 0);
  return state.cash + propertyValue - state.debt - state.securedDebt;
}

// ============================================================
// EULOGY NARRATIVE GENERATION
// ============================================================

// Generate 2-3 short paragraphs describing the dynasty's arc.
// Data-driven with template assembly — no free-form prose.
export function generateEulogyParagraphs(state: GameState, legacy: LegacyBreakdown): string[] {
  const paragraphs: string[] = [];

  const firstFounder = state.dynastyHistory[0]?.founderName ?? state.founder.name;
  const lastFounder = state.founder.name;
  const surname = extractSurname(firstFounder);
  const generations = state.generation;
  const startYear = state.startYear;
  const endYear = startYear + Math.floor(state.month / 12);
  const yearsSpanned = endYear - startYear;

  // Paragraph 1: the arc
  if (generations === 1) {
    paragraphs.push(
      `The ${surname} name was made and unmade in a single lifetime. ${firstFounder} founded the firm in ${startYear}. By ${endYear}, the empire was gone. ${yearsSpanned} years of building, and no one to carry the name forward.`
    );
  } else {
    const priorNames = state.dynastyHistory.map((r) => r.founderName);
    const fullLine = [...priorNames, lastFounder];
    let reignsLine: string;
    if (fullLine.length === 2) {
      reignsLine = `${fullLine[0]}, and then ${fullLine[1]}`;
    } else {
      const body = fullLine.slice(0, -1).join(", ");
      reignsLine = `${body}, and finally ${fullLine[fullLine.length - 1]}`;
    }
    paragraphs.push(
      `The ${surname} dynasty spanned ${generations} generations and ${yearsSpanned} years, from ${startYear} to ${endYear}. The name passed from ${reignsLine}.`
    );
  }

  // Paragraph 2: the scope
  const peakNet = Math.max(state.peakNetWorth, netWorthNow(state));
  const scopeSentences: string[] = [];

  if (state.industriesEntered.length > 0 || state.citiesEntered.length > 0) {
    const reach: string[] = [];
    if (state.industriesEntered.length > 0) {
      reach.push(
        `${state.industriesEntered.length} ${state.industriesEntered.length === 1 ? "industry" : "industries"}`
      );
    }
    if (state.citiesEntered.length > 0) {
      reach.push(
        `${state.citiesEntered.length} ${state.citiesEntered.length === 1 ? "city" : "cities"}`
      );
    }
    scopeSentences.push(`At its height, the empire reached into ${reach.join(" and ")}.`);
  }

  if (state.rivalsDefeated.length > 0) {
    scopeSentences.push(
      state.rivalsDefeated.length === 1
        ? `One rival was outlasted along the way.`
        : `${state.rivalsDefeated.length} rivals were outlasted along the way.`
    );
  }

  scopeSentences.push(`Peak net worth: $${formatBigMoney(peakNet)}.`);
  scopeSentences.push(describeBrandLevel(legacy.components.brand));

  paragraphs.push(scopeSentences.join(" "));

  // Paragraph 3: the verdict
  const descriptor = LEGACY_TIER_DESCRIPTORS[legacy.tier];
  paragraphs.push(`${descriptor} ${describeDignity(state)}`);

  return paragraphs;
}

function extractSurname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}

function formatBigMoney(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n.toLocaleString()}`;
}

function describeBrandLevel(brand: number): string {
  if (brand >= 80) return "The name was known from coast to coast.";
  if (brand >= 60) return "The name carried weight in every room the founders walked into.";
  if (brand >= 40) return "Regulars knew it. Elsewhere, no one did.";
  if (brand >= 20) return "The brand was mostly the sign above the door.";
  return "The brand never quite arrived.";
}

function describeDignity(state: GameState): string {
  const peacefulExits = state.dynastyHistory.filter(
    (r) => r.endReason === "stepped_down"
  ).length;
  const suddenExits = state.dynastyHistory.filter(
    (r) => r.endReason === "died" && r.ageAtEnd < 70
  ).length;

  if (peacefulExits >= state.dynastyHistory.length && peacefulExits > 0) {
    return "Every founder chose their moment. Nothing was taken; everything was given.";
  }
  if (suddenExits >= 2) {
    return "Death took more than one of them in their prime. What they built, they never quite got to finish.";
  }
  if (state.defectedHeirs.some((d) => d.outcome === "became_rival")) {
    return "Family splintered. Blood became competitor. The name divided.";
  }
  return "The dynasty did what dynasties do: it built, it held, and eventually it passed.";
}

// ============================================================
// GRAVESTONE CONSTRUCTION
// ============================================================

export function buildGravestone(state: GameState, endReason: Gravestone["endReason"]): Gravestone {
  const legacy = computeLegacyScore(state);
  const eulogy = generateEulogyParagraphs(state, legacy);

  const firstFounder = state.dynastyHistory[0]?.founderName ?? state.founder.name;
  const surname = extractSurname(firstFounder);

  const reignSummaries = state.dynastyHistory.map((r: ReignRecord) => {
    const endStr =
      r.endReason === "died"
        ? `died at ${r.ageAtEnd}`
        : r.endReason === "stepped_down"
        ? `stepped down at ${r.ageAtEnd}`
        : "ongoing";
    return `${r.founderName} (gen ${r.generation}) — ${endStr}, peak cash $${formatBigMoney(r.peakCash)}`;
  });

  // Include the current (final) founder as the last reign
  reignSummaries.push(
    `${state.founder.name} (gen ${state.generation}) — final reign`
  );

  return {
    id: `grave_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
    surname,
    firstFounder,
    lastFounder: state.founder.name,
    yearFounded: state.startYear,
    yearEnded: state.startYear + Math.floor(state.month / 12),
    generations: state.generation,
    endReason,
    legacy,
    reignSummaries,
    eulogyParagraphs: eulogy,
  };
}

// ============================================================
// LOCALSTORAGE PERSISTENCE
// ============================================================

const GRAVESTONES_KEY = "maverick_gravestones_v1";

export function loadGravestones(): Gravestone[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(GRAVESTONES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Gravestone[];
  } catch {
    return [];
  }
}

export function saveGravestone(g: Gravestone): void {
  if (typeof localStorage === "undefined") return;
  const existing = loadGravestones();
  existing.push(g);
  // Keep last 20
  const trimmed = existing.slice(-20);
  try {
    localStorage.setItem(GRAVESTONES_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage errors
  }
}

export function clearGravestones(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(GRAVESTONES_KEY);
  } catch {
    // ignore
  }
}
