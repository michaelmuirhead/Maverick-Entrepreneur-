import type { Product } from "./types";
import { EMPTY_TEAM, TeamEffects } from "./roles";

/**
 * Technical debt system.
 *
 * Every product carries a 0..100 `techDebt` score — 0 is pristine code, 100 is
 * "nothing works, everyone is rewriting everything." Debt accumulates during
 * development (faster spend = more shortcuts), during vNext work, and slowly
 * drifts upward post-launch as the code ages. It's paid down by refactor
 * sprints, by shipping a vNext, and passively by having PMs/designers on the
 * team (they keep scope honest and stop the worst of the ad-hoc patches).
 *
 * Effects:
 *   - Velocity penalty: dev + vNext progress is multiplied by velocityPenalty(),
 *     which ranges 1.0 down to 0.5 as debt rises from 0 to 100.
 *   - Churn penalty: churnPenalty() adds to the weekly churn rate once debt > 50.
 *   - Health drag: decayPenalty() accelerates weekly health decay once debt > 60.
 */

/**
 * Velocity multiplier for dev and vNext progress. At debt 0 returns 1.0; at
 * debt 100 returns 0.5. Linear between. Always clamped to [0.5, 1.0].
 */
export function velocityPenalty(p: Product): number {
  const d = Math.max(0, Math.min(100, p.techDebt ?? 0));
  return 1 - d / 200;
}

/**
 * Extra weekly churn rate added on top of segment base churn when debt is
 * high. Returns 0 below 50 debt, ramps to +0.02 (≈8%/mo) at 100. Effectively
 * "customers are canceling because the product keeps breaking."
 */
export function churnPenalty(p: Product): number {
  const d = Math.max(0, Math.min(100, p.techDebt ?? 0));
  if (d <= 50) return 0;
  return ((d - 50) / 50) * 0.02;
}

/**
 * Extra health decay per week once debt passes 60. 0 below the threshold,
 * up to +0.3 at debt=100. Adds on top of the base aging decay.
 */
export function decayPenalty(p: Product): number {
  const d = Math.max(0, Math.min(100, p.techDebt ?? 0));
  if (d <= 60) return 0;
  return ((d - 60) / 40) * 0.3;
}

/**
 * How much tech debt the product gains this week from dev work. Rushing with a
 * high devBudget generates debt fast; PMs and designers damp it. Returns 0 for
 * non-dev stages. Always ≥ 0.
 */
export function debtGainFromDev(p: Product, team: TeamEffects = EMPTY_TEAM): number {
  if (p.stage !== "dev") return 0;
  // Base accumulation scales with how much money you're throwing at dev — the
  // classic "more contractors, more shortcuts" effect. $1k/wk is tidy; $10k/wk
  // is a feature factory taking on real debt.
  const budgetPressure = Math.min(4, (p.devBudget ?? 0) / 2500);
  const base = 0.8 + budgetPressure * 0.6;
  const dampen = scopeDampen(team);
  return Math.max(0, base * dampen);
}

/**
 * Debt gain from an active vNext effort. Same flavor as dev debt, but slightly
 * lower because teams tend to be more disciplined on v2 scope. Zero if no
 * vNext is in flight.
 */
export function debtGainFromVNext(p: Product, team: TeamEffects = EMPTY_TEAM): number {
  if (!p.nextVersion) return 0;
  const budgetPressure = Math.min(4, (p.nextVersion.devBudget ?? 0) / 2500);
  const base = 0.5 + budgetPressure * 0.5;
  const dampen = scopeDampen(team);
  return Math.max(0, base * dampen);
}

/**
 * Slow drift upward once a product is live — codebases rot a little even with
 * nobody touching them (dependencies go EOL, security patches pile up). Very
 * small: about 0.1/wk, tapering toward 0 as live-stage-specific stability
 * kicks in. Zero for pre-launch and EOL.
 */
export function debtDriftPostLaunch(p: Product, team: TeamEffects = EMPTY_TEAM): number {
  if (!["launched", "mature", "declining"].includes(p.stage)) return 0;
  const dampen = scopeDampen(team);
  // Declining products rot faster — nobody's fixing anything.
  const drift = p.stage === "declining" ? 0.25 : 0.1;
  return Math.max(0, drift * dampen);
}

/**
 * How much debt a refactor sprint burns off per week. Depends on engineer
 * contribution — more engineers = faster paydown — with a small floor so even
 * a solo founder can make some progress.
 */
export function refactorProgress(team: TeamEffects = EMPTY_TEAM): number {
  const engPower = team.engineer > 0 ? team.engineer : 0.8;
  // 8..14 debt/wk for a well-staffed team; 6ish for a lone engineer.
  return Math.min(14, 5 + engPower * 3);
}

/**
 * Weekly cash cost to run a refactor sprint. Scales with current debt — a
 * rewrite of a bigger mess costs more. Also scales with engineer count since
 * you're paying their time regardless, and refactors need focus.
 */
export function refactorWeeklyCost(p: Product, team: TeamEffects = EMPTY_TEAM): number {
  const d = Math.max(0, Math.min(100, p.techDebt ?? 0));
  const base = 1500 + d * 40;
  // Bigger teams = bigger sprint cost, but caps so solo founders aren't gouged.
  const teamMult = 1 + Math.min(1.5, team.engineer * 0.2);
  return Math.round(base * teamMult);
}

/**
 * Human-readable label for a debt level. Used in UI.
 */
export function debtLabel(debt: number): string {
  if (debt >= 80) return "On fire";
  if (debt >= 60) return "Brittle";
  if (debt >= 40) return "Manageable";
  if (debt >= 20) return "Tidy";
  return "Pristine";
}

/**
 * Is a refactor sprint currently active on this product at the given week?
 */
export function isRefactorActive(p: Product, currentWeek: number): boolean {
  return typeof p.refactorSprintUntil === "number" && p.refactorSprintUntil > currentWeek;
}

/**
 * PMs and designers are the "keep scope honest" roles that slow debt accumulation.
 * Returns a multiplier 1.0 (no dampen) down to ~0.45 (strong PM + designer team).
 */
function scopeDampen(team: TeamEffects): number {
  const pmContribution = Math.min(0.35, team.pm * 0.12);
  const designContribution = Math.min(0.2, team.designer * 0.08);
  return Math.max(0.45, 1 - pmContribution - designContribution);
}
