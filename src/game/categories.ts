/**
 * Single source of truth for per-category metadata.
 *
 * Any time the sim needs to know something that varies by product category —
 * dev timeline, team size, revenue model, default pricing, ARPU, segment mix,
 * name suffixes, market size, competition — it looks it up here.
 *
 * Adding a new category = add one row. Do not branch on category id in other files.
 */

import type {
  CategoryInfo,
  ProductCategory,
  ProductCategoryChoice,
  RevenueModel,
  SegmentedUsers,
} from "./types";

/**
 * Master table. Order here is the order shown in the product picker UI.
 *
 * Numbers were balanced against the existing 6-category sim-harness baseline:
 * - marketSize is relative (1.0 = old-baseline productivity TAM).
 * - marketGrowth is weekly, so 0.015 ≈ 80% annualized.
 * - defaultPrice / arpu are $/seat/month.
 * - segmentMix sums to 1.0 per row (checked at boot).
 */
export const CATEGORY_INFO: Record<ProductCategory, CategoryInfo> = {
  application: {
    id: "application",
    label: "Application Software",
    blurb: "Consumer & prosumer apps — freemium funnels, big TAM, crowded.",
    detail: "Everyday-use apps: forms, docs, scheduling, note-taking, mobile utilities. The largest addressable market, reachable with a free tier and a paid upgrade. Broad appeal means word-of-mouth can compound fast; it also means a dozen clones will ship the month you launch.",
    devWeeksBase: 6,
    teamSizeMin: 2,
    maintenanceBurden: 0.7,
    marketSize: 1.5,
    marketGrowth: 0.015,
    competitionDensity: 0.85,
    revenueModel: "freemium",
    defaultPrice: 15,
    arpu: 20,
    segmentMix: { enterprise: 0.05, smb: 0.25, selfServe: 0.70 },
    nameSuffixes: ["Flow", "Hub", "Space", "Loop", "Board", "Kit", "Desk"],
  },

  system: {
    id: "system",
    label: "System Software",
    blurb: "OS, drivers, low-level tooling — one-time licensing, slow cadence.",
    detail: "Operating systems, device drivers, virtualization, language runtimes. Long build cycles and small, demanding audiences. Once a system product is trusted, it's trusted for a decade — but earning that trust takes years and senior talent.",
    devWeeksBase: 20,
    teamSizeMin: 8,
    maintenanceBurden: 1.5,
    marketSize: 0.6,
    marketGrowth: 0.005,
    competitionDensity: 0.25,
    revenueModel: "one-time",
    defaultPrice: 120,
    arpu: 90,
    segmentMix: { enterprise: 0.20, smb: 0.30, selfServe: 0.50 },
    nameSuffixes: ["OS", "Core", "Kernel", "Stack", "Runtime", "Engine", "Prime"],
  },

  enterprise: {
    id: "enterprise",
    label: "Enterprise Software",
    blurb: "ERP/HRIS-style suites — contract sales, sticky, long cycles.",
    detail: "Multi-module platforms for finance, HR, supply chain, or sales ops. Deals are measured in seven figures and quarters, not impressions and weeks. Once you're wired in, you don't get ripped out — but getting in takes a field sales team and patience for security reviews.",
    devWeeksBase: 14,
    teamSizeMin: 6,
    maintenanceBurden: 1.3,
    marketSize: 0.5,
    marketGrowth: 0.012,
    competitionDensity: 0.55,
    revenueModel: "contract",
    defaultPrice: 65,
    arpu: 120,
    segmentMix: { enterprise: 0.65, smb: 0.25, selfServe: 0.10 },
    nameSuffixes: ["Enterprise", "Suite", "Cloud", "Platform", "Works", "Central"],
  },

  "dev-tools": {
    id: "dev-tools",
    label: "Developer Tools",
    blurb: "CI/CD, SDKs, APIs — subscription, loyal, prosumer-heavy.",
    detail: "Build tools, CI/CD, editors, API platforms, observability. Developers pay well for polish and hate switching — but you have to win them one skeptical trial at a time. Viral inside engineering orgs, but top-of-funnel comes from credibility, not ads.",
    devWeeksBase: 8,
    teamSizeMin: 3,
    maintenanceBurden: 0.9,
    marketSize: 0.7,
    marketGrowth: 0.025,
    competitionDensity: 0.75,
    revenueModel: "subscription",
    defaultPrice: 29,
    arpu: 45,
    segmentMix: { enterprise: 0.15, smb: 0.35, selfServe: 0.50 },
    nameSuffixes: ["CI", "Build", "Pipeline", "SDK", "Labs", "Forge", "Ship"],
  },

  custom: {
    id: "custom",
    label: "Custom Software",
    blurb: "Bespoke & services builds — contract, margin over scale.",
    detail: "Tailored software-plus-services builds for a handful of clients. You win on relationships and deep domain expertise, not product-led growth. Each deal is a mini-launch with its own scope; revenue is lumpy but high-margin when you run a tight ship.",
    devWeeksBase: 10,
    teamSizeMin: 4,
    maintenanceBurden: 0.8,
    marketSize: 0.4,
    marketGrowth: 0.010,
    competitionDensity: 0.35,
    revenueModel: "contract",
    defaultPrice: 400,
    arpu: 300,
    segmentMix: { enterprise: 0.85, smb: 0.15, selfServe: 0.00 },
    nameSuffixes: ["Partners", "Works", "Bespoke", "Studio", "Collective", "Craft"],
  },

  embedded: {
    id: "embedded",
    label: "Embedded & IoT",
    blurb: "Firmware & connected devices — one-time hardware+software bundles.",
    detail: "Firmware, edge intelligence, fleet software for connected devices. You ship on hardware cycles and bill per unit, which means your growth is gated by manufacturing partnerships. Margins are decent; repeatable distribution is the hard part.",
    devWeeksBase: 16,
    teamSizeMin: 5,
    maintenanceBurden: 1.4,
    marketSize: 0.5,
    marketGrowth: 0.020,
    competitionDensity: 0.40,
    revenueModel: "one-time",
    defaultPrice: 80,
    arpu: 65,
    segmentMix: { enterprise: 0.30, smb: 0.45, selfServe: 0.25 },
    nameSuffixes: ["Edge", "Node", "Mesh", "Pulse", "Relay", "Bridge", "Beacon"],
  },

  "content-media": {
    id: "content-media",
    label: "Content & Media",
    blurb: "Creator tools & streaming — subscription, viral, churny.",
    detail: "Design apps, video editors, audio production, publishing platforms. The output is inherently shareable, which drives cheap acquisition. But casual users churn fast and pros are demanding — you have to serve both without losing either.",
    devWeeksBase: 8,
    teamSizeMin: 3,
    maintenanceBurden: 0.9,
    marketSize: 1.3,
    marketGrowth: 0.018,
    competitionDensity: 0.90,
    revenueModel: "subscription",
    defaultPrice: 18,
    arpu: 22,
    segmentMix: { enterprise: 0.10, smb: 0.30, selfServe: 0.60 },
    nameSuffixes: ["Studio", "Canvas", "Reel", "Frame", "Stage", "Palette", "Script"],
  },

  "finance-ops": {
    id: "finance-ops",
    label: "Finance & Operations",
    blurb: "Accounting, billing, supply chain — subscription, regulated.",
    detail: "General ledger, payroll, AP/AR, billing, procurement, supply chain. Every business runs on some version of this software, and nobody enjoys changing it. Pricing is steady, retention is excellent, and compliance is non-negotiable.",
    devWeeksBase: 12,
    teamSizeMin: 4,
    maintenanceBurden: 1.1,
    marketSize: 0.8,
    marketGrowth: 0.015,
    competitionDensity: 0.50,
    revenueModel: "subscription",
    defaultPrice: 45,
    arpu: 75,
    segmentMix: { enterprise: 0.40, smb: 0.40, selfServe: 0.20 },
    nameSuffixes: ["Books", "Ledger", "Flow", "Billing", "Ops", "Chain", "Ledgerworks"],
  },

  "security-it": {
    id: "security-it",
    label: "Security & IT",
    blurb: "MDM, SIEM, endpoint — subscription, compliance gate, board-level.",
    detail: "Endpoint protection, identity, device management, SIEM, vulnerability tooling. Every breach is a news cycle and a board meeting. Sales cycles skew toward enterprise and CISOs, but credibility signals (certifications, analyst coverage) swing deals more than features.",
    devWeeksBase: 12,
    teamSizeMin: 4,
    maintenanceBurden: 1.2,
    marketSize: 1.0,
    marketGrowth: 0.025,
    competitionDensity: 0.65,
    revenueModel: "subscription",
    defaultPrice: 99,
    arpu: 100,
    segmentMix: { enterprise: 0.50, smb: 0.35, selfServe: 0.15 },
    nameSuffixes: ["Shield", "Guard", "Vault", "Sentry", "Watch", "Sentinel", "Trust"],
  },
};

// --- Sanity check — segmentMix must sum to 1 in every row.
for (const info of Object.values(CATEGORY_INFO)) {
  const sum = info.segmentMix.enterprise + info.segmentMix.smb + info.segmentMix.selfServe;
  if (Math.abs(sum - 1) > 0.001) {
    // eslint-disable-next-line no-console
    console.warn(`CATEGORY_INFO[${info.id}].segmentMix sums to ${sum}, not 1`);
  }
}

/** Ordered list for the product-picker UI. */
export const PRODUCT_CATEGORIES: ProductCategoryChoice[] = (
  Object.values(CATEGORY_INFO) as CategoryInfo[]
).map(info => ({
  id: info.id,
  label: info.label,
  blurb: info.blurb,
  detail: info.detail,
  suggestedPrice: info.defaultPrice,
  revenueModel: info.revenueModel,
  devWeeksBase: info.devWeeksBase,
  teamSizeMin: info.teamSizeMin,
}));

/** Convenience accessors — prefer these over direct CATEGORY_INFO lookups at call sites. */

export function infoFor(cat: ProductCategory): CategoryInfo {
  const info = CATEGORY_INFO[cat];
  if (!info) throw new Error(`Unknown product category: ${cat}`);
  return info;
}

export function segmentMixFor(cat: ProductCategory): SegmentedUsers {
  const mix = infoFor(cat).segmentMix;
  return { enterprise: mix.enterprise, smb: mix.smb, selfServe: mix.selfServe };
}

export function defaultPriceFor(cat: ProductCategory): number {
  return infoFor(cat).defaultPrice;
}

export function arpuFor(cat: ProductCategory): number {
  return infoFor(cat).arpu;
}

export function nameSuffixesFor(cat: ProductCategory): string[] {
  return infoFor(cat).nameSuffixes;
}

export function revenueModelFor(cat: ProductCategory): RevenueModel {
  return infoFor(cat).revenueModel;
}

export function devWeeksBaseFor(cat: ProductCategory): number {
  return infoFor(cat).devWeeksBase;
}

export function teamSizeMinFor(cat: ProductCategory): number {
  return infoFor(cat).teamSizeMin;
}

export function marketSizeFor(cat: ProductCategory): number {
  return infoFor(cat).marketSize;
}

export function marketGrowthFor(cat: ProductCategory): number {
  return infoFor(cat).marketGrowth;
}

export function maintenanceBurdenFor(cat: ProductCategory): number {
  return infoFor(cat).maintenanceBurden;
}

export function competitionDensityFor(cat: ProductCategory): number {
  return infoFor(cat).competitionDensity;
}
