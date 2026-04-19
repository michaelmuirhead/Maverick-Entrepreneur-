import type { IndustryId, StaffTier } from "@/types";

// ==================== STAFF TIERS ====================

export interface StaffTierInfo {
  tier: StaffTier;
  name: string;
  description: string;
  // Monthly salary delta relative to Tier 1 (Lean)
  monthlySalaryDelta: number;
  // One-time signing bonus cost to upgrade TO this tier
  upgradeSigningBonus: number;
  // Revenue multiplier applied per location
  revenueMultiplier: number;
  // Maximum morale the company can reach with this tier
  moraleCap: number;
  // Talent score — used as input for rivals poaching and recruiting events
  talentScore: number;
  // Minimum number of locations required to hire at this tier
  minLocations: number;
}

export const STAFF_TIERS: Record<StaffTier, StaffTierInfo> = {
  1: {
    tier: 1,
    name: "Lean",
    description: "Minimal team, mostly contractors and part-time staff.",
    monthlySalaryDelta: 0,
    upgradeSigningBonus: 0,
    revenueMultiplier: 1.0,
    moraleCap: 60,
    talentScore: 0,
    minLocations: 1,
  },
  2: {
    tier: 2,
    name: "Standard",
    description: "Trained full-time staff, competitive market wages.",
    monthlySalaryDelta: 2800,
    upgradeSigningBonus: 8000,
    revenueMultiplier: 1.08,
    moraleCap: 75,
    talentScore: 4,
    minLocations: 1,
  },
  3: {
    tier: 3,
    name: "Premium",
    description: "Industry veterans, above-market salaries, real benefits.",
    monthlySalaryDelta: 8400,
    upgradeSigningBonus: 22000,
    revenueMultiplier: 1.18,
    moraleCap: 90,
    talentScore: 15,
    minLocations: 2,
  },
  4: {
    tier: 4,
    name: "Elite",
    description: "Named hires, executive compensation, poachable leadership.",
    monthlySalaryDelta: 22000,
    upgradeSigningBonus: 45000,
    revenueMultiplier: 1.32,
    moraleCap: 98,
    talentScore: 35,
    minLocations: 5,
  },
};

// ==================== MARKETING PRESETS ====================

export interface MarketingPreset {
  id: string;
  label: string;
  spend: number;
}

export const MARKETING_PRESETS: MarketingPreset[] = [
  { id: "off", label: "Off", spend: 0 },
  { id: "lean", label: "Lean", spend: 2_000 },
  { id: "steady", label: "Steady", spend: 8_000 },
  { id: "aggressive", label: "Aggressive", spend: 18_000 },
  { id: "allin", label: "All-in", spend: 30_000 },
];

export const MARKETING_MAX_SPEND = 30_000;

// Marketing spend uses a log-like curve: more spend yields more brand growth,
// but with strong diminishing returns past ~$15K/mo.
export function marketingBrandGain(spend: number): number {
  if (spend <= 0) return 0;
  // Returns units of brand growth per month.
  // At $2K: ~0.5, at $8K: ~1.8, at $15K: ~2.8, at $30K: ~3.6 (heavily tapered).
  return 4.2 * (1 - Math.exp(-spend / 8000));
}

// Without marketing, brand decays slowly.
export const BRAND_DECAY_PER_MONTH = 0.6;

// Marketing also has a small positive effect on reputation.
export function marketingReputationGain(spend: number): number {
  return marketingBrandGain(spend) * 0.4;
}

// Determine if a given spend is in the "diminishing returns" red zone
export function marketingEfficiency(spend: number): "healthy" | "diminishing" | "wasteful" {
  if (spend <= 0) return "healthy";
  if (spend < 12_000) return "healthy";
  if (spend < 22_000) return "diminishing";
  return "wasteful";
}

// ==================== LOCATION TIER UPGRADES ====================

// Base one-time cost to upgrade a location from current tier to next tier,
// scaled by the city's rent index (prime markets cost more to upgrade).
// Tier 1 → 2: modest. Tier 2 → 3 (flagship): substantial.
export function locationUpgradeCost(
  currentTier: number,
  cityRentIndex: number,
  industryBaseCost: number
): number {
  if (currentTier >= 3) return Infinity;
  // Tier 1 → 2: ~2.5× industry base cost × city rent
  // Tier 2 → 3: ~5× industry base cost × city rent
  const multiplier = currentTier === 1 ? 2.5 : 5;
  return Math.round(industryBaseCost * multiplier * cityRentIndex);
}

// Each tier adds a revenue multiplier
export function locationTierRevenueMultiplier(tier: number): number {
  if (tier <= 1) return 1.0;
  if (tier === 2) return 1.2;
  return 1.32; // Tier 3 flagship
}

// Upgrading to tier 3 gives an additional brand/morale bump
export interface UpgradeEffects {
  revenueMultBefore: number;
  revenueMultAfter: number;
  moraleBump: number;
  brandBump: number;
}

export function locationUpgradeEffects(currentTier: number): UpgradeEffects {
  const before = locationTierRevenueMultiplier(currentTier);
  const after = locationTierRevenueMultiplier(currentTier + 1);
  // Tier 1→2: modest bumps. Tier 2→3 (flagship): larger bumps.
  const isFlagshipUpgrade = currentTier === 2;
  return {
    revenueMultBefore: before,
    revenueMultAfter: after,
    moraleBump: isFlagshipUpgrade ? 6 : 3,
    brandBump: isFlagshipUpgrade ? 8 : 4,
  };
}

// ==================== STREET DETAIL NAMES ====================

// When a location opens or gets upgraded, it gets assigned a plausible-sounding
// street/neighborhood detail that surfaces in the narrative.
const STREET_DETAILS_BY_CITY: Record<string, string[]> = {
  austin: ["South Congress", "Rainey District", "East 6th Street", "The Domain", "2nd & Brazos"],
  sf: ["Hayes Valley", "Mission District", "SoMa", "Russian Hill", "Valencia & 17th"],
  nyc: ["Tribeca", "Williamsburg", "Upper West Side", "Flatiron", "DUMBO"],
  chicago: ["West Loop", "Fulton Market", "Wicker Park", "Gold Coast", "Lincoln Park"],
  denver: ["LoDo District", "RiNo", "Capitol Hill", "Cherry Creek", "Union Station"],
  miami: ["Wynwood", "Brickell", "Design District", "Coral Gables", "Little Havana"],
  seattle: ["South Lake Union", "Capitol Hill", "Pike Place", "Ballard", "Fremont"],
  phoenix: ["Scottsdale Waterfront", "Roosevelt Row", "Tempe Town Lake", "Kierland", "Arcadia"],
  nashville: ["The Gulch", "East Nashville", "12 South", "Germantown", "The District"],
  boston: ["Back Bay", "Seaport", "Kendall Square", "South End", "North End"],
};

export function pickStreetDetail(cityId: string): string {
  const options = STREET_DETAILS_BY_CITY[cityId] ?? ["Downtown", "Old Town", "Main Street"];
  return options[Math.floor(Math.random() * options.length)];
}

// Special naming for flagship (tier 3) locations — they become "The X location"
export function flagshipLabel(cityId: string, industry: IndustryId): string {
  const street = pickStreetDetail(cityId);
  const industrySuffix: Record<IndustryId, string> = {
    coffee: "flagship café",
    ecommerce: "headquarters",
    software: "flagship office",
    fastfood: "flagship location",
    construction: "regional HQ",
    law: "named-partner office",
  };
  return `${street} · ${industrySuffix[industry]}`;
}

// ==================== TOTAL OPERATIONS COST ====================

// Monthly operations overhead for a company (staff salary delta + marketing spend)
export function companyOpsOverhead(staffTier: StaffTier, marketingSpend: number): number {
  return STAFF_TIERS[staffTier].monthlySalaryDelta + marketingSpend;
}
