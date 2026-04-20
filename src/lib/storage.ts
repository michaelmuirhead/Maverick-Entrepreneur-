import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type {
  AcquisitionDeal,
  Competitor,
  CultureState,
  EconomyState,
  GameState,
  GovernmentContract,
  IpoState,
  MarketingCampaign,
  OfficeState,
  OpenSourceProject,
  Partnership,
  Patent,
  Product,
  ProductCategory,
  RegionalPresence,
  RevenueModel,
  SegmentedPricing,
  SegmentedUsers,
  SupportState,
} from "@/game/types";
import { derivePricing, ZERO_USERS } from "@/game/segments";
import { hydrateLifecycle } from "@/game/mergers";
import { revenueModelFor, segmentMixFor } from "@/game/categories";
import { initEconomy } from "@/game/economy";
import { initOffice } from "@/game/office";
import { initCulture } from "@/game/culture";
import { initSupport } from "@/game/support";
import { initRegions, initIpo } from "@/game/portfolio";

const KEY = "maverick.save.v1";

/**
 * v5: expanded category taxonomy (6 → 9). Remap legacy category ids on products,
 * competitors, and archived products so downstream sim code only sees the new ids.
 *
 * This is deliberately one-way — there's no going back to the old 6-category world.
 */
const V5_CATEGORY_REMAP: Record<string, ProductCategory> = {
  productivity:   "application",
  analytics:      "enterprise",
  crm:            "enterprise",
  creative:       "content-media",
  infrastructure: "security-it",
  // dev-tools keeps its id; listed for completeness so a lookup always resolves.
  "dev-tools":    "dev-tools",
};

function remapCategory(cat: unknown): ProductCategory {
  if (typeof cat !== "string") return "application";
  // Already a valid new-taxonomy id? Leave it alone.
  const newCats: ProductCategory[] = [
    "application","system","enterprise","dev-tools","custom",
    "embedded","content-media","finance-ops","security-it",
  ];
  if (newCats.includes(cat as ProductCategory)) return cat as ProductCategory;
  return V5_CATEGORY_REMAP[cat] ?? "application";
}

/**
 * Backfill fields added in later releases so old saves don't crash.
 * v2: segmented users+pricing; lifetime tallies; archivedProducts collection.
 * v3: per-product tech debt + refactor sprint.
 * v4: competitor lifecycle + MRR + users + stage; state.deals[] history.
 * v5: expanded product taxonomy (9 categories) + per-product revenueModel
 *     + lastWeekUserTotal. Old 6-category ids are remapped onto the new list.
 * v6: macro economy phase (boom/stable/recession) + trend ramp/fade fields.
 *     Legacy saves get seeded with a fresh stable economy; existing trends
 *     keep their snap-on behavior until they expire naturally.
 * v7: big portfolio expansion — office tiers, culture/perks, marketing
 *     campaigns, support quality, patents, open-source sponsorships,
 *     partnerships, government contracts, regional expansion, IPO state
 *     machine. All new subsystems seed to sensible defaults for legacy saves.
 */
export function migrateSave(state: GameState): GameState {
  const legacyEconomy = (state as GameState & { economy?: EconomyState }).economy;
  const economy: EconomyState = legacyEconomy && typeof legacyEconomy.phase === "string"
    ? legacyEconomy
    : { ...initEconomy(), phaseStartedWeek: state.week ?? 0 };
  // v7: office/culture/support/regions/ipo default to fresh state for legacy saves;
  // array-valued subsystems default to empty lists.
  const legacyOffice = (state as GameState & { office?: OfficeState }).office;
  const office: OfficeState = legacyOffice && typeof legacyOffice.tier === "string"
    ? legacyOffice
    : { ...initOffice(), sinceWeek: state.week ?? 0 };
  const legacyCulture = (state as GameState & { culture?: CultureState }).culture;
  const culture: CultureState = legacyCulture && Array.isArray(legacyCulture.perks)
    ? legacyCulture
    : initCulture();
  const legacySupport = (state as GameState & { support?: SupportState }).support;
  const support: SupportState = legacySupport && typeof legacySupport.quality === "number"
    ? legacySupport
    : initSupport();
  const legacyRegions = (state as GameState & { regions?: RegionalPresence[] }).regions;
  const regions: RegionalPresence[] = Array.isArray(legacyRegions) && legacyRegions.length > 0
    ? legacyRegions
    : initRegions();
  const legacyIpo = (state as GameState & { ipo?: IpoState }).ipo;
  const ipo: IpoState = legacyIpo && typeof legacyIpo.stage === "string"
    ? legacyIpo
    : initIpo();
  const campaigns: MarketingCampaign[] = Array.isArray(
    (state as GameState & { campaigns?: MarketingCampaign[] }).campaigns,
  )
    ? ((state as GameState & { campaigns?: MarketingCampaign[] }).campaigns as MarketingCampaign[])
    : [];
  const patents: Patent[] = Array.isArray(
    (state as GameState & { patents?: Patent[] }).patents,
  )
    ? ((state as GameState & { patents?: Patent[] }).patents as Patent[])
    : [];
  const openSource: OpenSourceProject[] = Array.isArray(
    (state as GameState & { openSource?: OpenSourceProject[] }).openSource,
  )
    ? ((state as GameState & { openSource?: OpenSourceProject[] }).openSource as OpenSourceProject[])
    : [];
  const partnerships: Partnership[] = Array.isArray(
    (state as GameState & { partnerships?: Partnership[] }).partnerships,
  )
    ? ((state as GameState & { partnerships?: Partnership[] }).partnerships as Partnership[])
    : [];
  const govContracts: GovernmentContract[] = Array.isArray(
    (state as GameState & { govContracts?: GovernmentContract[] }).govContracts,
  )
    ? ((state as GameState & { govContracts?: GovernmentContract[] }).govContracts as GovernmentContract[])
    : [];
  return {
    ...state,
    economy,
    office,
    culture,
    campaigns,
    support,
    patents,
    openSource,
    partnerships,
    govContracts,
    regions,
    ipo,
    // v4: deal history collection. Legacy saves don't have it — default to empty.
    deals: Array.isArray((state as GameState & { deals?: AcquisitionDeal[] }).deals)
      ? ((state as GameState & { deals?: AcquisitionDeal[] }).deals as AcquisitionDeal[])
      : [],
    products: state.products.map(p => {
      const legacy = p as unknown as {
        users?: number | SegmentedUsers;
        pricePerUser?: number;
        pricing?: SegmentedPricing;
        revenueModel?: RevenueModel;
        lastWeekUserTotal?: number;
      };
      // v5: remap category id first so the rest of the migration sees the canonical one.
      const category = remapCategory(p.category);
      // v2: segment split. If users is a raw number, split it by the category mix.
      let users: SegmentedUsers;
      if (typeof legacy.users === "number") {
        const mix = segmentMixFor(category);
        const n = Math.max(0, legacy.users);
        const ent = Math.round(n * mix.enterprise);
        const smb = Math.round(n * mix.smb);
        users = { enterprise: ent, smb, selfServe: Math.max(0, n - ent - smb) };
      } else {
        users = legacy.users ?? { ...ZERO_USERS };
      }
      // v2: pricing ladder derived from the legacy self-serve price.
      const pricing: SegmentedPricing = legacy.pricing
        ?? (typeof legacy.pricePerUser === "number" ? derivePricing(legacy.pricePerUser) : { enterprise: 120, smb: 36, selfServe: 12 });
      const totalU = users.enterprise + users.smb + users.selfServe;
      const np: Product = {
        ...p,
        category,
        // v5: seed revenueModel from the (now-remapped) category default. A future
        // UI may let players override this per product, but legacy saves take the default.
        revenueModel: legacy.revenueModel ?? revenueModelFor(category),
        // v5: lastWeekUserTotal is seeded to the current blended total so one-time
        // products don't accidentally recognize revenue on an apparent spike this tick.
        lastWeekUserTotal: typeof legacy.lastWeekUserTotal === "number"
          ? legacy.lastWeekUserTotal
          : totalU,
        users,
        pricing,
        // v1.1: marketingBudget
        marketingBudget: typeof (p as { marketingBudget?: number }).marketingBudget === "number"
          ? p.marketingBudget
          : 0,
        // v1.2: nextVersion is optional — leave undefined if not present
        nextVersion: p.nextVersion,
        // v2: lifetime tallies default to 0 so legacy saves archive cleanly.
        lifetimeRevenue: typeof p.lifetimeRevenue === "number" ? p.lifetimeRevenue : 0,
        lifetimeCost: typeof p.lifetimeCost === "number" ? p.lifetimeCost : 0,
        lifetimeDevCost: typeof p.lifetimeDevCost === "number" ? p.lifetimeDevCost : 0,
        lifetimeMarketingCost: typeof p.lifetimeMarketingCost === "number" ? p.lifetimeMarketingCost : 0,
        peakUsers: typeof p.peakUsers === "number" ? p.peakUsers : totalU,
        peakMrr: typeof p.peakMrr === "number" ? p.peakMrr : (users.enterprise * pricing.enterprise + users.smb * pricing.smb + users.selfServe * pricing.selfServe),
        launchedWeek: typeof p.launchedWeek === "number" ? p.launchedWeek : undefined,
        // v3: tech debt defaults to 0 for legacy saves. Refactor sprint state only exists
        // once a player has ever launched one, so leave undefined when absent.
        techDebt: typeof p.techDebt === "number" ? p.techDebt : 0,
        refactorSprintUntil: typeof p.refactorSprintUntil === "number" ? p.refactorSprintUntil : undefined,
      };
      return np;
    }),
    // v5: archive entries are snapshots of closed products — remap their category ids too
    // so filters in the Graveyard view line up with the new taxonomy.
    archivedProducts: (Array.isArray(state.archivedProducts) ? state.archivedProducts : []).map(a => ({
      ...a,
      category: remapCategory(a.category),
    })),
    // v1.2: employees got notice/retention fields — absent on older saves.
    employees: state.employees.map(e => ({
      ...e,
      retentionSaves: typeof e.retentionSaves === "number" ? e.retentionSaves : 0,
      // noticeReason, noticeEndsWeek, poacherId are left undefined by default —
      // only populated when an employee is actually on notice.
    })),
    // v1.2: competitors got personality + simulated cash/headcount/funding stage.
    // v4:   competitors got lifecycle fields (stage, users, mrr, quality, growth).
    // Defaults for legacy saves are computed at AI-tick time via withDefaults(),
    // but we also seed them here so the UI reads consistent data immediately.
    competitors: state.competitors.map(c => {
      const withOperational: Competitor = {
        ...c,
        // v5: remap legacy category ids so competitors slot into the new taxonomy.
        category: remapCategory(c.category),
        personality: c.personality
          ?? (c.aggression > 0.55 ? "aggressive"
              : c.marketShare > 0.12 ? "well-funded"
              : c.strength > 65 ? "enterprise"
              : "scrappy"),
        cash: typeof c.cash === "number" ? c.cash : 1_500_000,
        headcount: typeof c.headcount === "number" ? c.headcount : 12,
        fundingStage: c.fundingStage ?? "seed",
      };
      return hydrateLifecycle(withOperational);
    }),
    // v7 stamp so downstream migrations can tell this save has already been walked.
    schemaVersion: 7,
  };
}

export async function loadGame(): Promise<GameState | null> {
  if (typeof window === "undefined") return null;
  try {
    const v = await idbGet<GameState>(KEY);
    return v ? migrateSave(v) : null;
  } catch {
    return null;
  }
}

export async function saveGame(state: GameState | null): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (state === null) await idbDel(KEY);
    else await idbSet(KEY, state);
  } catch {
    /* IDB unavailable (private mode, etc.) — silently drop */
  }
}

export function exportSaveJSON(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

export function importSaveJSON(json: string): GameState {
  const obj = JSON.parse(json);
  if (!obj || typeof obj !== "object" || typeof obj.seed !== "string" || typeof obj.week !== "number") {
    throw new Error("That doesn't look like a Maverick save file.");
  }
  return migrateSave(obj as GameState);
}
