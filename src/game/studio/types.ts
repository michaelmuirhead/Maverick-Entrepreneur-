/**
 * Video Game Studio vertical — all types specific to the studio sim.
 *
 * Studio state is stored alongside the existing SaaS GameState in an
 * EntrepreneurState wrapper (see src/game/entrepreneur.ts). This file defines
 * everything the studio sim needs: genres, platforms, games, hype, reviews,
 * crunch, live-service, DLC, platform deals, showcases, and genre trends.
 *
 * Shared types (Employee, Finance, GameEvent, CompanyState, OfficeState,
 * CultureState, SupportState, IpoState) are imported from the main types
 * module so a studio's team, finance, events, and cross-vertical mechanics
 * all look the same as the SaaS sim.
 */

import type {
  CompanyState, CultureState, EconomyState, Employee, Finance, GameEvent,
  ID, IpoState, MarketTrend, OfficeState, SupportState,
} from "../types";

// =====================================================================================
// Genre taxonomy
// =====================================================================================

/**
 * Game genres. Each carries different dev economics, audience size, review
 * weights, and live-service viability. Single source of truth for per-genre
 * numbers lives in src/game/studio/genres.ts (GENRE_INFO).
 */
export type GameGenre =
  | "fps"             // first-person shooter
  | "rpg"             // role-playing
  | "strategy"        // 4X / RTS / tactics
  | "sim"             // life/city/management sims
  | "platformer"      // 2D/3D platformers
  | "puzzle"          // puzzle / casual
  | "racing"          // racing / driving
  | "fighting"        // 1v1 fighter / brawler
  | "sports"          // team sports / annualizable
  | "horror"          // horror / survival horror
  | "mobile-casual"   // hypercasual mobile (F2P)
  | "live-service"    // MMO / looter / extraction / battle royale
  | "narrative"       // story-first / walking sim
  | "roguelike";      // roguelike / roguelite

export interface GenreInfo {
  id: GameGenre;
  label: string;
  blurb: string;
  /** Baseline dev weeks at "indie" scope. AA multiplies this by ~2×, AAA by ~4×. */
  devWeeksBase: number;
  /** Minimum engineers for realistic shipping. */
  teamSizeMin: number;
  /** Relative TAM. 1.0 = baseline. Live-service and casual skew higher. */
  marketSize: number;
  /** How much review score matters for sales conversion. 0..1. Narrative > Sports. */
  reviewWeight: number;
  /** Whether this genre naturally supports post-launch live-service revenue. */
  liveServiceViable: boolean;
  /** Competition density 0..1 — higher means more clone risk on launch. */
  competitionDensity: number;
  /** Base blended price at indie scope. AA ~2×, AAA ~3×. */
  defaultPrice: number;
  /** Hype potential — how hard trailers and showcases land. 1.0 = baseline. */
  hypeMultiplier: number;
  /** Suggested name suffixes for procedural title generation. */
  nameSuffixes: string[];
}

/** Scope a studio can pick when starting a project. Drives budget, team, timeline. */
export type GameScope = "indie" | "AA" | "AAA";

export interface ScopeInfo {
  id: GameScope;
  label: string;
  /** Multiplier on devWeeksBase. */
  devWeeksMult: number;
  /** Multiplier on defaultPrice. */
  priceMult: number;
  /** Minimum team size floor regardless of genre. */
  minTeam: number;
  /** Baseline per-week dev cost beyond salaries (licensing, middleware, outsourcing). */
  weeklyBaseCost: number;
  /** Review-weight bonus / penalty — AAA has higher expectations. */
  reviewExpectationBias: number;
}

// =====================================================================================
// Platform taxonomy
// =====================================================================================

export type GamePlatform =
  | "pc-steam"       // Steam / Epic / GOG
  | "playstation"    // PS5 / PS4
  | "xbox"           // Xbox Series / One + Game Pass
  | "switch"         // Nintendo Switch
  | "mobile-ios"     // App Store
  | "mobile-android" // Play Store
  | "web";           // browser / itch.io web

export interface PlatformInfo {
  id: GamePlatform;
  label: string;
  /** Relative reach. Steam ~1.0 baseline, Switch ~0.8, PlayStation ~0.9. */
  reach: number;
  /** Revenue share kept by the developer. Steam 0.70, consoles 0.70, mobile 0.70. */
  devRevShare: number;
  /** Porting cost to add this platform after primary (as fraction of devBudget). */
  portCostMult: number;
  /** Whether exclusivity deals are common. */
  exclusivityAllowed: boolean;
}

// =====================================================================================
// Game entity
// =====================================================================================

export type GameDevStage =
  | "concept"          // pitch + design docs
  | "prototype"        // playable slice
  | "vertical-slice"   // one polished level
  | "production"       // content creation bulk
  | "polish"           // final bug-fix + optimization
  | "released"         // live on platforms
  | "live-service"     // post-launch live ops
  | "mature"           // long-tail / legacy
  | "sunset";          // delisted / servers down

/** A single DLC pack. */
export interface DlcPack {
  id: ID;
  name: string;
  /** Fraction of base-game dev cost. DLC packs are typically 0.1..0.3. */
  costMult: number;
  plannedWeek: number;
  devProgress: number; // 0..1
  /** Week it shipped (undefined = still in dev). */
  releasedWeek?: number;
  /** Revenue recognized so far. */
  revenue: number;
  /** Sales spike multiplier on base-game tail when released. */
  salesSpike: number;
}

/** Post-launch live-service state. Only present when the genre supports it. */
export interface LiveServiceState {
  /** Monthly active users. */
  mau: number;
  /** Peak MAU ever reached. */
  peakMau: number;
  /** Average revenue per daily active user (cents). */
  arpdau: number;
  /** Weeks between content drops. Longer = faster MAU decay. */
  contentCadence: number;
  /** Week of last content drop. Used for drop-bonus curves. */
  lastContentDropWeek: number;
  /** Week churn last spiked — for flavor events. */
  lastChurnSpikeWeek?: number;
}

export interface Game {
  id: ID;
  title: string;
  genre: GameGenre;
  /** Primary platform (first) + secondary platforms (ports). */
  platforms: GamePlatform[];
  scope: GameScope;
  stage: GameDevStage;
  /** Semver-ish for DLC / patches. "1.0" at launch, "1.1" for first DLC, etc. */
  version: string;

  // --- Dev ------------------------------------------------------------------
  devProgress: number;        // 0..1 on current stage
  targetDevWeeks: number;     // total weeks planned at creation
  weeksInStage: number;       // weeks since entering current stage
  weeksSinceStart: number;    // weeks since project began
  devBudget: number;          // $/wk ongoing dev spend
  marketingBudget: number;    // $/wk pre-launch marketing
  assignedEngineers: ID[];    // employee ids assigned

  // --- Quality --------------------------------------------------------------
  quality: number;            // 0..100 — craft + iteration
  polish: number;             // 0..100 — QA + optimization (only accrues in polish stage)
  techDebt: number;           // 0..100 — rushed features, unpaid refactors
  crunchActive: boolean;      // if on: faster dev, morale decay, attrition risk

  // --- Pre-launch -----------------------------------------------------------
  hype: number;               // 0..100 — awareness + excitement
  wishlist: number;           // pre-launch wishlists on Steam-like platforms
  /** Week the studio plans to ship. Required once dev enters "polish". */
  plannedLaunchWeek?: number;
  /** Trailers/showcases this game has been featured in. Each grants a hype burst. */
  showcaseAppearances: { week: number; showcase: string; hypeDelta: number }[];
  /** Was this game featured in a major showcase this cycle? (for UI badging) */
  mostRecentShowcaseWeek?: number;

  // --- Launch -------------------------------------------------------------
  launched?: {
    week: number;
    reviewScore: number;        // 0..100 Metacritic-style
    firstWeekSales: number;     // units sold in launch week
    totalSold: number;          // cumulative units sold (base game)
    priceAtLaunch: number;      // list price at launch
    weeklyTailSales: number[];  // recent weeks of sales — for chart
  };

  // --- Post-launch systems -------------------------------------------------
  liveService?: LiveServiceState;
  dlcPipeline: DlcPack[];
  /** Active review-bombing / controversy event, if any. */
  reviewBomb?: { startedWeek: number; severity: number; reason: string };
  /** Active platform exclusivity deal covering this game. */
  exclusivity?: {
    platform: GamePlatform;
    /** Weeks since signing, for timed exclusivity expiry. */
    signedWeek: number;
    /** Timed deals have an expiry; permanent deals don't. */
    expiresWeek?: number;
    /** Upfront cash the platform paid. Credited to finance.cash when signed. */
    upfrontPaid: number;
    /** Marketing support multiplier from the platform (1.0..2.0). */
    marketingBoost: number;
  };

  // --- Lifetime tallies ----------------------------------------------------
  lifetimeRevenue: number;
  lifetimeCost: number;
  lifetimeDevCost: number;
  lifetimeMarketingCost: number;
  peakWeeklySales: number;
}

/** Archived game record — snapshot taken when a game is sunset. */
export interface ArchivedGame {
  id: ID;
  title: string;
  genre: GameGenre;
  scope: GameScope;
  platforms: GamePlatform[];
  foundedWeek: number;
  launchedWeek?: number;
  sunsetWeek: number;
  finalReviewScore?: number;
  totalSold: number;
  peakMau?: number;
  lifetimeRevenue: number;
  lifetimeCost: number;
  reason: "sunset" | "cancelled" | "flop-wrap";
  verdict: "runaway-hit" | "solid-hit" | "modest" | "flop" | "cancelled" | "disaster";
  narrative: string;
}

// =====================================================================================
// Studio-specific world state
// =====================================================================================

/** A rival studio. Similar to Competitor but tuned for games. */
export interface CompetitorStudio {
  id: ID;
  name: string;
  /** Genre they're known for. */
  flagshipGenre: GameGenre;
  /** Scale they typically ship at. */
  scope: GameScope;
  /** Overall reputation 0..100 — drives launch impact of their games. */
  reputation: number;
  /** 0..1 — likelihood of disruptive moves (surprise launches, poaching, etc.). */
  aggression: number;
  /** Simulated cash. */
  cash: number;
  /** Simulated headcount. */
  headcount: number;
  /** Week their last game shipped — for cooldown on AI launches. Negative
   *  values represent pre-game history (e.g. shipped 20 weeks before the
   *  player incorporated). */
  lastShipWeek?: number;
  /** Name of their most recent hit title. Purely flavor + UI —
   *  drives the "currently-selling competitor" opening event. */
  flagshipTitle?: string;
  /** Review score (0..100) of their flagship. Flavor for UI. */
  flagshipReviewScore?: number;
  /** Stage in their life. */
  stage: "indie" | "growing" | "established" | "declining" | "acquired" | "dead";
}

/** Per-genre popularity state — drifts over time, biases signup conversion. */
export interface GenreTrend {
  genre: GameGenre;
  /** 0..2 — 1.0 neutral, >1 hot, <1 cooling. */
  popularity: number;
  /** Direction + magnitude of weekly drift. */
  drift: number;
  /** Week the current regime started — used for narrative events. */
  regimeStartedWeek: number;
}

/** Scheduled industry showcase the studio can apply to. */
export type ShowcaseEvent =
  | "summer-game-fest"
  | "the-game-awards"
  | "gamescom"
  | "indie-direct"
  | "playstation-showcase"
  | "xbox-showcase"
  | "nintendo-direct"
  | "pc-gaming-show";

export interface ShowcaseSlot {
  id: ID;
  showcase: ShowcaseEvent;
  /** Week the showcase airs. Hype bursts fire that week. */
  week: number;
  /** Weeks until the application window closes. */
  applicationClosesWeek: number;
  /** Base hype boost granted to featured games (before scope/reach mods). */
  hypeBoost: number;
  /** Games the studio has gotten into this showcase (game ids). */
  featured: ID[];
  /** Max games a single studio can show. */
  slotsPerStudio: number;
}

/** Standing platform deal offer from a first-party. */
export interface PlatformDealOffer {
  id: ID;
  platform: GamePlatform;
  /** Which game this offer is for. */
  targetGameId: ID;
  /** Timed = exclusivity lapses after X weeks. Undefined = permanent. */
  timedWeeks?: number;
  /** Upfront cash. */
  upfrontPayment: number;
  /** Marketing boost multiplier (1.0..2.0). */
  marketingBoost: number;
  /** Week the offer expires if not taken. */
  offeredWeek: number;
  expiresWeek: number;
  /** Whether this offer is for FULL exclusivity (all platforms except one). */
  fullExclusivity: boolean;
}

// =====================================================================================
// Contract work — "work for hire" side business
// =====================================================================================

/**
 * Contracts are a side revenue stream for studios. The player accepts work from
 * external clients — ports, co-dev gigs, publisher-spec games, tools consulting
 * — and dedicates engineers/designers to deliver it. The trade-off is
 * opportunity cost: engineers on a contract don't contribute to the studio's
 * own IP that week. Completing on time pays out and boosts reputation; missing
 * a deadline cuts pay and damages rep, which gates future offer quality.
 */
export type ContractType =
  | "consulting"        // Short tools/engine gig. 2-6 wk, 1 engineer.
  | "port"              // Port an existing game to a new platform. 8-16 wk.
  | "co-dev"            // Build a module/system for another studio. 6-20 wk.
  | "publisher-spec";   // Full work-for-hire game. 30-60 wk, no IP retained.

export type ContractStatus =
  | "offered"           // Open offer on the board; can be accepted or declined.
  | "active"            // Accepted, in progress.
  | "completed"         // Delivered on time.
  | "failed"            // Deadline blown; partial pay + rep hit.
  | "declined"          // Player declined, or the offer expired.
  | "cancelled";        // Cancelled by player mid-contract (rep hit).

export interface StudioContract {
  id: ID;
  type: ContractType;
  clientName: string;
  title: string;
  description: string;

  status: ContractStatus;

  // --- Timing ---------------------------------------------------------------
  offeredWeek: number;
  /** Offer auto-declines after this week if not accepted. */
  expiresWeek: number;
  /** Weeks of work required to complete, once accepted. */
  durationWeeks: number;
  /** Set when accepted: offeredWeek → acceptedWeek. */
  acceptedWeek?: number;
  /** Set when accepted: hard deadline. Miss it → fail. Includes a small grace window over duration. */
  deadlineWeek?: number;
  /** Set when the contract enters a terminal status. */
  resolvedWeek?: number;

  // --- Work -----------------------------------------------------------------
  /** Headcount required each week. */
  requiredEngineers: number;
  requiredDesigners: number;
  /** 0..1 — accumulated progress. Increments each fully-staffed week. */
  progress: number;
  /** Weeks the contract was understaffed (used for flavor in completion events). */
  weeksUnderstaffed: number;

  // --- Assignment -----------------------------------------------------------
  assignedEngineerIds: ID[];
  assignedDesignerIds: ID[];

  // --- Financials -----------------------------------------------------------
  /** Total contract value. */
  payout: number;
  /** 0..1 — fraction paid on accept. Rest paid at completion. */
  upfrontFraction: number;
  /** Cash already received. */
  paidToDate: number;

  // --- Reputation impact ----------------------------------------------------
  /** Bump to studio rep on successful completion. */
  repOnSuccess: number;
  /** Penalty to studio rep on failure. */
  repOnFailure: number;
}

// =====================================================================================
// Top-level studio state
// =====================================================================================

/** Game-studio flavor of company info. */
export interface StudioCompanyState extends CompanyState {
  /** Self-described scope ambition — drives default scope suggestions on new games. */
  defaultScope: GameScope;
  /** Signature genre — flavor only, doesn't gate mechanics. */
  signatureGenre: GameGenre;
}

/**
 * The full state of a video game studio venture. Mirrors the shape of the
 * SaaS GameState so that cross-venture shared systems (team, finance, events,
 * office, culture, support, IPO) can be reused without casting.
 */
export interface GameStudioState {
  kind: "game-studio";
  seed: string;
  week: number;
  year: number;
  quarter: 1 | 2 | 3 | 4;

  company: StudioCompanyState;
  finance: Finance;

  games: Game[];
  archivedGames: ArchivedGame[];
  employees: Employee[];
  competitorStudios: CompetitorStudio[];

  /** Macro economy — studios feel funding/valuation pressure like SaaS. */
  economy: EconomyState;
  /** Genre popularity shifts. */
  genreTrends: GenreTrend[];
  /** Scheduled showcase events on the industry calendar. */
  showcases: ShowcaseSlot[];
  /** Active / open platform deal offers awaiting player response. */
  platformOffers: PlatformDealOffer[];

  /** Marquee trends borrowed from the SaaS world (e.g. recession) — applies uniformly. */
  trends: MarketTrend[];

  events: GameEvent[];

  office?: OfficeState;
  culture?: CultureState;
  /** For studios, "support" represents community management + QA triage. */
  support?: SupportState;
  ipo?: IpoState;

  /** Founder's weekly salary drawn from venture cash. Flows to
   *  `entrepreneur.personalWealth` each tick, gated by available cash. Optional on
   *  legacy saves — defaults to 0. */
  founderSalary?: number;

  /** Which tier the studio started at. Drives ongoing constraints:
   *  - "lean": hard cap of 1 in-dev game until the first shipped title
   *  - "angel-backed": board expects an exit/raise by `boardDeadlineWeek`
   *  Optional on legacy saves — absent means "bootstrapped" (no constraints). */
  startingTier?: "lean" | "bootstrapped" | "angel-backed";

  /** Week the angel-backed board's patience runs out. Event fires at this week
   *  if the studio hasn't shipped a profitable title / been acquired / IPO'd. */
  boardDeadlineWeek?: number;

  /** Set once the board-deadline warning has fired, so we don't re-fire it. */
  boardDeadlineWarned?: boolean;

  /** Contract work — offered, active, and historical contracts all live in one list,
   *  filtered by `status`. Optional on legacy saves — defaults to []. */
  contracts?: StudioContract[];

  /** Studio reputation with publishers / external clients. 0..100, starts at 50.
   *  Gates which contract types get offered; rises on successful delivery, falls
   *  on failure. Optional on legacy saves — defaults to 50. */
  studioReputation?: number;

  gameOver?: { reason: "bankrupt" | "acquired" | "ipo"; week: number; narrative: string };

  lastTickDeltas?: { week: number; cash: number; weeklySales: number; mau: number; founderDraw?: number };

  schemaVersion: number;
}
