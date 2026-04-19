import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { GameState, Product, SegmentedPricing, SegmentedUsers } from "@/game/types";
import { SEGMENT_MIX, derivePricing, ZERO_USERS } from "@/game/segments";

const KEY = "maverick.save.v1";

/**
 * Backfill fields added in later releases so old saves don't crash.
 * v2: segmented users+pricing; lifetime tallies; archivedProducts collection.
 * v3: per-product tech debt + refactor sprint.
 */
export function migrateSave(state: GameState): GameState {
  return {
    ...state,
    archivedProducts: Array.isArray(state.archivedProducts) ? state.archivedProducts : [],
    products: state.products.map(p => {
      const legacy = p as unknown as {
        users?: number | SegmentedUsers;
        pricePerUser?: number;
        pricing?: SegmentedPricing;
      };
      // v2: segment split. If users is a raw number, split it by the category mix.
      let users: SegmentedUsers;
      if (typeof legacy.users === "number") {
        const mix = SEGMENT_MIX[p.category] ?? SEGMENT_MIX.productivity;
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
      const np: Product = {
        ...p,
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
        peakUsers: typeof p.peakUsers === "number" ? p.peakUsers : (users.enterprise + users.smb + users.selfServe),
        peakMrr: typeof p.peakMrr === "number" ? p.peakMrr : (users.enterprise * pricing.enterprise + users.smb * pricing.smb + users.selfServe * pricing.selfServe),
        launchedWeek: typeof p.launchedWeek === "number" ? p.launchedWeek : undefined,
        // v3: tech debt defaults to 0 for legacy saves. Refactor sprint state only exists
        // once a player has ever launched one, so leave undefined when absent.
        techDebt: typeof p.techDebt === "number" ? p.techDebt : 0,
        refactorSprintUntil: typeof p.refactorSprintUntil === "number" ? p.refactorSprintUntil : undefined,
      };
      return np;
    }),
    // v1.2: employees got notice/retention fields — absent on older saves.
    employees: state.employees.map(e => ({
      ...e,
      retentionSaves: typeof e.retentionSaves === "number" ? e.retentionSaves : 0,
      // noticeReason, noticeEndsWeek, poacherId are left undefined by default —
      // only populated when an employee is actually on notice.
    })),
    // v1.2: competitors got personality + simulated cash/headcount/funding stage.
    // Defaults for legacy saves are computed at AI-tick time via withDefaults(),
    // but we also seed them here so the UI reads consistent data immediately.
    competitors: state.competitors.map(c => ({
      ...c,
      personality: c.personality
        ?? (c.aggression > 0.55 ? "aggressive"
            : c.marketShare > 0.12 ? "well-funded"
            : c.strength > 65 ? "enterprise"
            : "scrappy"),
      cash: typeof c.cash === "number" ? c.cash : 1_500_000,
      headcount: typeof c.headcount === "number" ? c.headcount : 12,
      fundingStage: c.fundingStage ?? "seed",
    })),
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
