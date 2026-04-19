import type { Company, GameState, Location, StaffTier } from "@/types";
import { CITY_MAP } from "@/data/cities";
import { INDUSTRIES } from "@/data/industries";
import {
  flagshipLabel,
  locationUpgradeCost,
  locationUpgradeEffects,
  MARKETING_MAX_SPEND,
  pickStreetDetail,
  STAFF_TIERS,
} from "@/data/operations";

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

// ==================== Staff tier ====================

export function applyStaffTierChange(
  state: GameState,
  companyId: string,
  targetTier: StaffTier
): { newState: Partial<GameState>; message: string } | null {
  const company = state.companies.find((c) => c.id === companyId);
  if (!company) return null;
  if (company.staffTier === targetTier) return null;

  const targetInfo = STAFF_TIERS[targetTier];

  // Enforce minimum locations requirement for higher tiers
  if (company.locations.length < targetInfo.minLocations) {
    return null;
  }

  // Upgrade: charge one-time signing bonus
  // Downgrade: free in cash, but morale hit
  const isUpgrade = targetTier > company.staffTier;

  if (isUpgrade) {
    if (state.cash < targetInfo.upgradeSigningBonus) return null;
  }

  // Morale adjustment: upgrades give a bump, downgrades hit harder
  const moraleDelta = isUpgrade ? 4 : -12;
  const reputationDelta = isUpgrade ? 2 : -3;
  const brandDelta = isUpgrade ? 2 : -1;

  const updatedCompany: Company = {
    ...company,
    staffTier: targetTier,
    // Clamp morale to new cap (upgrade raises ceiling; downgrade may force current morale down)
    morale: clamp(
      Math.min(company.morale + moraleDelta, targetInfo.moraleCap),
      0,
      100
    ),
    reputation: clamp(company.reputation + reputationDelta, 0, 100),
    brandStrength: clamp(company.brandStrength + brandDelta, 0, 100),
  };

  const cashDelta = isUpgrade ? -targetInfo.upgradeSigningBonus : 0;

  return {
    newState: {
      cash: state.cash + cashDelta,
      companies: state.companies.map((c) => (c.id === companyId ? updatedCompany : c)),
    },
    message: isUpgrade
      ? `${company.name} staff upgraded to ${targetInfo.name} · ${formatDollarsK(-cashDelta)} signing bonus`
      : `${company.name} staff downgraded to ${targetInfo.name} · morale dropped`,
  };
}

function formatDollarsK(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ==================== Marketing spend ====================

export function applyMarketingSpend(
  state: GameState,
  companyId: string,
  spend: number
): { newState: Partial<GameState>; message: string } | null {
  const company = state.companies.find((c) => c.id === companyId);
  if (!company) return null;

  const clampedSpend = clamp(spend, 0, MARKETING_MAX_SPEND);

  const updatedCompany: Company = {
    ...company,
    marketingSpend: clampedSpend,
  };

  return {
    newState: {
      companies: state.companies.map((c) => (c.id === companyId ? updatedCompany : c)),
    },
    message: `${company.name} marketing spend set to ${formatDollarsK(clampedSpend)}/mo`,
  };
}

// ==================== Location tier upgrade ====================

export function applyLocationUpgrade(
  state: GameState,
  companyId: string,
  locationId: string
): { newState: Partial<GameState>; message: string; cost: number } | null {
  const company = state.companies.find((c) => c.id === companyId);
  if (!company) return null;

  const location = company.locations.find((l) => l.id === locationId);
  if (!location) return null;

  if (location.qualityTier >= 3) return null;

  const city = CITY_MAP[location.cityId];
  const industry = INDUSTRIES[location.industry];
  if (!city || !industry) return null;

  const cost = locationUpgradeCost(location.qualityTier, city.rentIndex, industry.startingCost);
  if (state.cash < cost) return null;

  const effects = locationUpgradeEffects(location.qualityTier);
  const newTier = location.qualityTier + 1;
  const isFlagshipUpgrade = newTier === 3;

  const updatedLocation: Location = {
    ...location,
    qualityTier: newTier,
    streetDetail: isFlagshipUpgrade
      ? flagshipLabel(location.cityId, location.industry)
      : location.streetDetail ?? pickStreetDetail(location.cityId),
  };

  const updatedCompany: Company = {
    ...company,
    locations: company.locations.map((l) => (l.id === locationId ? updatedLocation : l)),
    morale: clamp(company.morale + effects.moraleBump, 0, 100),
    brandStrength: clamp(company.brandStrength + effects.brandBump, 0, 100),
    reputation: clamp(company.reputation + (isFlagshipUpgrade ? 3 : 1), 0, 100),
  };

  return {
    newState: {
      cash: state.cash - cost,
      companies: state.companies.map((c) => (c.id === companyId ? updatedCompany : c)),
    },
    cost,
    message: isFlagshipUpgrade
      ? `${city.name} upgraded to flagship · ${formatDollarsK(-cost)} invested`
      : `${city.name} refined to Tier ${newTier} · ${formatDollarsK(-cost)} invested`,
  };
}
