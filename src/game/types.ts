// ---------- Core Types ----------
// Money is always USD whole dollars (integer cents would be overkill here).

export type ID = string;

export type ProductCategory =
  | "productivity"
  | "dev-tools"
  | "analytics"
  | "crm"
  | "creative"
  | "infrastructure";

export const PRODUCT_CATEGORIES: { id: ProductCategory; label: string; blurb: string }[] = [
  { id: "productivity", label: "Productivity", blurb: "Forms, docs, scheduling — broad market, lots of competition." },
  { id: "dev-tools", label: "Dev Tools", blurb: "High-margin, loyal users, smaller TAM." },
  { id: "analytics", label: "Analytics", blurb: "Sticky enterprise spend, slow sales cycles." },
  { id: "crm", label: "CRM", blurb: "Big market, incumbents are entrenched." },
  { id: "creative", label: "Creative", blurb: "Design, video, audio — great for virality." },
  { id: "infrastructure", label: "Infrastructure", blurb: "Databases, queues, storage. Enterprise deals, hard to crack." },
];

export type ProductStage =
  | "concept"    // on the roadmap
  | "dev"        // being built
  | "beta"       // limited release
  | "launched"   // available, still gaining users
  | "mature"     // plateau, stable revenue
  | "declining"  // tech aging, losing share
  | "eol";       // sunset

export interface Product {
  id: ID;
  name: string;
  category: ProductCategory;
  stage: ProductStage;
  version: string;             // e.g. "1.0", "2.1"
  health: number;              // 0..100 — tech freshness + product-market fit
  quality: number;             // 0..100 — how well-built it was at launch, decays slowly
  users: number;               // paid + active users
  pricePerUser: number;        // $/mo per user
  devProgress: number;         // 0..100 during `dev` stage
  devBudget: number;           // $/week spent on this product's dev team
  weeksAtStage: number;
  weeksSinceLaunch: number;
  ageWeeks: number;            // total age since concept
  assignedEngineers: ID[];     // employees currently on this product
  // Launch outcome memory (for narrative + UI)
  launchBuzz?: number;         // 0..100 hype at launch
}

export type EmployeeRole = "engineer" | "designer" | "pm" | "sales" | "marketing" | "ops" | "founder";
export const ROLE_LABELS: Record<EmployeeRole, string> = {
  founder: "Founder",
  engineer: "Engineer",
  designer: "Designer",
  pm: "PM",
  sales: "Sales",
  marketing: "Marketing",
  ops: "Operations",
};

export interface Employee {
  id: ID;
  name: string;
  role: EmployeeRole;
  level: 1 | 2 | 3;            // 1=Jr, 2=Mid, 3=Sr
  salary: number;              // $/year
  skill: number;               // 0..100
  morale: number;              // 0..100
  assignedProductId?: ID;      // which product (if any)
  hiredWeek: number;
  archetype?: "technical" | "business" | "design"; // founder flavor
  equity?: number;             // 0..1 — founder only
}

export interface Competitor {
  id: ID;
  name: string;
  strength: number;            // 0..100 overall capability
  category: ProductCategory;
  marketShare: number;         // 0..1 within its category
  aggression: number;          // 0..1 likelihood to ship disruptive moves
  lastMoveWeek?: number;
}

export type MarketTrendKind =
  | "ai-boom"
  | "privacy-crackdown"
  | "recession"
  | "dev-tool-renaissance"
  | "creative-surge"
  | "enterprise-freeze";

export interface MarketTrend {
  kind: MarketTrendKind;
  label: string;
  affects: ProductCategory[];
  demandMultiplier: number;    // 1.0 = neutral
  startedWeek: number;
  durationWeeks: number;
}

export interface FundingRound {
  label: string;               // Pre-seed, Seed, Series A...
  amount: number;
  postMoney: number;
  week: number;
}

export interface Finance {
  cash: number;
  mrr: number;                 // derived but cached for charts
  weeklyRevenueHistory: number[]; // last N weeks MRR snapshots (weekly)
  weeklyBurnHistory: number[];    // last N weeks spend
  rounds: FundingRound[];
}

export type EventSeverity = "good" | "warn" | "bad" | "info";

export interface GameEvent {
  id: ID;
  week: number;
  severity: EventSeverity;
  message: string;             // playfully serious narrative copy
  amount?: number;             // $ delta if financial
  relatedProductId?: ID;
  relatedEmployeeId?: ID;
}

export interface CompanyState {
  name: string;
  founded: { year: number; quarter: number };
  stage: "pre-seed" | "seed" | "series-a" | "series-b";
}

export interface GameState {
  seed: string;
  // Time: discrete week counter; week 0 = day 1.
  week: number;
  year: number;
  quarter: 1 | 2 | 3 | 4;

  company: CompanyState;
  finance: Finance;

  products: Product[];
  employees: Employee[];
  competitors: Competitor[];
  trends: MarketTrend[];
  events: GameEvent[];   // most recent first, capped

  // Game over flags
  gameOver?: { reason: "bankrupt" | "acquired" | "ipo"; week: number; narrative: string };

  // Version for save migrations
  schemaVersion: number;
}

export const SCHEMA_VERSION = 1;
