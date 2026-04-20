/**
 * Customer support quality.
 *
 * Single team-wide metric (0..100) driven by the ratio of support-coded employees
 * (roles: "ops" plus a fraction of "pm"/"designer" stand-ins) to total paying users.
 * Lower support quality => higher churn + occasional 'support collapse' events.
 */

import type { Employee, SupportState } from "./types";

export interface SupportInputs {
  totalUsers: number;
  /** Blended MRR — used to convert ticket volume into dollar scale flavor. */
  mrr: number;
  employees: Employee[];
}

/** Initial state for a brand-new company — few users, a single founder handling tickets. */
export function initSupport(): SupportState {
  return { quality: 80, ticketsThisWeek: 0, complaintsRecent: 0 };
}

/**
 * Recompute support quality from current inputs. Higher user-per-rep counts drag
 * quality down; recent complaints lag 50/50 with current ratio.
 *
 * Heuristic: one "support headcount unit" comfortably handles ~800 users.
 * Support is counted from `ops` (full weight), `pm` (0.3 weight), and `founder` (0.2 weight).
 */
export function computeSupportQuality(inputs: SupportInputs, prior: SupportState | undefined): SupportState {
  const supportHeadcount = inputs.employees.reduce((s, e) => {
    if (e.role === "ops") return s + 1;
    if (e.role === "pm") return s + 0.3;
    if (e.role === "founder") return s + 0.2;
    return s;
  }, 0);
  const usersPerRep = supportHeadcount > 0
    ? inputs.totalUsers / supportHeadcount
    : inputs.totalUsers;
  // Quality heuristic: 100 at 0 users/rep, 60 at 800, 20 at 2500, 0 at 5000+.
  let rawQuality: number;
  if (usersPerRep <= 100) rawQuality = 100;
  else if (usersPerRep >= 5000) rawQuality = 0;
  else rawQuality = Math.max(0, 100 - (usersPerRep - 100) * (80 / 4900));
  // Smooth toward the new target to avoid week-to-week whiplash.
  const priorQ = prior?.quality ?? 80;
  const quality = Math.round(priorQ + (rawQuality - priorQ) * 0.3);
  const ticketsThisWeek = Math.round(inputs.totalUsers * 0.04);  // ~4% ticket rate baseline
  // Complaints roll forward; each week below 50 quality adds a complaint
  const priorComplaints = prior?.complaintsRecent ?? 0;
  const complaintsRecent = Math.max(0, priorComplaints + (quality < 50 ? 1 : -0.3));
  return { quality, ticketsThisWeek, complaintsRecent };
}

/** Multiplier applied to churn rates. Good support lowers churn; bad support raises it. */
export function supportChurnMultiplier(support: SupportState | undefined): number {
  if (!support) return 1;
  // Quality 80 = neutral. Quality 100 = -15% churn. Quality 0 = +40% churn.
  const delta = (support.quality - 80) / 100;
  return Math.max(0.85, Math.min(1.4, 1 - delta * 0.5));
}
