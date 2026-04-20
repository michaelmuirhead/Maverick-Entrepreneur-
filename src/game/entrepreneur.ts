/**
 * Entrepreneur / Portfolio wrapper.
 *
 * The game was originally a single-vertical SaaS sim with one top-level
 * GameState. To let the player run multiple companies in different verticals
 * in the same save, we wrap all venture-level state in an EntrepreneurState.
 *
 * Key design constraints:
 *   - Existing SaaS GameState is NOT restructured. It lives inside the
 *     wrapper untouched so every existing reducer, tick, and UI page keeps
 *     working without changes.
 *   - New verticals (starting with Video Game Studio) are sibling slots on
 *     the entrepreneur, not embedded inside GameState.
 *   - The active venture kind + id tells the store and UI which slot to
 *     render. Each slot has its own finance, team, products/games, events,
 *     and can IPO or go bankrupt independently.
 *   - Personal wealth is a shared pot for the entrepreneur across ventures.
 *     IPO proceeds, sold equity, and salary draws (future) flow here; the
 *     player can inject personal cash when founding a new company.
 */

import type { GameState } from "./types";
import type { GameStudioState } from "./studio/types";

export type VentureKind = "saas" | "game-studio";

/** Discriminated union of every venture state shape. */
export type AnyVentureState = GameState | GameStudioState;

/** Type guard: is the active venture the SaaS flavor? */
export function isSaasVenture(v: AnyVentureState): v is GameState {
  // SaaS state does NOT carry a "kind" discriminator (legacy shape).
  // Studio state has kind: "game-studio". Anything without a kind is SaaS.
  return !("kind" in v) || (v as { kind?: string }).kind === "saas";
}

/** Type guard: is the active venture a game studio? */
export function isStudioVenture(v: AnyVentureState): v is GameStudioState {
  return "kind" in v && (v as { kind?: string }).kind === "game-studio";
}

/**
 * Top-level save shape. The store holds this; legacy saves are wrapped via
 * the v8 migration so existing users don't lose anything.
 */
export interface EntrepreneurState {
  /** Free-floating money in the entrepreneur's personal pocket. Seeded at 0 for
   *  founders; can grow via IPO windfalls and be redeployed into new ventures. */
  personalWealth: number;
  /** Entrepreneur's public name — shown on the portfolio screen. */
  founderName: string;
  /** Week 0 of the playthrough. Ventures may have been founded later; each
   *  carries its own week. This is the wall-clock week for the entrepreneur. */
  week: number;
  /** Ordered list of ventures. Archived/failed ventures remain as historical
   *  records. */
  ventures: AnyVentureState[];
  /** Which venture the UI is currently showing. Must match a venture id
   *  (seed) in `ventures`. */
  activeVentureId: string;
  /** Schema version for migrations. */
  schemaVersion: number;
}

/** Current entrepreneur schema version. Bump this when the wrapper changes. */
export const ENTREPRENEUR_SCHEMA_VERSION = 8;

/** Pull the active venture out of the entrepreneur. */
export function getActiveVenture(e: EntrepreneurState): AnyVentureState | null {
  return e.ventures.find(v => ventureId(v) === e.activeVentureId) ?? null;
}

/** Canonical id for a venture — we use the seed because it's guaranteed unique. */
export function ventureId(v: AnyVentureState): string {
  return v.seed;
}

/** Human-readable label for the switcher dropdown. */
export function ventureLabel(v: AnyVentureState): string {
  if (isStudioVenture(v)) return `${v.company.name} (studio)`;
  return `${v.company.name} (SaaS)`;
}

/** Discriminator for routing to the right UI shell. */
export function ventureKind(v: AnyVentureState): VentureKind {
  return isStudioVenture(v) ? "game-studio" : "saas";
}

/**
 * Replace a venture in the list by id. If the id isn't found, the list is
 * returned unchanged (caller is responsible for ensuring existence).
 */
export function replaceVenture(
  e: EntrepreneurState,
  updated: AnyVentureState,
): EntrepreneurState {
  const targetId = ventureId(updated);
  return {
    ...e,
    ventures: e.ventures.map(v => ventureId(v) === targetId ? updated : v),
  };
}

/**
 * Replace the active venture via a mutator. If the active venture doesn't
 * match the expected kind, this is a no-op. Use `updateActiveSaas` or
 * `updateActiveStudio` from the store instead of branching here manually.
 */
export function updateActiveVenture<T extends AnyVentureState>(
  e: EntrepreneurState,
  kindCheck: (v: AnyVentureState) => v is T,
  fn: (v: T) => T,
): EntrepreneurState {
  const active = getActiveVenture(e);
  if (!active || !kindCheck(active)) return e;
  return replaceVenture(e, fn(active));
}

/** Count of currently-operating (non-archived) ventures. */
export function activeVentureCount(e: EntrepreneurState): number {
  return e.ventures.filter(v => !v.gameOver).length;
}
