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

export const PRODUCT_CATEGORIES: {
  id: ProductCategory;
  label: string;
  /** One-liner shown in the category list. */
  blurb: string;
  /** Longer description shown once a category is highlighted. */
  detail: string;
  /** Rough suggested monthly price point, used as a default. */
  suggestedPrice: number;
}[] = [
  { id: "productivity", label: "Productivity",
    blurb: "Forms, docs, scheduling — broad market, lots of competition.",
    detail: "Tools that help people and teams plan, collaborate, and ship work. Largest TAM by a mile; also the most crowded category. Expect heavy price pressure but fast word-of-mouth when a product clicks.",
    suggestedPrice: 12 },
  { id: "dev-tools", label: "Dev Tools",
    blurb: "High-margin, loyal users, smaller TAM.",
    detail: "Build tools, CI/CD, editors, runners, APIs. Developers pay well for quality and hate switching — but you have to impress them first. Viral among engineering teams, slower to climb in revenue.",
    suggestedPrice: 29 },
  { id: "analytics", label: "Analytics",
    blurb: "Sticky enterprise spend, slow sales cycles.",
    detail: "Dashboards, metrics, BI, event tracking. Customers stick around for years once wired in, but sales take months and enterprise wants custom everything. Big contracts, patient founders win.",
    suggestedPrice: 49 },
  { id: "crm", label: "CRM",
    blurb: "Big market, incumbents are entrenched.",
    detail: "Sales pipelines, contacts, deal management. Huge market, but Salesforce and HubSpot cast long shadows. A sharp vertical focus beats a general-purpose play. Retention is decent once you're embedded.",
    suggestedPrice: 35 },
  { id: "creative", label: "Creative",
    blurb: "Design, video, audio — great for virality.",
    detail: "Canvas tools, video editors, audio mixers, design systems. Consumers and prosumers drive growth; the output is inherently shareable, which drives free acquisition. Churn can be rough if the tool feels like a toy.",
    suggestedPrice: 15 },
  { id: "infrastructure", label: "Infrastructure",
    blurb: "Databases, queues, storage. Enterprise deals, hard to crack.",
    detail: "Databases, queues, edge compute, observability, storage. Highest ARR per customer but the longest sales cycles. Security reviews, compliance, and 99.99% SLAs come standard. Not for the impatient.",
    suggestedPrice: 99 },
];

export type ProductStage =
  | "concept"    // on the roadmap
  | "dev"        // being built
  | "beta"       // limited release
  | "launched"   // available, still gaining users
  | "mature"     // plateau, stable revenue
  | "declining"  // tech aging, losing share
  | "eol";       // sunset

/** A customer segment. Products sell to multiple segments with different economics. */
export type CustomerSegment = "enterprise" | "smb" | "selfServe";

/** Paid user count split by segment. Total = enterprise + smb + selfServe. */
export interface SegmentedUsers {
  enterprise: number;
  smb: number;
  selfServe: number;
}

/** $/month per seat, quoted per segment. Enterprise deals command ~10x the self-serve price. */
export interface SegmentedPricing {
  enterprise: number;
  smb: number;
  selfServe: number;
}

export interface Product {
  id: ID;
  name: string;
  category: ProductCategory;
  stage: ProductStage;
  version: string;             // e.g. "1.0", "2.1"
  health: number;              // 0..100 — tech freshness + product-market fit
  quality: number;             // 0..100 — how well-built it was at launch, decays slowly
  users: SegmentedUsers;       // paid + active users, per segment
  pricing: SegmentedPricing;   // $/mo per seat, per segment
  devProgress: number;         // 0..100 during `dev` stage
  devBudget: number;           // $/week spent on this product's dev team
  marketingBudget: number;     // $/week spent on ads/content/brand — only matters post-launch
  weeksAtStage: number;
  weeksSinceLaunch: number;
  ageWeeks: number;            // total age since concept
  assignedEngineers: ID[];     // employees currently on this product
  // Launch outcome memory (for narrative + UI)
  launchBuzz?: number;         // 0..100 hype at launch
  launchedWeek?: number;       // week the product first hit "launched"

  // Lifetime tallies — accumulated each tick so we can build an archive post-mortem.
  lifetimeRevenue: number;     // $ earned across every week live
  lifetimeCost: number;        // $ spent on dev + maintenance + marketing across entire life
  lifetimeDevCost: number;     // $ spent specifically on dev (including vNext dev)
  lifetimeMarketingCost: number; // $ spent on marketing across entire life
  peakUsers: number;           // highest user count (any segment blend) ever
  peakMrr: number;             // highest blended MRR ever

  // Technical debt — 0 is a pristine codebase, 100 is "everything's on fire and nothing works."
  // Accumulates during rushed dev, vNext sprints, and slow drift post-launch. Slows velocity,
  // bumps churn, and eats product health above threshold. Paid down by refactor sprints,
  // shipping a vNext, and having PMs / designers on the team.
  techDebt: number;            // 0..100
  /** Week the current refactor sprint ends. Undefined = no sprint. */
  refactorSprintUntil?: number;

  // v2 / vN development — a next version being built on top of a launched product.
  // When ready, it bumps the major version, restores health, and boosts quality and users.
  nextVersion?: {
    targetVersion: string;     // e.g. "2.0", "3.0"
    progress: number;          // 0..100
    startedWeek: number;
    devBudget: number;         // $/week earmarked for the vN build
  };
}

/** Post-mortem snapshot written when a product is closed (sunset or naturally EOL'd). */
export interface ArchivedProduct {
  id: ID;
  name: string;
  category: ProductCategory;
  finalVersion: string;
  launchedWeek?: number;       // when it first went live (if it ever did)
  archivedWeek: number;        // when it closed
  ageWeeks: number;            // total life span

  /** Why it closed. "sunset" = player pulled the plug. "decayed" = auto-EOL from health/user collapse. */
  closedReason: "sunset" | "decayed" | "preLaunch";

  // Stats
  peakUsers: number;
  peakMrr: number;
  lifetimeRevenue: number;
  lifetimeCost: number;
  lifetimeDevCost: number;
  lifetimeMarketingCost: number;

  finalUsers: SegmentedUsers;
  finalHealth: number;
  finalQuality: number;

  /** Human-readable one-liner the UI renders; "Hit / Solid / Meh / Flop" pill. */
  verdict: "hit" | "solid" | "meh" | "flop" | "stillborn";
  narrative: string;
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

  // Retention / exit state ---
  /** Why the employee is on notice: poached by a rival, resigned on their own, or got a competing offer. */
  noticeReason?: "poached" | "resigned" | "offer";
  /** Tick week this employee's notice ends and they walk. */
  noticeEndsWeek?: number;
  /** Who tried to poach them (competitor id). */
  poacherId?: ID;
  /** Number of retention "saves" the player has used — each one bumps the cost of the next. */
  retentionSaves?: number;
}

/** Rival company personality — shapes the moves they make each week. */
export type CompetitorPersonality =
  | "aggressive"     // frequent feature strikes, price cuts, hostile poaching
  | "well-funded"    // slower but heavy — big product launches, aggressive hiring
  | "scrappy"        // unpredictable — viral campaigns, surprise launches, niche wins
  | "enterprise";    // quiet but strong — marquee logos, long sales cycles

export interface Competitor {
  id: ID;
  name: string;
  strength: number;            // 0..100 overall capability
  category: ProductCategory;
  marketShare: number;         // 0..1 within its category
  aggression: number;          // 0..1 likelihood to ship disruptive moves
  lastMoveWeek?: number;
  /** Strategic archetype. If absent, legacy competitor from old save — defaults applied at runtime. */
  personality?: CompetitorPersonality;
  /** Simulated cash — drives how big a move they can make. */
  cash?: number;
  /** Simulated headcount — drives launch cadence and poaching success. */
  headcount?: number;
  /** Stage on the fundraising ladder, similar to player. Controls when they can raise next. */
  fundingStage?: "pre-seed" | "seed" | "series-a" | "series-b";
  /** Most recent round week, used for cooldowns. */
  lastFundingWeek?: number;
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
  /** Products that have been closed out. Rendered in a separate "Graveyard" / "Archive" view. */
  archivedProducts: ArchivedProduct[];
  employees: Employee[];
  competitors: Competitor[];
  trends: MarketTrend[];
  events: GameEvent[];   // most recent first, capped

  // Game over flags
  gameOver?: { reason: "bankrupt" | "acquired" | "ipo"; week: number; narrative: string };

  // Snapshot of deltas from the most recent advanceWeek — populated by the tick
  // so the UI can show an inline week recap without a modal.
  lastTickDeltas?: { week: number; cash: number; mrr: number; users: number };

  // Version for save migrations
  schemaVersion: number;
}

export const SCHEMA_VERSION = 3;
