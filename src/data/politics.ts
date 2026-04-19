import type { IndustryId, StakeholderReputation } from "@/types";

// ---------- Donation options ----------
export interface DonationOption {
  id: string;
  title: string;
  description: string;
  amount: number;
  effects: {
    antitrustDelta?: number;
    laborDelta?: number;
    permitSpeedDelta?: number;
    governmentDelta?: number;
    publicImageDelta?: number;
    pressDelta?: number;
    employeesDelta?: number;
    customersDelta?: number;
  };
}

export const DONATION_OPTIONS: DonationOption[] = [
  {
    id: "pro_business_pac",
    title: "Pro-business coalition PAC",
    description: "Industry-aligned PAC. Broad protection against future regulation. Discreet.",
    amount: 40_000,
    effects: { antitrustDelta: -6, governmentDelta: 4, publicImageDelta: -2 },
  },
  {
    id: "mayor_reelect",
    title: "Mayor's re-election fund",
    description: "Local. Permits clear faster. Everyone in City Hall knows your name.",
    amount: 25_000,
    effects: { permitSpeedDelta: 15, governmentDelta: 6, publicImageDelta: -1 },
  },
  {
    id: "labor_coalition",
    title: "Workers' advocacy coalition",
    description: "A reputational play. Costs you in the boardroom; buys you everywhere else.",
    amount: 30_000,
    effects: { employeesDelta: 8, customersDelta: 5, publicImageDelta: 6, governmentDelta: -3 },
  },
  {
    id: "chamber_commerce",
    title: "Chamber of Commerce gala",
    description: "Sponsorship. A night of rubber chicken. Long tail of small favors.",
    amount: 15_000,
    effects: { governmentDelta: 3, pressDelta: 2 },
  },
];

// ---------- Lobbying campaign templates ----------
export interface LobbyingTemplate {
  id: string;
  title: string;
  detail: string;
  target: "labor" | "tax" | "antitrust" | "permit_speed";
  targetChange: number;
  odds: number;                // 0..1
  monthsToResolve: number;
  monthlyCost: number;
}

export const LOBBYING_TEMPLATES: LobbyingTemplate[] = [
  {
    id: "slow_labor_bill",
    title: "Push to slow the labor bill",
    detail: "Target: state legislature. 2–3 months to resolve.",
    target: "labor",
    targetChange: -8,
    odds: 0.45,
    monthsToResolve: 3,
    monthlyCost: 6_000,
  },
  {
    id: "small_biz_tax",
    title: "Lobby for small business tax credit",
    detail: "Target: federal. Long odds, high upside. 4–6 months.",
    target: "tax",
    targetChange: -0.03,
    odds: 0.2,
    monthsToResolve: 6,
    monthlyCost: 8_000,
  },
  {
    id: "antitrust_relief",
    title: "Contest antitrust inquiry",
    detail: "Target: DOJ. Active only after growing large enough to attract scrutiny.",
    target: "antitrust",
    targetChange: -10,
    odds: 0.35,
    monthsToResolve: 4,
    monthlyCost: 12_000,
  },
  {
    id: "expedite_permits",
    title: "Expedite permit process",
    detail: "Target: zoning boards in multiple cities. Quick results.",
    target: "permit_speed",
    targetChange: 12,
    odds: 0.55,
    monthsToResolve: 2,
    monthlyCost: 4_000,
  },
];

// ---------- Relocation targets ----------
export interface RelocationOption {
  cityId: string;             // must match a city in cities.ts
  cityLabel: string;          // display name with state
  description: string;
  cost: number;
  effects: {
    corporateTaxDelta: number;    // e.g. -0.025 = 2.5% cut
    laborRegDelta: number;
    moraleDelta: number;
    brandDelta?: number;
    revenueMultiplier?: number;   // e.g. -0.04 = -4% revenue
  };
}

export const RELOCATION_OPTIONS: RelocationOption[] = [
  {
    cityId: "nashville",
    cityLabel: "Nashville, TN",
    description:
      "No state income tax. Moderate labor regulation. Growing tech corridor. Closer to your eastern pipeline.",
    cost: 84_000,
    effects: { corporateTaxDelta: -0.025, laborRegDelta: -12, moraleDelta: -10 },
  },
  {
    cityId: "miami",
    cityLabel: "Miami, FL",
    description:
      "No state tax, minimal labor rules. But 40% of your engineering team has already said they won't follow.",
    cost: 112_000,
    effects: { corporateTaxDelta: -0.03, laborRegDelta: -18, moraleDelta: -22, brandDelta: -6 },
  },
  {
    cityId: "phoenix",
    cityLabel: "Phoenix, AZ",
    description:
      "Lowest cost of living. Light regulation. Farther from most of your customers.",
    cost: 68_000,
    effects: { corporateTaxDelta: -0.018, laborRegDelta: -10, moraleDelta: -8, revenueMultiplier: -0.04 },
  },
  {
    cityId: "austin",
    cityLabel: "Austin, TX",
    description:
      "No state income tax. Business-friendly. Your likely baseline if starting elsewhere.",
    cost: 72_000,
    effects: { corporateTaxDelta: -0.022, laborRegDelta: -8, moraleDelta: -9 },
  },
];

// ---------- Automation options ----------
export interface AutomationOption {
  id: string;
  industry: IndustryId;
  title: string;
  description: string;
  cost: number;
  laborExposureReduction: number;
  moraleDelta: number;
  outputBonus?: number;        // e.g. 0.08 = 8% revenue bump
}

export const AUTOMATION_OPTIONS: AutomationOption[] = [
  {
    id: "pos_kiosks",
    industry: "coffee",
    title: "Point-of-sale automation · Coffee",
    description:
      "Self-order kiosks across your coffee locations. Reduces baristas needed per shift by one.",
    cost: 48_000,
    laborExposureReduction: 8,
    moraleDelta: -6,
  },
  {
    id: "ci_cd_ai",
    industry: "software",
    title: "CI/CD + AI tooling · Software",
    description: "Developer productivity tooling. Fewer engineers, same output.",
    cost: 72_000,
    laborExposureReduction: 14,
    moraleDelta: -4,
    outputBonus: 0.08,
  },
  {
    id: "prefab",
    industry: "construction",
    title: "Prefab construction systems",
    description: "Off-site component assembly. Shorter build times, less site labor.",
    cost: 95_000,
    laborExposureReduction: 12,
    moraleDelta: -10,
    outputBonus: 0.1,
  },
  {
    id: "warehouse_robots",
    industry: "ecommerce",
    title: "Warehouse automation · E-commerce",
    description: "Robotic picking and packing. Staff runs the floor, not the aisles.",
    cost: 85_000,
    laborExposureReduction: 15,
    moraleDelta: -8,
    outputBonus: 0.06,
  },
  {
    id: "kitchen_automation",
    industry: "fastfood",
    title: "Kitchen automation · Fast Food",
    description: "Automated prep lines. Consistency up, headcount down.",
    cost: 62_000,
    laborExposureReduction: 10,
    moraleDelta: -7,
    outputBonus: 0.05,
  },
  {
    id: "doc_review_ai",
    industry: "law",
    title: "Document review AI · Law",
    description:
      "AI-assisted discovery and contract review. Junior associates do less grunt work — senior partners still bill the hours.",
    cost: 78_000,
    laborExposureReduction: 6,     // lowest in the game — AI doesn't replace senior attorneys
    moraleDelta: -3,                // juniors are relieved, not threatened
    outputBonus: 0.04,
  },
];

// ---------- Default stakeholder reputation ----------
export const DEFAULT_STAKEHOLDERS: StakeholderReputation = {
  customers: 50,
  employees: 65,
  investors: 55,
  government: 50,
  publicImage: 50,
  press: 55,
};

// ---------- Stakeholder display helpers ----------
export const STAKEHOLDER_LABELS: Record<keyof StakeholderReputation, string> = {
  customers: "Customers",
  employees: "Employees",
  investors: "Investors",
  government: "Government",
  publicImage: "Public Image",
  press: "Press",
};
