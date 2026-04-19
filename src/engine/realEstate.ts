import type {
  GameState,
  Property,
  PropertyKind,
  PropertyListing,
  PropertyUsage,
  RealEstateAction,
  StakeholderReputation,
} from "@/types";
import { CITIES, CITY_MAP } from "@/data/cities";
import {
  LISTINGS_REFRESH_TARGET,
  LISTING_DURATION_MONTHS,
  LISTING_TEMPLATES,
  LTV_CAP,
  PROPERTY_KIND_INFO,
  SECURED_RATE_ANNUAL,
} from "@/data/realEstate";

function uid(): string { return Math.random().toString(36).slice(2, 10); }
function rand(min: number, max: number): number { return Math.random() * (max - min) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function round(n: number, to: number = 1000): number { return Math.round(n / to) * to; }

// ==================== Monthly cash flow ====================

export interface PropertyCashFlow {
  propertyId: string;
  monthlyIncome: number;   // positive for leased, 0 for occupied (savings tracked separately)
  monthlyRentSaved: number; // positive if occupied
  monthlyMaintenance: number; // always negative (we store absolute, apply as cost)
}

export function computePropertyCashFlow(p: Property): PropertyCashFlow {
  const income =
    p.usage.kind === "leased" ? p.usage.monthlyRent : 0;
  const rentSaved =
    p.usage.kind === "occupied" ? p.usage.rentSaved : 0;
  return {
    propertyId: p.id,
    monthlyIncome: income,
    monthlyRentSaved: rentSaved,
    monthlyMaintenance: p.monthlyMaintenance,
  };
}

export function totalRealEstateCashDelta(properties: Property[]): {
  income: number;
  maintenance: number;
  rentSaved: number;
  net: number;                // income - maintenance (rent savings are implicit in company finances)
} {
  let income = 0;
  let maintenance = 0;
  let rentSaved = 0;
  for (const p of properties) {
    const cf = computePropertyCashFlow(p);
    income += cf.monthlyIncome;
    maintenance += cf.monthlyMaintenance;
    rentSaved += cf.monthlyRentSaved;
  }
  return { income, maintenance, rentSaved, net: income - maintenance };
}

// ==================== Appreciation ====================

// Monthly appreciation. annualRate = 0.04 → roughly +0.33% per month with noise.
export function appreciateProperty(p: Property): Property {
  const monthlyRate = p.appreciationRate / 12;
  // Add some noise — real estate appreciates unevenly
  const noise = rand(-0.5, 1.2) * (monthlyRate * 0.4);
  const newValue = Math.round(p.currentValue * (1 + monthlyRate + noise));
  return { ...p, currentValue: Math.max(p.purchasePrice * 0.4, newValue) };
}

// ==================== Collateral / credit line ====================

export function totalCollateralValue(properties: Property[]): number {
  return properties
    .filter((p) => PROPERTY_KIND_INFO[p.kind].canCollateralize)
    .reduce((sum, p) => sum + p.currentValue, 0);
}

export function maxSecuredBorrowing(properties: Property[]): number {
  return Math.floor(totalCollateralValue(properties) * LTV_CAP);
}

export function availableSecuredCredit(state: GameState): number {
  return Math.max(0, maxSecuredBorrowing(state.properties) - state.securedDebt);
}

// ==================== Listings generation ====================

// Each month, top up listings toward LISTINGS_REFRESH_TARGET, drop expired ones.
export function refreshListings(state: GameState, nextMonth: number): PropertyListing[] {
  // Keep listings that haven't expired
  const surviving = state.propertyListings.filter((l) => l.expiresMonth > nextMonth);
  const needed = Math.max(0, LISTINGS_REFRESH_TARGET - surviving.length);
  const fresh: PropertyListing[] = [];
  for (let i = 0; i < needed; i++) {
    fresh.push(generateListing(nextMonth));
  }
  return [...surviving, ...fresh];
}

function generateListing(month: number): PropertyListing {
  const template = pick(LISTING_TEMPLATES);
  const info = PROPERTY_KIND_INFO[template.kind];
  const cityId =
    template.specCities && template.specCities.length > 0
      ? pick(template.specCities)
      : pick(CITIES.map((c) => c.id));
  const price = round(rand(template.priceRange[0], template.priceRange[1]), 10_000);

  const passiveMonthlyRent = template.rentYieldRange
    ? Math.round((price * rand(template.rentYieldRange[0], template.rentYieldRange[1])) / 12)
    : undefined;
  const operationalSavings = template.savingsRange
    ? Math.round(price * rand(template.savingsRange[0], template.savingsRange[1]))
    : undefined;
  const appreciationRate = rand(template.appreciationRange[0], template.appreciationRange[1]);
  const monthlyMaintenance = Math.round(price * template.maintenanceRate);

  const name = pick(template.nameTemplates);
  const hook = pick(template.hookTemplates)
    .replace("$UNITS", `${Math.floor(rand(8, 28))}`)
    .replace("$OCC", `${Math.floor(rand(85, 98))}`)
    .replace("$YEAR", `${2025 + Math.floor(month / 12) + Math.floor(rand(2, 5))}`)
    .replace("$USE", info.compatibleIndustries[0] ?? "business")
    .replace(
      "$SAVINGS",
      operationalSavings
        ? `${(operationalSavings / 1000).toFixed(1)}K`
        : "2.0K"
    );

  return {
    id: uid(),
    name,
    kind: template.kind,
    category: info.category,
    cityId,
    price,
    hook,
    appreciationRate,
    monthlyMaintenance,
    passiveMonthlyRent,
    operationalSavings,
    appreciationEstimate: template.kind === "land" ? Math.round(appreciationRate * 300) : undefined,
    stakeholderBoost: template.stakeholderBoost,
    listedMonth: month,
    expiresMonth: month + LISTING_DURATION_MONTHS,
  };
}

// ==================== Action helpers ====================

export function applyPurchase(
  state: GameState,
  listingId: string
): { newState: Partial<GameState>; action: RealEstateAction } | null {
  const listing = state.propertyListings.find((l) => l.id === listingId);
  if (!listing) return null;
  if (state.cash < listing.price) return null;

  const info = PROPERTY_KIND_INFO[listing.kind];

  // Default usage depends on kind
  let initialUsage: PropertyUsage;
  if (info.isPrestige) {
    initialUsage = { kind: "trophy" };
  } else if (listing.kind === "land") {
    initialUsage = { kind: "speculative" };
  } else if (listing.kind === "apartment" && listing.passiveMonthlyRent) {
    initialUsage = {
      kind: "leased",
      tenant: "Mixed residents · private leases",
      monthlyRent: listing.passiveMonthlyRent,
      external: true,
    };
  } else if (listing.passiveMonthlyRent) {
    // Office / retail / industrial default to leased to an external tenant
    initialUsage = {
      kind: "leased",
      tenant: "Existing tenant (inherited lease)",
      monthlyRent: listing.passiveMonthlyRent,
      external: true,
    };
  } else {
    initialUsage = { kind: "vacant" };
  }

  const property: Property = {
    id: uid(),
    name: listing.name,
    kind: listing.kind,
    cityId: listing.cityId,
    purchasePrice: listing.price,
    purchaseMonth: state.month,
    currentValue: listing.price,
    appreciationRate: listing.appreciationRate,
    monthlyMaintenance: listing.monthlyMaintenance,
    usage: initialUsage,
    stakeholderBoost: listing.stakeholderBoost,
    developmentPotential:
      listing.kind === "land"
        ? { targetKind: "apartment", cost: Math.round(listing.price * 2.5) }
        : undefined,
  };

  // Apply prestige stakeholder boost on purchase
  const stakeholders: StakeholderReputation = { ...state.stakeholders };
  if (listing.stakeholderBoost) {
    if (listing.stakeholderBoost.publicImage) {
      stakeholders.publicImage = clamp(
        stakeholders.publicImage + listing.stakeholderBoost.publicImage,
        0,
        100
      );
    }
    if (listing.stakeholderBoost.press) {
      stakeholders.press = clamp(stakeholders.press + listing.stakeholderBoost.press, 0, 100);
    }
  }

  return {
    newState: {
      cash: state.cash - listing.price,
      properties: [...state.properties, property],
      propertyListings: state.propertyListings.filter((l) => l.id !== listingId),
      stakeholders,
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "purchase",
      propertyId: property.id,
      headline: `Purchased ${listing.name}`,
      detail: `${info.label} in ${CITY_MAP[listing.cityId]?.name ?? listing.cityId}. ${listing.hook}`,
      amountDelta: -listing.price,
    },
  };
}

export function applySale(
  state: GameState,
  propertyId: string
): { newState: Partial<GameState>; action: RealEstateAction } | null {
  const property = state.properties.find((p) => p.id === propertyId);
  if (!property) return null;

  // Sale price = current value (with a small transaction discount)
  const salePrice = Math.round(property.currentValue * 0.97);
  const info = PROPERTY_KIND_INFO[property.kind];

  // If the property was backing secured debt, the player needs to have enough
  // other collateral or enough cash to cover
  const collateralAfterSale = totalCollateralValue(
    state.properties.filter((p) => p.id !== propertyId)
  );
  const maxBorrowAfter = Math.floor(collateralAfterSale * LTV_CAP);
  if (state.securedDebt > maxBorrowAfter) {
    // Forced repayment from sale proceeds
    const shortfall = state.securedDebt - maxBorrowAfter;
    if (salePrice < shortfall) return null; // can't cover — deny
    return {
      newState: {
        cash: state.cash + (salePrice - shortfall),
        securedDebt: maxBorrowAfter,
        properties: state.properties.filter((p) => p.id !== propertyId),
      },
      action: {
        id: uid(),
        month: state.month,
        kind: "sale",
        propertyId,
        headline: `Sold ${property.name} · secured debt repaid`,
        detail: `Sale price $${(salePrice / 1000).toFixed(0)}K. $${(shortfall / 1000).toFixed(0)}K withheld to repay secured debt.`,
        amountDelta: salePrice - shortfall,
      },
    };
  }

  return {
    newState: {
      cash: state.cash + salePrice,
      properties: state.properties.filter((p) => p.id !== propertyId),
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "sale",
      propertyId,
      headline: `Sold ${property.name}`,
      detail: `${info.label} sold for ${salePrice >= property.purchasePrice ? "a gain" : "a loss"} of $${Math.abs(salePrice - property.purchasePrice).toLocaleString()}.`,
      amountDelta: salePrice,
    },
  };
}

export function applyLeaseOut(
  state: GameState,
  propertyId: string
): { newState: Partial<GameState>; action: RealEstateAction } | null {
  const property = state.properties.find((p) => p.id === propertyId);
  if (!property) return null;
  const info = PROPERTY_KIND_INFO[property.kind];
  if (!info.canLease) return null;
  if (property.usage.kind === "leased") return null;

  // Compute rent based on property value
  const monthlyRent = Math.round((property.currentValue * 0.075) / 12);
  const updated: Property = {
    ...property,
    usage: {
      kind: "leased",
      tenant: "New tenant · 3-year lease",
      monthlyRent,
      external: true,
    },
  };

  return {
    newState: {
      properties: state.properties.map((p) => (p.id === propertyId ? updated : p)),
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "lease_out",
      propertyId,
      headline: `Leased ${property.name} to an external tenant`,
      detail: `New monthly rent: $${monthlyRent.toLocaleString()}. 3-year term.`,
      amountDelta: 0,
    },
  };
}

export function applyOccupy(
  state: GameState,
  propertyId: string,
  companyId: string
): { newState: Partial<GameState>; action: RealEstateAction } | null {
  const property = state.properties.find((p) => p.id === propertyId);
  const company = state.companies.find((c) => c.id === companyId);
  if (!property || !company) return null;
  const info = PROPERTY_KIND_INFO[property.kind];
  if (!info.canOccupy) return null;
  if (!info.compatibleIndustries.includes(company.industry)) return null;

  // Rent savings = a fraction of property value annualized
  const rentSaved = Math.round((property.currentValue * 0.045) / 12);

  const updated: Property = {
    ...property,
    usage: { kind: "occupied", companyId, rentSaved },
  };

  return {
    newState: {
      properties: state.properties.map((p) => (p.id === propertyId ? updated : p)),
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "occupy",
      propertyId,
      headline: `${company.name} moved into ${property.name}`,
      detail: `Operating cost savings: $${rentSaved.toLocaleString()}/mo in saved rent.`,
      amountDelta: 0,
    },
  };
}

export function applyDevelop(
  state: GameState,
  propertyId: string
): { newState: Partial<GameState>; action: RealEstateAction } | null {
  const property = state.properties.find((p) => p.id === propertyId);
  if (!property || !property.developmentPotential) return null;
  if (state.cash < property.developmentPotential.cost) return null;

  const targetKind = property.developmentPotential.targetKind;
  const newPrice = property.purchasePrice + property.developmentPotential.cost;
  const newValue = Math.round(newPrice * 1.15); // development delivers immediate uplift
  const info = PROPERTY_KIND_INFO[targetKind];

  const updated: Property = {
    ...property,
    kind: targetKind,
    purchasePrice: newPrice,
    currentValue: newValue,
    monthlyMaintenance: Math.round(newValue * 0.0012),
    appreciationRate: 0.04,
    usage:
      targetKind === "apartment"
        ? {
            kind: "leased",
            tenant: "Mixed residents · private leases",
            monthlyRent: Math.round((newValue * 0.08) / 12),
            external: true,
          }
        : { kind: "vacant" },
    developmentPotential: undefined,
  };

  return {
    newState: {
      cash: state.cash - property.developmentPotential.cost,
      properties: state.properties.map((p) => (p.id === propertyId ? updated : p)),
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "develop",
      propertyId,
      headline: `Developed ${property.name} into ${info.label.toLowerCase()}`,
      detail: `Construction cost: $${property.developmentPotential.cost.toLocaleString()}. New value: $${newValue.toLocaleString()}.`,
      amountDelta: -property.developmentPotential.cost,
    },
  };
}

export function applyBorrowSecured(
  state: GameState,
  amount: number
): { newState: Partial<GameState>; action: RealEstateAction } | null {
  const available = availableSecuredCredit(state);
  if (amount <= 0) return null;
  if (amount > available) return null;

  return {
    newState: {
      cash: state.cash + amount,
      securedDebt: state.securedDebt + amount,
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "borrow_secured",
      headline: `Borrowed $${(amount / 1000).toFixed(0)}K against portfolio`,
      detail: `Secured at ${(SECURED_RATE_ANNUAL * 100).toFixed(1)}% APR. Backed by real estate holdings.`,
      amountDelta: amount,
    },
  };
}

export function applyRepaySecured(
  state: GameState,
  amount: number
): { newState: Partial<GameState>; action: RealEstateAction } | null {
  const pay = Math.min(amount, state.securedDebt, state.cash);
  if (pay <= 0) return null;

  return {
    newState: {
      cash: state.cash - pay,
      securedDebt: state.securedDebt - pay,
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "repay_secured",
      headline: `Repaid $${(pay / 1000).toFixed(0)}K of secured debt`,
      detail: `Remaining balance: $${(state.securedDebt - pay).toLocaleString()}.`,
      amountDelta: -pay,
    },
  };
}

export function applyHostEvent(
  state: GameState,
  propertyId: string
): { newState: Partial<GameState>; action: RealEstateAction } | null {
  const property = state.properties.find((p) => p.id === propertyId);
  if (!property) return null;
  const info = PROPERTY_KIND_INFO[property.kind];
  if (!info.isPrestige) return null;

  const cost = Math.round(property.currentValue * 0.002);
  if (state.cash < cost) return null;

  const stakeholders: StakeholderReputation = { ...state.stakeholders };
  stakeholders.publicImage = clamp(stakeholders.publicImage + 4, 0, 100);
  stakeholders.press = clamp(stakeholders.press + 5, 0, 100);
  stakeholders.government = clamp(stakeholders.government + 2, 0, 100);

  return {
    newState: {
      cash: state.cash - cost,
      stakeholders,
    },
    action: {
      id: uid(),
      month: state.month,
      kind: "host_event",
      propertyId,
      headline: `Hosted a private gathering at ${property.name}`,
      detail: `Cost: $${cost.toLocaleString()}. Public image +4, press +5, government +2.`,
      amountDelta: -cost,
    },
  };
}

// ==================== Best-match helper for UI ====================

// For an operational property, find the single company that should occupy it
// (matching industry, not already in that property). Used for the "Occupy (Name)" button.
export function bestCompanyForProperty(state: GameState, property: Property): string | null {
  const info = PROPERTY_KIND_INFO[property.kind];
  if (!info.canOccupy) return null;
  const candidates = state.companies.filter((c) =>
    info.compatibleIndustries.includes(c.industry)
  );
  if (candidates.length === 0) return null;
  return candidates[0].id;
}
