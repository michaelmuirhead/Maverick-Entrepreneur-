import type { IndustryId, PropertyCategory, PropertyKind } from "@/types";

// ---------- Archetype info for display + engine ----------
export interface PropertyKindInfo {
  label: string;
  category: PropertyCategory;
  canOccupy: boolean;            // can a player's company occupy it?
  canLease: boolean;             // can be leased out for rent?
  compatibleIndustries: IndustryId[];  // which companies can occupy this
  isPrestige: boolean;
  canCollateralize: boolean;
}

export const PROPERTY_KIND_INFO: Record<PropertyKind, PropertyKindInfo> = {
  office: {
    label: "Office Building",
    category: "operational",
    canOccupy: true,
    canLease: true,
    compatibleIndustries: ["software", "ecommerce", "law"],
    isPrestige: false,
    canCollateralize: true,
  },
  retail: {
    label: "Retail Space",
    category: "operational",
    canOccupy: true,
    canLease: true,
    compatibleIndustries: ["coffee", "fastfood", "ecommerce"],
    isPrestige: false,
    canCollateralize: true,
  },
  industrial: {
    label: "Industrial · Warehouse",
    category: "operational",
    canOccupy: true,
    canLease: true,
    compatibleIndustries: ["ecommerce", "construction"],
    isPrestige: false,
    canCollateralize: true,
  },
  apartment: {
    label: "Apartment Building",
    category: "income",
    canOccupy: false,
    canLease: true,
    compatibleIndustries: [],
    isPrestige: false,
    canCollateralize: true,
  },
  land: {
    label: "Undeveloped Land",
    category: "speculative",
    canOccupy: false,
    canLease: false,
    compatibleIndustries: [],
    isPrestige: false,
    canCollateralize: true,
  },
  penthouse: {
    label: "Prestige · Penthouse",
    category: "prestige",
    canOccupy: false,
    canLease: false,
    compatibleIndustries: [],
    isPrestige: true,
    canCollateralize: false,
  },
  vineyard: {
    label: "Prestige · Vineyard",
    category: "prestige",
    canOccupy: false,
    canLease: false,
    compatibleIndustries: [],
    isPrestige: true,
    canCollateralize: false,
  },
  townhouse: {
    label: "Prestige · Townhouse",
    category: "prestige",
    canOccupy: false,
    canLease: false,
    compatibleIndustries: [],
    isPrestige: true,
    canCollateralize: false,
  },
};

// ---------- Listing templates ----------
// Used to generate fresh marketplace listings each month
export interface ListingTemplate {
  kind: PropertyKind;
  nameTemplates: string[];           // used with $CITY or just picked
  hookTemplates: string[];
  priceRange: [number, number];
  rentYieldRange?: [number, number]; // annual yield, e.g. 0.07..0.09
  savingsRange?: [number, number];   // operational savings /mo as fraction of price
  appreciationRange: [number, number]; // annual
  maintenanceRate: number;           // monthly maintenance as fraction of price
  stakeholderBoost?: { publicImage?: number; press?: number };
  specCities?: string[];             // if set, only appears in these cities
}

export const LISTING_TEMPLATES: ListingTemplate[] = [
  // Apartments — income
  {
    kind: "apartment",
    nameTemplates: [
      "Eastside Lofts",
      "Silverpeak Residences",
      "Meridian Flats",
      "Briar Hollow Apartments",
      "Redstone Commons",
      "The Wellington",
    ],
    hookTemplates: [
      "$UNITS units, $OCC% occupied. The previous owner is divorcing and needs out by Q2.",
      "Recently renovated. Tenant waitlist. Owner retiring after 22 years.",
      "Solid building. Old furnace. Builds slowly, pays steadily.",
      "A property manager runs it day-to-day. You'd barely have to look at it.",
    ],
    priceRange: [420_000, 1_100_000],
    rentYieldRange: [0.075, 0.098],
    appreciationRange: [0.03, 0.055],
    maintenanceRate: 0.0015,
  },
  // Office — operational or income
  {
    kind: "office",
    nameTemplates: [
      "The Travis Building",
      "Franklin Commons",
      "Old Mercantile Tower",
      "Harbor Point Offices",
      "Constitution Hall",
    ],
    hookTemplates: [
      "Currently leased to a stable tenant through $YEAR. Could also house your team.",
      "Half-occupied. Previous anchor tenant broke their lease. A bargain for someone decisive.",
      "Charming pre-war lobby. Needs new HVAC. Still underpriced for the corridor.",
    ],
    priceRange: [700_000, 1_800_000],
    rentYieldRange: [0.065, 0.082],
    savingsRange: [0.003, 0.005],
    appreciationRange: [0.035, 0.06],
    maintenanceRate: 0.0008,
  },
  // Retail
  {
    kind: "retail",
    nameTemplates: [
      "Coffee Corner, Suite 2",
      "Marigold Plaza, Suite C",
      "The Atrium, Bay 4",
      "Riverside Retail, Unit 8",
    ],
    hookTemplates: [
      "Prime corner. A $USE location here would cut rent $$SAVINGS/mo vs. leasing.",
      "High foot traffic. Anchor tenant pulled out. Priced to move.",
      "Small, charming, and exactly the right size for a flagship.",
    ],
    priceRange: [280_000, 620_000],
    rentYieldRange: [0.07, 0.09],
    savingsRange: [0.0035, 0.0055],
    appreciationRange: [0.025, 0.05],
    maintenanceRate: 0.0012,
  },
  // Industrial
  {
    kind: "industrial",
    nameTemplates: [
      "Harbor 7 Distribution",
      "Dockyard 11",
      "Riverbend Warehouse",
      "Ironworks Complex",
    ],
    hookTemplates: [
      "Light fulfillment. Would cut your e-commerce operating costs.",
      "35,000 sqft. Loading docks recently rebuilt. Owner upgrading elsewhere.",
      "Boring, profitable. The kind of asset nobody writes profiles about.",
    ],
    priceRange: [320_000, 780_000],
    rentYieldRange: [0.068, 0.085],
    savingsRange: [0.003, 0.005],
    appreciationRange: [0.025, 0.045],
    maintenanceRate: 0.001,
  },
  // Land
  {
    kind: "land",
    nameTemplates: [
      "Westlake Parcel",
      "Rosemont Acreage",
      "North Ridge Tract",
      "The Meridian Lot",
      "Cedar Grove Land",
    ],
    hookTemplates: [
      "Rumor: the city is extending the light rail through here within 3 years.",
      "Zoned for mixed commercial. In the path of the city's expansion corridor.",
      "14 acres. Currently pasture. Quietly being bought up by someone else.",
      "A quiet corner nobody is watching yet. That changes things, eventually.",
    ],
    priceRange: [120_000, 420_000],
    appreciationRange: [0.08, 0.18],      // higher potential, higher variance
    maintenanceRate: 0.0005,
  },
  // Prestige — penthouse
  {
    kind: "penthouse",
    nameTemplates: [
      "Tribeca Penthouse 41B",
      "Russian Hill Penthouse",
      "Marina Skyline 38",
      "The Lakefront Penthouse",
    ],
    hookTemplates: [
      "A landmark address. Rarely mentioned in earnings calls. Mentioned often at dinner parties.",
      "The elevator opens into your foyer. The windows go from floor to ceiling. The press will notice.",
      "High up. Quiet. Expensive to maintain. Photographed by strangers from the sidewalk.",
    ],
    priceRange: [3_200_000, 6_500_000],
    appreciationRange: [0.03, 0.055],
    maintenanceRate: 0.0008,
    stakeholderBoost: { publicImage: 8, press: 12 },
  },
  // Prestige — vineyard
  {
    kind: "vineyard",
    nameTemplates: [
      "Hart Family Estate",
      "Westcrest Vineyard",
      "Old Oak Estate",
      "Shadow Creek Vineyard",
    ],
    hookTemplates: [
      "36 acres, 18 of them planted. The wine is mediocre. The grounds are magnificent. The name is memorable.",
      "A working vineyard, barely. A trophy, unambiguously.",
      "The previous owner held it for 40 years. He wants to see it go to someone who'll respect it.",
    ],
    priceRange: [1_400_000, 2_800_000],
    appreciationRange: [0.025, 0.045],
    maintenanceRate: 0.0009,
    stakeholderBoost: { publicImage: 6, press: 8 },
  },
  // Prestige — townhouse
  {
    kind: "townhouse",
    nameTemplates: [
      "18 Commonwealth Ave",
      "42 Beacon Hill Row",
      "Embassy Row · 2318",
      "Russian Hill Row House",
    ],
    hookTemplates: [
      "A Brahmin address. The view from the second floor has been painted six times.",
      "Old money sold it to new money. New money is selling to you.",
      "Four floors. A garden. A small library. Rooms older than most towns.",
    ],
    priceRange: [4_200_000, 8_000_000],
    appreciationRange: [0.028, 0.05],
    maintenanceRate: 0.0007,
    stakeholderBoost: { publicImage: 10, press: 14 },
  },
];

// ---------- Economic constants ----------
export const LTV_CAP = 0.6;                // 60% loan-to-value cap for secured borrowing
export const SECURED_RATE_ANNUAL = 0.048;  // 4.8% APR
export const LISTING_DURATION_MONTHS = 3;  // listings persist 3 months before disappearing
export const LISTINGS_REFRESH_TARGET = 6;  // aim to have ~6 listings on the market at any time
