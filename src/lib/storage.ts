import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { GameState } from "@/game/types";

const KEY = "maverick.save.v1";

export async function loadGame(): Promise<GameState | null> {
  if (typeof window === "undefined") return null;
  try {
    const v = await idbGet<GameState>(KEY);
    return v ?? null;
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
  return obj as GameState;
}
