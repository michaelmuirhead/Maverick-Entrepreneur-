import {
  CompanyState, Competitor, Employee, GameState, Product, ProductCategory, SCHEMA_VERSION,
} from "./types";
import { makeIdGen, makeRng, RNG } from "./rng";
import { ZERO_USERS, derivePricing } from "./segments";

// Name pools for procedural generation
const FIRST_NAMES = [
  "Maya", "Raj", "Ava", "Jordan", "Kai", "Sana", "Noor", "Leo", "Priya", "Dario",
  "Chen", "Elif", "Tomas", "Imani", "Yuki", "Alex", "Sam", "Rina", "Theo", "Zaid",
];
const LAST_NAMES = [
  "Chen", "Patel", "Okafor", "Ruiz", "Lindqvist", "Hassan", "Nakamura", "Fiorentino",
  "Kim", "O'Neill", "Adebayo", "Volkov", "Singh", "Haddad", "Marino",
];
const COMPETITOR_NAMES = [
  "Flowstate", "Nimbus Labs", "Quantive", "Loomworks", "Helix", "Prismatic",
  "Acuity", "Kestrel", "Northbeam", "Meridian", "Oakline", "Silvercliff",
  "Plume", "Outerloop", "Covalent", "Arclight",
];

export interface NewGameConfig {
  companyName: string;
  founderName: string;
  archetype: "technical" | "business" | "design";
  startingCash: "lean" | "bootstrapped" | "angel-backed";
  startingCategory: ProductCategory;
  /** Optional seed — if omitted, one is generated. */
  seed?: string;
}

function randomName(rng: RNG): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

function startingCashAmount(c: NewGameConfig["startingCash"]): number {
  // Balanced from sim data: lean stays scrappy/near-impossible, bootstrapped now has a
  // real (if narrow) shot at surviving past launch with vNext + retention costs layered in,
  // angel-backed is the standard difficulty.
  switch (c) {
    case "lean":         return 25_000;
    case "bootstrapped": return 90_000;
    case "angel-backed": return 250_000;
  }
}

/** Build a fresh GameState from a NewGameConfig. */
export function newGame(config: NewGameConfig): GameState {
  const seed = config.seed ?? `seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rng = makeRng(seed);
  const newId = makeIdGen(rng);

  // --- Founder ---
  const founder: Employee = {
    id: newId("e"),
    name: config.founderName,
    role: "founder",
    level: 3,
    salary: 0, // founders don't pay themselves yet
    // Archetype pushes starting skill in a direction
    skill:
      config.archetype === "technical" ? 78 :
      config.archetype === "business" ? 60 : 65,
    morale: 90,
    hiredWeek: 0,
    archetype: config.archetype,
    equity: 1.0,
  };

  // --- Cofounder (always 1 for the prototype) ---
  const cofounderArch = config.archetype === "technical" ? "business" : "technical";
  const cofounder: Employee = {
    id: newId("e"),
    name: randomName(rng),
    role: cofounderArch === "technical" ? "engineer" : "sales",
    level: 3,
    salary: 0,
    skill: 70,
    morale: 88,
    hiredWeek: 0,
    equity: 0.35,
  };
  // Adjust founder equity when splitting
  founder.equity = 0.65;

  // --- First product concept in chosen category ---
  const firstProductName = suggestProductName(config.startingCategory, rng);
  const firstProduct: Product = {
    id: newId("p"),
    name: firstProductName,
    category: config.startingCategory,
    stage: "concept",
    version: "0.1",
    health: 80,
    quality: 60,
    users: { ...ZERO_USERS },
    pricing: derivePricing(defaultPrice(config.startingCategory)),
    devProgress: 0,
    devBudget: 0,
    marketingBudget: 0,
    weeksAtStage: 0,
    weeksSinceLaunch: 0,
    ageWeeks: 0,
    assignedEngineers: [cofounder.role === "engineer" ? cofounder.id : founder.id],
    lifetimeRevenue: 0,
    lifetimeCost: 0,
    lifetimeDevCost: 0,
    lifetimeMarketingCost: 0,
    peakUsers: 0,
    peakMrr: 0,
    techDebt: 0,
  };

  // --- Competitors: 3 in your category, 2 adjacent ---
  const competitors: Competitor[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const name = pickUnique(COMPETITOR_NAMES, usedNames, rng);
    competitors.push({
      id: newId("c"),
      name,
      strength: rng.int(35, 75),
      category: config.startingCategory,
      marketShare: rng.range(0.05, 0.2),
      aggression: rng.range(0.2, 0.7),
    });
  }
  const adjacent = rotateCategory(config.startingCategory, rng);
  for (let i = 0; i < 2; i++) {
    competitors.push({
      id: newId("c"),
      name: pickUnique(COMPETITOR_NAMES, usedNames, rng),
      strength: rng.int(30, 70),
      category: adjacent,
      marketShare: rng.range(0.03, 0.15),
      aggression: rng.range(0.1, 0.5),
    });
  }

  const company: CompanyState = {
    name: config.companyName,
    founded: { year: 1, quarter: 1 },
    stage: config.startingCash === "angel-backed" ? "seed" : "pre-seed",
  };

  const cash = startingCashAmount(config.startingCash);
  const state: GameState = {
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
        ? [{ label: "Angel", amount: 250_000, postMoney: 2_000_000, week: 0 }]
        : [],
    },
    products: [firstProduct],
    archivedProducts: [],
    employees: [founder, cofounder],
    competitors,
    trends: [],
    events: [{
      id: newId("ev"),
      week: 0,
      severity: "info",
      message: `${config.companyName} is officially incorporated. You and ${cofounder.name} split ${Math.round(founder.equity! * 100)}/${Math.round(cofounder.equity! * 100)}. The hard part starts now.`,
    }],
    schemaVersion: SCHEMA_VERSION,
  };

  return state;
}

function pickUnique(pool: readonly string[], used: Set<string>, rng: RNG): string {
  for (let i = 0; i < 32; i++) {
    const name = rng.pick(pool);
    if (!used.has(name)) { used.add(name); return name; }
  }
  // Fallback: append a number
  const name = `${rng.pick(pool)} ${rng.int(2, 9)}`;
  used.add(name);
  return name;
}

function defaultPrice(cat: ProductCategory): number {
  switch (cat) {
    case "productivity": return 12;
    case "dev-tools":    return 29;
    case "analytics":    return 49;
    case "crm":          return 35;
    case "creative":     return 15;
    case "infrastructure": return 99;
  }
}

function rotateCategory(cat: ProductCategory, rng: RNG): ProductCategory {
  const all: ProductCategory[] = ["productivity","dev-tools","analytics","crm","creative","infrastructure"];
  const others = all.filter(c => c !== cat);
  return rng.pick(others);
}

const NAME_PREFIXES = ["Quick", "Pulse", "Flux", "Orbit", "Lumen", "Echo", "Stack", "Forge", "Nova", "Atlas"];
const NAME_SUFFIXES_BY_CAT: Record<ProductCategory, string[]> = {
  productivity:   ["Forms", "Docs", "Flow", "Space", "Planner"],
  "dev-tools":    ["Build", "Runner", "Shell", "CI", "Stack"],
  analytics:      ["Insights", "Metrics", "Beam", "Scope", "Signal"],
  crm:            ["CRM", "Pipeline", "Deal", "Contact", "Lead"],
  creative:       ["Studio", "Frame", "Canvas", "Compose", "Scene"],
  infrastructure: ["DB", "Queue", "Edge", "Fabric", "Relay"],
};
export function suggestProductName(cat: ProductCategory, rng: RNG): string {
  return `${rng.pick(NAME_PREFIXES)}${rng.pick(NAME_SUFFIXES_BY_CAT[cat])}`;
}
