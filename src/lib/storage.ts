import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { GameState } from "@/game/types";

const KEY = "maverick.save.v1";

/** Backfill fields added in later releases so old saves don't crash. */
export function migrateSave(state: GameState): GameState {
  return {
    ...state,
    products: state.products.map(p => ({
      ...p,
      // v1.1: marketingBudget
      marketingBudget: typeof (p as { marketingBudget?: number }).marketingBudget === "number"
        ? p.marketingBudget
        : 0,
      // v1.2: nextVersion is optional — leave undefined if not present
      nextVersion: p.nextVersion,
    })),
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
