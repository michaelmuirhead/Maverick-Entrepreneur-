/**
 * Studio init — build a brand-new GameStudioState from a NewStudioConfig.
 *
 * Mirrors src/game/init.ts (which builds SaaS GameStates) so the two verticals
 * slot into the EntrepreneurState as siblings with matching conventions:
 *   - seed-as-id, so `ventureId(v)` is stable across saves.
 *   - Week 0, Year 1, Quarter 1 start.
 *   - Shared subsystems (office, culture, support) use the same defaults.
 *   - Founder + cofounder are seeded at level 3 with archetype-flavored skill.
 */

import type { RNG } from "../rng";
import { makeRng, makeIdGen } from "../rng";
import { initEconomy } from "../economy";
import { initOffice } from "../office";
import { initCulture } from "../culture";
import { initSupport } from "../support";
import type { Employee, GameEvent } from "../types";
import { initGenreTrends } from "./platforms";
import type {
  GameStudioState, StudioCompanyState, GameScope, GameGenre, CompetitorStudio,
} from "./types";

// =====================================================================================
// Name pools (flavor-only — repeat some names from SaaS init for consistency)
// =====================================================================================

const FIRST_NAMES = [
  "Maya", "Raj", "Ava", "Jordan", "Kai", "Sana", "Noor", "Leo", "Priya", "Dario",
  "Chen", "Elif", "Tomas", "Imani", "Yuki", "Alex", "Sam", "Rina", "Theo", "Zaid",
];
const LAST_NAMES = [
  "Chen", "Patel", "Okafor", "Ruiz", "Lindqvist", "Hassan", "Nakamura", "Fiorentino",
  "Kim", "O'Neill", "Adebayo", "Volkov", "Singh", "Haddad", "Marino",
];
const RIVAL_STUDIO_NAMES = [
  "Obsidian Moth", "Ironpine Games", "Hollow Pixel", "Sparrowmark",
  "Breakline Studios", "Tidelight", "Quarry Nine", "Grave Robot",
  "Signal Six", "Lantern Works", "Driftkey", "Parsec Crow",
  "Blackfin Labs", "Kindling Collective", "Oversea Games",
];

function randomName(rng: RNG): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

// =====================================================================================
// Config
// =====================================================================================

export interface NewStudioConfig {
  companyName: string;
  founderName: string;
  archetype: "technical" | "business" | "design";
  startingCash: "lean" | "bootstrapped" | "angel-backed";
  /** Genre the studio is best known for — flavor only for now. */
  signatureGenre: GameGenre;
  /** Ambition level — drives the default scope of new projects. */
  defaultScope: GameScope;
  /** Optional seed — if omitted, one is generated. Must be globally unique across ventures. */
  seed?: string;
}

function startingCashAmount(c: NewStudioConfig["startingCash"]): number {
  switch (c) {
    case "lean":          return 35_000;
    case "bootstrapped":  return 120_000;
    case "angel-backed":  return 500_000;
  }
}

// =====================================================================================
// Factory
// =====================================================================================

/** Build a fresh GameStudioState from a NewStudioConfig. Pure + deterministic from seed. */
export function newStudio(config: NewStudioConfig): GameStudioState {
  const seed = config.seed ?? `studio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rng = makeRng(seed);
  const newId = makeIdGen(rng);

  // --- Founder ---
  const founder: Employee = {
    id: newId("e"),
    name: config.founderName,
    role: "founder",
    level: 3,
    salary: 0,
    skill:
      config.archetype === "technical" ? 78 :
      config.archetype === "business" ? 60 : 68,
    morale: 90,
    hiredWeek: 0,
    archetype: config.archetype,
    equity: 0.65,
  };

  // --- Cofounder — studios lean engineer + designer more than sales. ---
  const cofounderRole = config.archetype === "technical" ? "designer" : "engineer";
  const cofounder: Employee = {
    id: newId("e"),
    name: randomName(rng),
    role: cofounderRole,
    level: 3,
    salary: 0,
    skill: 72,
    morale: 88,
    hiredWeek: 0,
    equity: 0.35,
  };

  // --- Rival studios: 4 indie/AA + 1 AAA whale, flagshipped across varied genres ---
  const usedNames = new Set<string>();
  const rivalGenres: GameGenre[] = rng.weighted([
    { item: config.signatureGenre, weight: 3 }, // rivals in your lane
    { item: "rpg", weight: 1 },
    { item: "strategy", weight: 1 },
    { item: "fps", weight: 1 },
  ]) === config.signatureGenre
    ? [config.signatureGenre, "rpg", "strategy", "fps", "narrative"]
    : ["rpg", "strategy", "fps", "sim", "narrative"];

  const rivals: CompetitorStudio[] = [];
  for (let i = 0; i < 4; i++) {
    let name = rng.pick(RIVAL_STUDIO_NAMES);
    while (usedNames.has(name)) name = rng.pick(RIVAL_STUDIO_NAMES);
    usedNames.add(name);
    rivals.push({
      id: newId("rival"),
      name,
      flagshipGenre: rivalGenres[i % rivalGenres.length],
      scope: rng.weighted([
        { item: "indie" as GameScope, weight: 3 },
        { item: "AA" as GameScope, weight: 2 },
      ]),
      reputation: rng.int(30, 65),
      aggression: rng.range(0.2, 0.7),
      cash: rng.int(150_000, 900_000),
      headcount: rng.int(6, 28),
      stage: rng.pick(["indie", "growing", "established"] as const),
    });
  }
  // One AAA heavyweight to add prestige pressure.
  let whale = rng.pick(RIVAL_STUDIO_NAMES);
  while (usedNames.has(whale)) whale = rng.pick(RIVAL_STUDIO_NAMES);
  rivals.push({
    id: newId("rival"),
    name: whale,
    flagshipGenre: "fps",
    scope: "AAA",
    reputation: rng.int(70, 90),
    aggression: rng.range(0.3, 0.6),
    cash: rng.int(20_000_000, 80_000_000),
    headcount: rng.int(200, 600),
    stage: "established",
  });

  const company: StudioCompanyState = {
    name: config.companyName,
    founded: { year: 1, quarter: 1 },
    stage: config.startingCash === "angel-backed" ? "seed" : "pre-seed",
    defaultScope: config.defaultScope,
    signatureGenre: config.signatureGenre,
  };

  const cash = startingCashAmount(config.startingCash);
  const openingEvent: GameEvent = {
    id: newId("ev"),
    week: 0,
    severity: "good",
    message: `${config.companyName} is incorporated. First pitch on the board: ${config.signatureGenre}, ${config.defaultScope}.`,
  };

  return {
    kind: "game-studio",
    seed,
    week: 0,
    year: 1,
    quarter: 1,
    company,
    finance: {
      cash,
      mrr: 0,
      weeklyRevenueHistory: [],
      weeklyBurnHistory: [],
      rounds: config.startingCash === "angel-backed"
        ? [{ label: "Angel", amount: 500_000, postMoney: 3_000_000, week: 0 }]
        : [],
    },
    games: [],
    archivedGames: [],
    employees: [founder, cofounder],
    competitorStudios: rivals,
    economy: initEconomy(),
    genreTrends: initGenreTrends(rng, 0),
    showcases: [],
    platformOffers: [],
    trends: [],
    events: [openingEvent],
    office: initOffice(),
    culture: initCulture(),
    support: initSupport(),
    schemaVersion: 7, // per-venture schema version (matches SaaS SCHEMA_VERSION)
  };
}
