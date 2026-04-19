export type IndustryId = "coffee" | "ecommerce" | "software" | "fastfood" | "construction" | "law";

export type BackgroundId =
  | "barista"
  | "developer"
  | "contractor"
  | "marketer"
  | "accountant"
  | "salesperson";

export interface Industry {
  id: IndustryId;
  name: string;
  tagline: string;
  startingCost: number;
  baseMonthlyRevenue: number;
  baseMonthlyCost: number;
  volatility: number; // 0..1
  growthCeiling: number; // soft cap multiplier
  flavor: string;
}

export interface City {
  id: string;
  name: string;
  state: string;
  population: number;
  avgIncome: number;
  rentIndex: number; // 1.0 = average
  laborIndex: number; // 1.0 = average
  businessFriendliness: number; // 0..1
  growthTrend: number; // -0.1..0.2
  industryFit: Partial<Record<IndustryId, number>>; // multiplier
}

export interface Location {
  id: string;
  cityId: string;
  industry: IndustryId;
  qualityTier: number; // 1..3
  openedMonth: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  // Phase 2.4 — narrative detail that surfaces when a location becomes a flagship
  streetDetail?: string;
}

export type StaffTier = 1 | 2 | 3 | 4;

export interface Company {
  id: string;
  name: string;
  industry: IndustryId;
  locations: Location[];
  foundedMonth: number;
  brandStrength: number; // 0..100
  morale: number; // 0..100
  reputation: number; // 0..100
  founderOwnership: number; // 0..1
  investorOwnership: number; // 0..1
  cashInvested: number;
  // Phase 2.4 — Operations
  staffTier: StaffTier;           // 1=Lean, 2=Standard, 3=Premium, 4=Elite
  marketingSpend: number;         // monthly marketing spend in dollars
}

export interface Trait {
  id: string;
  name: string;
  description: string;
}

export interface Founder {
  name: string;
  age: number;
  background: BackgroundId;
  traits: string[];
  energy: number; // 0..100
  stress: number; // 0..100
  health: number; // 0..100
}

// ============================================================
// Phase 3 — Dynasty & Succession
// ============================================================

// Heir life stages drive narrative framing and UI affordances
export type HeirStatus =
  | "child"         // age 0-17: visible on succession page but can't be invested in yet
  | "adult"         // age 18-29: can be invested in, can be named in succession order
  | "established";  // age 30+: can take the reins, traits & stats locked in

// Traits shape heir behavior and narrative. Drawn at heir generation and during coming-of-age.
export type HeirTraitKind =
  | "ambitious"         // +aptitude growth, -loyalty drift
  | "prudent"           // +stability during reign
  | "reckless"          // -stability, +public appeal
  | "charismatic"       // +public appeal
  | "benevolent"        // +stakeholder goodwill
  | "ruthless"          // -stakeholder goodwill, +profit instinct
  | "cosmopolitan"      // better with modern industries
  | "hometown_loyal"    // bonus in home city
  | "spendthrift"       // -cash management
  | "cautious";         // slower growth, less risk

export interface HeirTrait {
  kind: HeirTraitKind;
  label: string;
  polarity: "positive" | "neutral" | "negative";
}

export interface Heir {
  id: string;
  name: string;
  age: number;
  bornMonth: number;       // month of game when heir was born
  status: HeirStatus;
  aptitude: number;        // 0..100
  loyalty: number;         // 0..100
  publicAppeal: number;    // 0..100
  traits: HeirTrait[];     // 1-2 traits, set at adulthood
  bio: string;             // 1-2 sentence narrative bio, regenerated at status transitions
  // Track investments so repeated investments yield diminishing returns
  investmentCount: {
    tutoring: number;
    mentorship: number;
    publicRole: number;
  };
}

// Classification for displaying founder life risk as a qualitative indicator
export type LifeRiskLevel = "none" | "low" | "watchful" | "elevated" | "dangerous";


export type EventCategory = "business" | "economy" | "politics" | "family" | "prestige";

export interface GameEvent {
  id: string;
  month: number;
  category: EventCategory;
  headline: string;
  body: string;
  choices?: EventChoice[];
  resolved?: boolean;
}

export interface EventChoice {
  id: string;
  label: string;
  effect: {
    cash?: number;
    reputation?: number;
    morale?: number;
    brand?: number;
    stress?: number;
  };
  resultText: string;
}

export type RivalArchetype =
  | "incumbent"
  | "disruptor"
  | "specialist"
  | "acquirer"
  | "hometown_hero";

export type GrudgeLevel = "allied" | "patient" | "indifferent" | "hostile" | "nemesis";

export type RivalMoveKind =
  | "open_location"
  | "cut_prices"
  | "poach_exec"
  | "win_contract"
  | "announce_acquisition"
  | "approach_merger"
  | "propose_partnership"
  | "cross_promote"
  | "lay_low"
  | "press_profile"
  | "collapse";

export interface Rival {
  id: string;
  name: string;
  industry: IndustryId;
  archetype: RivalArchetype;
  tagline: string;             // one-sentence description
  quote: string;               // signature quote
  quoteAttribution: string;    // who said it, in what context

  // behavior
  aggression: number;          // 0..100  — how likely to initiate hostile moves
  reputation: number;          // 0..100
  brandStrength: number;       // 0..100
  talentPull: number;          // 0..100  — ability to poach
  politicalReach: number;      // 0..100  — matters later for politics

  // relationship
  grudge: number;              // -100..+100 — + is allied, - is nemesis
  marketShare: number;         // 0..1 in their primary industry

  // economic
  estimatedCash: number;       // what the player "sees"
  locations: number;           // approximate count
  monthlyRevenue: number;
  growth: number;              // -0.3..1.0 monthly growth rate

  // overlap tracking — city IDs where this rival operates
  cities: string[];

  // special flags
  activeAcquisitionOffer?: {
    amount: number;
    expiresMonth: number;      // absolute month
    targetCompanyId?: string;  // which of yours they want
  };
}

export interface RivalMove {
  id: string;
  month: number;
  rivalId: string;
  kind: RivalMoveKind;
  headline: string;            // "Meridian opens a third Austin location"
  body: string;                // narrative paragraph
  tone: "hostile" | "neutral" | "threat" | "approach" | "friendly";
  cityId?: string;             // if relevant
  effect?: {
    grudgeDelta?: number;      // change to rival.grudge
    rivalCashDelta?: number;
    rivalReputationDelta?: number;
    playerMoraleDelta?: number;
    playerBrandDelta?: number;
    playerReputationDelta?: number;
    playerCashDelta?: number;  // e.g. talent poach costs you nothing directly but hurts morale
  };
}

export interface RivalThreat {
  id: string;
  rivalId: string;
  kind: RivalMoveKind;
  probability: number;         // 0..1
  earliestMonth: number;
  latestMonth: number;
  headline: string;
  detail: string;
  severity: "info" | "warning" | "critical";
}

export interface ContestedMarket {
  cityId: string;
  industry: IndustryId;
  yourShare: number;           // 0..1
  rivalId: string;
  rivalShare: number;          // 0..1
}

export interface EconomyState {
  gdpGrowth: number; // -0.05..0.05
  interestRate: number; // 0..0.2
  inflation: number; // 0..0.15
  consumerConfidence: number; // 0..100
  phase: "expansion" | "peak" | "recession" | "recovery";
}

export interface PoliticsState {
  corporateTax: number;        // 0..0.5 (displayed as percentage)
  laborRegulation: number;     // 0..100 (displayed as index)
  antitrustPressure: number;   // 0..100
  climatePhase: "loosening" | "stable" | "tightening";
}

export interface StakeholderReputation {
  customers: number;           // 0..100
  employees: number;
  investors: number;
  government: number;
  publicImage: number;
  press: number;
}

export type StakeholderKey = keyof StakeholderReputation;

// Active lobbying campaign. Persists month-to-month, resolved when expiresMonth hits.
export interface LobbyingCampaign {
  id: string;
  startedMonth: number;
  expiresMonth: number;        // when it resolves
  monthlyCost: number;
  target: "labor" | "tax" | "antitrust" | "permit_speed";
  targetChange: number;        // magnitude of change if it succeeds
  odds: number;                // 0..1
  title: string;
  detail: string;
  status: "active" | "succeeded" | "failed";
}

// Automation investments reduce labor exposure in the targeted industry
export interface AutomationInvestment {
  id: string;
  installedMonth: number;
  industry: IndustryId;
  laborExposureReduction: number;
  label: string;
}

export type PoliticalActionKind =
  | "lobby_start"
  | "lobby_cancel"
  | "lobby_resolved"
  | "donation"
  | "relocation"
  | "automation"
  | "position_taken"
  | "position_declined"
  | "external_bill"
  | "external_ruling";

export interface PoliticalAction {
  id: string;
  month: number;
  kind: PoliticalActionKind;
  headline: string;
  detail: string;
  tone: "spend" | "win" | "loss" | "neutral" | "external";
  amountDelta?: number;        // cash effect, if any
}

export interface HeadquartersLocation {
  cityId: string;
  relocatedMonth: number | null; // null = original HQ
}

// ============================================================
// Phase 2.3 — Real Estate
// ============================================================

export type PropertyKind =
  | "office"          // can be occupied by any company; cuts rent when occupied
  | "retail"          // can be occupied by coffee/fastfood/ecommerce; cuts rent when occupied
  | "industrial"      // can be occupied by ecommerce/construction; cuts rent when occupied
  | "apartment"       // always leased — passive rental income
  | "land"            // no income, no occupancy, pure speculation
  | "penthouse"       // prestige; upkeep cost, boosts stakeholders
  | "vineyard"        // prestige; small upkeep, boosts stakeholders
  | "townhouse";      // prestige; high upkeep, high stakeholder boost

export type PropertyCategory = "income" | "operational" | "speculative" | "prestige";

// Whether a property is currently being rented out, occupied by one of your companies, etc.
export type PropertyUsage =
  | { kind: "leased"; tenant: string; monthlyRent: number; external: boolean }
  | { kind: "occupied"; companyId: string; rentSaved: number }
  | { kind: "vacant" }
  | { kind: "speculative" }   // for land
  | { kind: "trophy" };       // for prestige assets

export interface Property {
  id: string;
  name: string;
  kind: PropertyKind;
  cityId: string;
  purchasePrice: number;
  purchaseMonth: number;
  currentValue: number;
  appreciationRate: number;      // annual, e.g. 0.04 = 4%/yr expected
  monthlyMaintenance: number;    // always negative drag in cash flow
  usage: PropertyUsage;
  // Prestige-only effects
  stakeholderBoost?: {
    publicImage?: number;        // applied once on purchase, decays slowly
    press?: number;
  };
  // Land-specific
  developmentPotential?: {
    targetKind: PropertyKind;    // what you can turn it into
    cost: number;
  };
}

// A listing on the marketplace. Generated fresh each month, turns over if not purchased.
export interface PropertyListing {
  id: string;
  name: string;
  kind: PropertyKind;
  category: PropertyCategory;
  cityId: string;
  price: number;
  hook: string;                  // narrative sentence
  // What the buyer would get
  appreciationRate: number;
  monthlyMaintenance: number;
  // Mode-specific stats
  passiveMonthlyRent?: number;   // if leased out
  operationalSavings?: number;   // if occupied
  appreciationEstimate?: number; // if speculative — expected pct gain over 3yr
  stakeholderBoost?: {
    publicImage?: number;
    press?: number;
  };
  developmentPotential?: {
    targetKind: PropertyKind;
    cost: number;
  };
  listedMonth: number;
  expiresMonth: number;          // if not bought by this month, removed
}

export type RealEstateActionKind =
  | "purchase"
  | "sale"
  | "lease_out"
  | "occupy"
  | "develop"
  | "borrow_secured"
  | "repay_secured"
  | "host_event";

export interface RealEstateAction {
  id: string;
  month: number;
  kind: RealEstateActionKind;
  propertyId?: string;
  headline: string;
  detail: string;
  amountDelta: number;           // cash effect
}

export interface GameState {
  // meta
  started: boolean;
  month: number; // months since start
  dayInMonth: number; // 0..29 — Phase 4.1 day-scale counter
  startYear: number;

  // core
  founder: Founder;
  heirs: Heir[];
  cash: number;
  debt: number;
  legacyScore: number;

  // orgs
  companies: Company[];
  rivals: Rival[];
  rivalMoves: RivalMove[];
  rivalThreats: RivalThreat[];

  // world
  economy: EconomyState;
  politics: PoliticsState;

  // Phase 2.2 — Politics
  stakeholders: StakeholderReputation;
  lobbyingCampaigns: LobbyingCampaign[];
  automationInvestments: AutomationInvestment[];
  politicalActions: PoliticalAction[];
  headquarters: HeadquartersLocation;

  // Phase 2.3 — Real Estate
  properties: Property[];
  propertyListings: PropertyListing[];
  realEstateActions: RealEstateAction[];
  securedDebt: number;           // debt backed by real estate (separate from general debt)

  // Phase 3.1 — Dynasty & Succession
  successionOrder: string[];     // ordered array of heir IDs (first is presumptive)
  dynastyEnded: boolean;         // true after founder death with no eligible heirs
  founderDoctorsNote: string;    // rotating narrative blurb about founder's condition

  // Phase 3.3 — Legacy tracking
  generation: number;            // 1 = founding generation, 2 = first successor, etc.
  pendingSuccession: PendingSuccession | null;  // transition UI state
  dynastyHistory: ReignRecord[]; // archive of past reigns
  defectedHeirs: DefectedHeir[]; // heirs who left or became rivals after unsuccessful transition
  peakNetWorth: number;          // highest (cash + property value) ever achieved in this dynasty
  rivalsDefeated: string[];      // ids of rivals that have been bankrupted/outgrown
  industriesEntered: string[];   // set of all industry ids ever operated in this dynasty
  citiesEntered: string[];       // set of all city ids ever operated in this dynasty

  // history
  events: GameEvent[];
  monthlyReports: MonthlyReport[];
}

// A pending succession — game state enters this when founder dies or steps down,
// waits for the player to acknowledge the transition via the modal on People screen.
export interface PendingSuccession {
  kind: "death" | "stepdown";
  founderNameAtTransition: string;
  founderAgeAtTransition: number;
  reason: string;                // narrative flavor
  successorId: string | null;    // pre-computed from successionOrder; null if no eligible heir
  estateTaxRate: number;         // 0..1 tax on cash
  triggeredMonth: number;
}

// Archive of one reign
export interface ReignRecord {
  generation: number;
  founderName: string;
  startMonth: number;
  endMonth: number;
  endReason: "died" | "stepped_down" | "ongoing";
  ageAtStart: number;
  ageAtEnd: number;
  peakCash: number;
  peakCompanies: number;
  peakProperties: number;
}

// Heir who left the dynasty after being passed over in succession
export interface DefectedHeir {
  id: string;
  name: string;
  defectedMonth: number;
  outcome: "left_quietly" | "stayed_bitter" | "became_rival";
  rivalId?: string;              // if outcome is became_rival, link to the Rival entry
}

// ============================================================
// Phase 3.3 — Legacy Score & Dynasty Eulogy
// ============================================================

// Qualitative tier for a Legacy Score — how history remembers the dynasty
export type LegacyTier =
  | "forgotten"           // 0-49
  | "remembered_locally"  // 50-149
  | "regional_name"       // 150-299
  | "household_name"      // 300-499
  | "institution"         // 500-749
  | "written_into_history" // 750-999
  | "rockefeller_tier";   // 1000 (cap)

// A full breakdown of how a Legacy Score was computed, used in the eulogy screen
export interface LegacyBreakdown {
  total: number;                 // sum, capped at 1000
  tier: LegacyTier;
  tierLabel: string;             // human-readable: "A dynasty written into history"
  components: {
    financial: number;           // from peak net worth
    brand: number;               // from average brand across lifetime
    rivals: number;              // from rivals defeated
    political: number;           // from stakeholder reputation average
    generational: number;        // from generations survived
    dignity: number;             // bonus for voluntary handoffs, old-age deaths
    breadth: number;             // industries × cities
    succession: number;          // bonus for drafted succession order peacefully honored
  };
}

// A persistent record saved to localStorage at dynasty end.
// Carried forward across playthroughs so the player builds a meta-collection.
export interface Gravestone {
  id: string;                    // uuid assigned at save time
  savedAt: number;               // Date.now() at save
  surname: string;               // e.g. "Hart"
  firstFounder: string;          // e.g. "Amelia Hart"
  lastFounder: string;           // e.g. "Mira Hartwell"
  yearFounded: number;
  yearEnded: number;
  generations: number;
  endReason: "last_founder_died" | "final_step_down" | "no_heirs";
  legacy: LegacyBreakdown;
  reignSummaries: string[];      // one-liner per reign
  eulogyParagraphs: string[];    // generated narrative, 2-3 paragraphs
}

export interface MonthlyReport {
  month: number;
  revenue: number;
  costs: number;
  profit: number;
  cashDelta: number;
  cashEnd: number;
  headline: string;
}
