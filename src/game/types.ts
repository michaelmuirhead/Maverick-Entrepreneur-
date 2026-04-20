// ---------- Core Types ----------
// Money is always USD whole dollars (integer cents would be overkill here).

export type ID = string;

/**
 * Top-level product domain. Drives team composition, dev timeline, TAM, revenue model
 * defaults, segment mix, pricing, competition density, and maintenance burden.
 *
 * Single source of truth for per-category metadata lives in `src/game/categories.ts`
 * as `CATEGORY_INFO`. Do not hardcode category-specific numbers anywhere else.
 */
export type ProductCategory =
  | "application"     // consumer / prosumer apps — freemium, big TAM, crowded
  | "system"          // OS, drivers, low-level tooling — one-time licensing, slow cadence
  | "enterprise"      // ERP/HRIS-style suites — contract sales, sticky, long cycles
  | "dev-tools"       // CI/CD, SDKs, APIs — subscription, loyal, prosumer-heavy
  | "custom"          // bespoke / services builds — contract, margin over scale
  | "embedded"        // IoT / firmware — one-time hardware+software bundles
  | "content-media"   // streaming / creator tools — subscription, viral, churny
  | "finance-ops"     // accounting, billing, supply chain — subscription, regulated
  | "security-it";    // MDM, SIEM, endpoint — subscription, compliance gate

/**
 * How a product monetizes its user base. Drives the revenue calculation branch
 * in `weeklyRevenue()`:
 *   subscription — classic MRR / 4.3 from all paid seats
 *   one-time     — revenue recognized on *new* sales × list price × ~annual factor
 *   contract     — enterprise seats only, quarterly lumpy payments
 *   freemium     — only the paid-conversion fraction of users generates MRR
 */
export type RevenueModel = "subscription" | "one-time" | "contract" | "freemium";

/**
 * Rich, per-category configuration. Everything the sim needs to specialize a category
 * lives here. New categories = add a row here; no other file should branch on category id.
 */
export interface CategoryInfo {
  id: ProductCategory;
  label: string;
  /** One-liner shown in the category list. */
  blurb: string;
  /** Longer description shown once a category is highlighted. */
  detail: string;

  // --- Build economics ----------------------------------------------------
  /** Baseline dev time from concept→launch in weeks at standard team size. */
  devWeeksBase: number;
  /** Minimum team size (engineers) for realistic shipping — under this, dev slows. */
  teamSizeMin: number;
  /** Relative maintenance burden post-launch. 1.0 = baseline, >1 eats more cash. */
  maintenanceBurden: number;

  // --- Market shape -------------------------------------------------------
  /** TAM multiplier. 1.0 = baseline; 1.5 = ~50% bigger market. */
  marketSize: number;
  /** Weekly organic market growth — drives demand drift. 0.015 ≈ 80%/yr growth. */
  marketGrowth: number;
  /** 0..1 competitive density. Higher = more rivals, more price pressure. */
  competitionDensity: number;

  // --- Monetization -------------------------------------------------------
  /** Default revenue model for newly-created products in this category. */
  revenueModel: RevenueModel;
  /** Suggested blended launch price — used as default pricing seed. */
  defaultPrice: number;
  /** Typical ARPU for valuing competitors in this category. $/user/month. */
  arpu: number;
  /** Default segment mix for a new product in this category. Must sum to 1. */
  segmentMix: { enterprise: number; smb: number; selfServe: number };

  // --- Naming / flavor ----------------------------------------------------
  /** Suffix pool used by the product-name generator. */
  nameSuffixes: string[];
}

/** Back-compat shape for the category picker. Derived from CATEGORY_INFO. */
export interface ProductCategoryChoice {
  id: ProductCategory;
  label: string;
  blurb: string;
  detail: string;
  suggestedPrice: number;
  revenueModel: RevenueModel;
  devWeeksBase: number;
  teamSizeMin: number;
}

// Re-exported from categories.ts for convenience so existing imports keep working.
export { PRODUCT_CATEGORIES, CATEGORY_INFO } from "./categories";

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
  /**
   * How this product monetizes. Set at creation time from category default but can be
   * overridden later (e.g. a dev-tool that pivots freemium→subscription). Revenue math
   * in `weeklyRevenue()` branches on this field.
   */
  revenueModel: RevenueModel;
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

  /**
   * Blended user total at the end of the previous tick. Used by the one-time and
   * contract revenue models to recognize revenue on *new* sales this week rather
   * than the full installed base. Populated by the tick; undefined on legacy saves.
   */
  lastWeekUserTotal?: number;
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

/**
 * Lifecycle stage for a competitor. Drives their growth curve, burn, valuation multiple,
 * and the kind of M&A activity they're likely to be involved in.
 *   scrappy  - young, small, fast-growing if healthy
 *   growth   - post-PMF, scaling users, raising big rounds
 *   mature   - plateaued leader, stable MRR
 *   declining - losing share, quality slipping
 *   acquired - no longer operating; absorbed into buyer
 *   dead     - ran out of cash without a buyer
 */
export type CompetitorStage =
  | "scrappy"
  | "growth"
  | "mature"
  | "declining"
  | "acquired"
  | "dead";

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

  // --- Lifecycle / valuation ---------------------------------------------
  /** Lifecycle stage. Undefined on legacy saves — defaulted in `withDefaults`. */
  stage?: CompetitorStage;
  /** Paid users across all their products (no segment split for rivals). */
  users?: number;
  /** Monthly recurring revenue. Drives valuation. */
  mrr?: number;
  /** Weekly user growth rate baseline (can be negative). Fluctuates with health. */
  growthRate?: number;
  /** Product quality 0..100. Drives churn and signup conversion. */
  productQuality?: number;
  /** Week the competitor was founded (approximate; just used for age flavor). */
  foundedWeek?: number;
  /** If acquired, who by. "player" or another competitor id. */
  acquiredBy?: ID | "player";
  /** Week the acquisition closed. */
  acquiredWeek?: number;
  /** Last time the player made (or a rival made) a bid on them. Used for cooldown. */
  lastOfferWeek?: number;
  /** Player cannot re-approach before this week if the last bid was rejected. */
  rejectedOfferUntil?: number;
  /** If this competitor previously offered to buy the player and was declined,
   *  they won't pitch again until this week. */
  rejectedBuyoutUntil?: number;
  /** Number of weeks the competitor has been in the red (cash < 0 tolerance). */
  distressWeeks?: number;
}

/** How aggressive an acquisition bid is relative to fair valuation. */
export type OfferTier = "lowball" | "fair" | "premium";

/**
 * Record of an acquisition. Deliberately structured so future mechanics
 * (stock portion, earnouts, integration risk, antitrust blocks) can be added
 * without changing shape — today only the "cash" structure is populated.
 */
export interface AcquisitionDeal {
  id: ID;
  week: number;
  /** "player" or a competitor id. */
  acquirerId: ID | "player";
  acquirerName: string;
  targetId: ID;
  targetName: string;
  /** Only "cash" today. "mixed" / "earnout" reserved for later features. */
  structure: "cash";
  /** Total cash consideration paid at close. */
  pricePaid: number;
  /** Fair valuation snapshot at the time of the deal — audit trail for the UI. */
  fairValuation: number;
  /** Premium ratio over fair — 0.7 lowball, 1.0 fair, 1.4 premium (can be any ratio). */
  premiumMultiple: number;
  /** One-liner the UI renders for the ticker + deal history panel. */
  narrative: string;
  // Reserved for future use, always zero/false today.
  stockPortion?: number;
  earnoutPortion?: number;
  integrationDamage?: number;
  antitrustBlocked?: boolean;
}

/**
 * An unsolicited buyout offer *to the player* from an AI competitor.
 * Generated during the weekly tick when a cash-rich rival decides the player
 * is a strategic target. Expires if not acted on before `expiresWeek`. The
 * player can either accept (triggers game-over-via-success with an "acquired"
 * reason) or decline (cooldown on that acquirer). Multiple offers can be
 * active at once — rival bidders occasionally show up within a few weeks.
 */
export interface BuyoutOffer {
  id: ID;
  /** Week the offer was generated. */
  week: number;
  /** Week at which the offer lapses if the player hasn't acted. Exclusive. */
  expiresWeek: number;
  /** The acquirer — a competitor id. */
  acquirerId: ID;
  acquirerName: string;
  /** The player's fair valuation at the time of the offer — audit trail for the UI. */
  fairValuation: number;
  /** Total cash consideration offered at close. */
  price: number;
  /** Ratio of price to fair valuation (always > 1 in practice — why bother below fair). */
  premiumMultiple: number;
  /** One-liner the UI renders. */
  narrative: string;
}

export type MarketTrendKind =
  | "ai-boom"
  | "privacy-crackdown"
  | "recession"
  | "dev-tool-renaissance"
  | "creative-surge"
  | "enterprise-freeze"
  | "security-scare"       // spikes demand for security-it, dampens application
  | "hardware-cycle"       // lifts embedded + system during refresh waves
  | "crypto-winter"        // deflates speculative-adjacent categories + finance-ops
  | "remote-work-surge"    // lifts content-media + dev-tools + application
  | "supply-shock"         // raises hardware costs, dampens embedded + system
  | "compliance-wave";     // tailwind for finance-ops + security-it, headwind for application

export interface MarketTrend {
  kind: MarketTrendKind;
  label: string;
  affects: ProductCategory[];
  /** Peak demand multiplier this trend reaches at full intensity. 1.0 = neutral. */
  demandMultiplier: number;
  startedWeek: number;
  durationWeeks: number;
  /**
   * How many weeks the trend ramps up from neutral to peak. Optional on legacy saves;
   * absent = trend hits at full intensity immediately (old behavior).
   */
  rampWeeks?: number;
  /**
   * How many weeks the trend fades from peak back to neutral at the tail end.
   * Optional on legacy saves; absent = snap-end behavior.
   */
  fadeWeeks?: number;
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

/**
 * Macro-economic phase. Slow-moving world state that biases demand, funding, churn,
 * hiring costs, and valuations for everyone at once. Persists across many weeks.
 */
export type EconomyPhase = "boom" | "stable" | "recession";

/**
 * Persistent macro state. Phase transitions are sampled weekly against a markov-ish
 * transition matrix (see economy.ts). Intensity (0..1) smooths the edges so a
 * recession takes weeks to bite fully, and a recovery takes weeks to feel real.
 */
export interface EconomyState {
  phase: EconomyPhase;
  /** 0..1 — how hard the phase hits right now. Ramps up after a phase change. */
  intensity: number;
  /** Tick week the current phase began. */
  phaseStartedWeek: number;
  /** Minimum weeks to stay in a phase before we may roll a new one. Keeps the cycle slow. */
  minDurationWeeks: number;
}

/**
 * Office tier: physical workspace the company leases. Scales from scrappy to corporate
 * and gates headcount capacity, baseline productivity, morale, and investor/recruit prestige.
 *
 * Single source of truth for per-tier numbers lives in `src/game/office.ts` as `OFFICE_TIERS`.
 */
export type OfficeTier =
  | "garage"      // the founders' apartment / parent's garage — free but capped
  | "coworking"   // hot desks, WeWork vibes — cheap, decent for small teams
  | "loft"        // your own leased space for the first time
  | "office"      // proper office with conference rooms
  | "hq"          // dedicated HQ with branding on the door
  | "campus";     // corporate campus — prestige but expensive

/** Persistent office state. Migrates in with a "garage" default for legacy saves. */
export interface OfficeState {
  tier: OfficeTier;
  /** Week the current tier was moved into. Used for "just moved" flavor. */
  sinceWeek: number;
  /** Pending upgrade that closes `readyWeek`. Undefined = no move in progress. */
  pendingUpgrade?: {
    toTier: OfficeTier;
    startedWeek: number;
    readyWeek: number;
    buildOutCost: number;   // one-time cash cost paid when upgrade started
  };
}

/** Culture / perk system. Perks are toggleable budget items that boost morale and retention. */
export type PerkKind =
  | "free-lunch"        // daily catered food
  | "gym-stipend"       // fitness reimbursement
  | "learning-budget"   // conferences / books / courses
  | "wellness-stipend"  // therapy, meditation apps
  | "parental-leave"    // paid family leave
  | "remote-flex"       // remote-first / hybrid policy
  | "unlimited-pto"     // unlimited vacation (which nobody takes)
  | "offsite-retreats"  // quarterly team trips
  | "dog-friendly"      // bring your dog to work
  | "equity-refresh";   // annual stock refresh grants

export interface CultureState {
  /** Which perks are currently enabled. Each perk has a weekly per-employee cost. */
  perks: PerkKind[];
  /**
   * Lightweight narrative metric 0..100 — the blended "culture score".
   * Derived each tick from active perks + average morale + office tier.
   * Drives: recruit signal quality, retention, PR events.
   */
  cultureScore: number;
}

/**
 * Marketing campaign — a finite, player-scheduled spend burst with a clear theme.
 * Separate from product-level `marketingBudget` (which is always-on ad spend).
 *
 * Campaigns have a ramp (awareness takes a few weeks to land), a peak, and a tail;
 * they affect signups across all products in their target category/segment for the
 * duration, and can produce their own one-off events (viral hits, PR disasters).
 */
export type MarketingChannel =
  | "social"       // TikTok / IG / X — cheap, viral potential, noisy ROI
  | "content"      // blog / SEO / podcasts — slow but compounding
  | "paid-ads"     // Google / Meta / LinkedIn — predictable CAC
  | "pr"           // press / earned media — hit-or-miss but prestige
  | "events"       // conferences / booth sponsorships — enterprise-flavored
  | "influencer";  // creator partnerships — YOLO-shaped ROI

export interface MarketingCampaign {
  id: ID;
  name: string;
  channel: MarketingChannel;
  /** Which product the campaign promotes. A campaign can only target a live product. */
  productId: ID;
  /** Total budget. Paid out evenly across `durationWeeks`. */
  budget: number;
  startedWeek: number;
  durationWeeks: number;
  /** Multiplier on signups (>1 boosts, <1 dud). Computed at creation from channel + roll. */
  peakMultiplier: number;
  /** Random performance roll sampled at creation, 0..1. Used for late-tick flavor events. */
  performanceRoll: number;
  /** Optional CAC estimate for UI. */
  estimatedCAC?: number;
}

/**
 * Customer support quality system. Single team-wide stat (not per product) driven by
 * support headcount vs. total users. Affects churn and quality-of-revenue over time.
 */
export interface SupportState {
  /** 0..100. Derived each tick from support employees / (users per thousand). */
  quality: number;
  /** Total tickets raised this week (stat used for UI + events). */
  ticketsThisWeek: number;
  /** Rolling 13-week complaint count — powers the "support collapse" warning event. */
  complaintsRecent: number;
}

/**
 * Patent / IP protection. Patents cost cash to file, take weeks to grant, and once
 * granted reduce the effectiveness of feature-clone moves by competitors.
 */
export interface Patent {
  id: ID;
  title: string;
  /** Category the patent covers — protects products in that category. */
  category: ProductCategory;
  filedWeek: number;
  /** Week the patent grants (filed + ~52 weeks). Undefined = still pending. */
  grantedWeek?: number;
  /** If granted, how many years of protection remain (ticks down). */
  yearsRemaining?: number;
  /** Total cash spent to file + prosecute. */
  cost: number;
}

/** Open-source project the company sponsors. Trades cash for brand / recruiting signal. */
export interface OpenSourceProject {
  id: ID;
  name: string;
  category: ProductCategory;
  /** 0..100 — popularity. Grows with investment; decays if underfunded. */
  stars: number;
  weeklyBudget: number;
  startedWeek: number;
}

/** Active partnership with another company (real or simulated). */
export interface Partnership {
  id: ID;
  partnerName: string;
  /** What kind of integration this is — shapes the benefit pattern. */
  kind: "integration" | "reseller" | "co-marketing" | "platform";
  /** Week the partnership began. */
  startedWeek: number;
  /** Ongoing $/week cost. Can be 0 for pure co-marketing. */
  weeklyCost: number;
  /** Peak signup boost once integration ramps in (typically 1.03..1.15). */
  signupMultiplier: number;
  /** Which product category primarily benefits. */
  benefitsCategory: ProductCategory;
}

/** Government contract — lumpy, prestigious, slow-paying. */
export interface GovernmentContract {
  id: ID;
  agency: string;
  title: string;
  /** Total contract value. Paid out in equal monthly installments over `months`. */
  totalValue: number;
  months: number;
  /** Weeks since contract award. Used to compute what's been paid so far. */
  startedWeek: number;
  /** Which product category is eligible. */
  category: ProductCategory;
  /** Required clearance tier — tougher contracts need more security/compliance posture. */
  clearance: "basic" | "cleared" | "fedramp";
}

/** Active region the company operates in. */
export type Region = "na" | "emea" | "apac" | "latam";

export interface RegionalPresence {
  region: Region;
  enteredWeek: number;
  /** Fraction of total signups routed to this region. Summed across regions ≤ 1. */
  marketCapture: number;
  /** Localization quality 0..100 — drives conversion in-region. */
  localizationScore: number;
}

/**
 * IPO posture — once the company hits Series B + enough MRR, they can pursue an IPO.
 * Progressing through stages unlocks the actual IPO action.
 */
export type IpoStage =
  | "none"           // nothing yet
  | "exploring"      // talking to banks, auditors
  | "filed"          // S-1 on file
  | "roadshow"       // meeting institutional investors
  | "public";        // trading

export interface IpoState {
  stage: IpoStage;
  /** Stage-entered week. Each stage has a minimum dwell time before you can progress. */
  stageStartedWeek: number;
  /** Offering price per share at pricing — set when you enter `public`. */
  offerPrice?: number;
  /** Current share price — drifts based on MRR growth + macro once public. */
  currentSharePrice?: number;
  /** Total shares outstanding. */
  sharesOutstanding?: number;
  /** Cash raised at IPO, booked into finance.cash on `stage -> public`. */
  proceeds?: number;
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
  /** Completed acquisitions. Most recent first, capped. */
  deals: AcquisitionDeal[];
  /** Active unsolicited buyout offers aimed at the player. Optional on legacy
   *  saves — defaults to [] at tick time. Pruned when offers expire or on
   *  accept/decline. */
  buyoutOffers?: BuyoutOffer[];
  trends: MarketTrend[];
  /** Macro-economic phase (boom/stable/recession) and its ramping intensity. */
  economy: EconomyState;
  events: GameEvent[];   // most recent first, capped

  /** Physical office. Optional on legacy saves — defaults to "garage" in migration v7. */
  office?: OfficeState;
  /** Culture & perks. Optional on legacy saves — defaults to no perks in migration v7. */
  culture?: CultureState;
  /** Live marketing campaigns. Optional on legacy saves — defaults to [] in migration v7. */
  campaigns?: MarketingCampaign[];
  /** Customer support quality metrics. Optional on legacy saves. */
  support?: SupportState;
  /** IP portfolio. Optional on legacy saves. */
  patents?: Patent[];
  /** Open-source projects we sponsor. Optional on legacy saves. */
  openSource?: OpenSourceProject[];
  /** Active partnerships. Optional on legacy saves. */
  partnerships?: Partnership[];
  /** Active + historical government contracts. Optional on legacy saves. */
  govContracts?: GovernmentContract[];
  /** Regional operations. Optional on legacy saves — defaults to [{ region: "na", ...}]. */
  regions?: RegionalPresence[];
  /** IPO state machine. Optional on legacy saves — defaults to { stage: "none" }. */
  ipo?: IpoState;

  // Game over flags
  gameOver?: { reason: "bankrupt" | "acquired" | "ipo"; week: number; narrative: string };

  // Snapshot of deltas from the most recent advanceWeek — populated by the tick
  // so the UI can show an inline week recap without a modal.
  lastTickDeltas?: { week: number; cash: number; mrr: number; users: number };

  // Version for save migrations
  schemaVersion: number;
}

export const SCHEMA_VERSION = 7;
