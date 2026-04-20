/**
 * Studio contracts — work-for-hire side revenue.
 *
 * Contracts are a separate pipeline of income for game studios. The studio
 * takes on outside work — porting games, co-developing modules, building to
 * a publisher's spec, or doing engine/tools consulting — in exchange for cash
 * and reputation gains. The cost is opportunity: engineers assigned to an
 * active contract don't contribute to the studio's own IP that week.
 *
 * Lifecycle
 * ---------
 *   "offered"   - sitting on the offer board, accept/decline/expires
 *   "active"    - accepted, in progress, progress advances each fully-staffed week
 *   "completed" - delivered on time, full payout + rep bump
 *   "failed"    - deadline blown, partial payout + rep hit + morale damage
 *   "declined"  - player declined, or offer expired unread
 *   "cancelled" - player bailed mid-contract (rep hit, no further pay)
 *
 * Everything in this file is pure. The tick / store is responsible for
 * mutating state and persisting.
 */

import type { RNG } from "../rng";
import type { GameEvent, ID } from "../types";
import type {
  ContractType, GameStudioState, StudioContract,
} from "./types";

// =====================================================================================
// Client + title pools (flavor)
// =====================================================================================

/** Publisher / client names. Mix of fictional publishers and "external dev team" stand-ins. */
const CLIENT_NAMES: readonly string[] = [
  "Ironside Publishing",
  "Vermillion Games",
  "Northbeam Entertainment",
  "Axiom Interactive",
  "Crescent Media",
  "Nova Arc Publishing",
  "Saltwater Studios",
  "Lantern & Sons",
  "Quietwave Games",
  "Upland Labs",
  "Starbreak Studios",
  "Red Compass",
  "Pixel Harvest",
  "Obsidian Works",
  "Meridian Interactive",
];

/** Title pools by contract type. */
const CONTRACT_TITLES: Record<ContractType, readonly string[]> = {
  consulting: [
    "Engine performance audit",
    "Build-pipeline overhaul",
    "Shader profiling engagement",
    "Legacy codebase triage",
    "Anti-cheat consulting",
    "Porting toolchain review",
    "Memory-budget deep dive",
  ],
  port: [
    "Port to Switch",
    "Port to PC",
    "Console port (next-gen)",
    "Mobile port",
    "Steam Deck compatibility pass",
    "Linux/SteamOS port",
  ],
  "co-dev": [
    "Co-dev: combat system module",
    "Co-dev: online multiplayer backend",
    "Co-dev: procedural level generator",
    "Co-dev: dialogue + quest tooling",
    "Co-dev: physics + destruction layer",
    "Co-dev: live-ops tooling",
    "Co-dev: UI framework build-out",
  ],
  "publisher-spec": [
    "Work-for-hire: licensed tie-in game",
    "Work-for-hire: educational title",
    "Work-for-hire: branded promo game",
    "Work-for-hire: mobile spinoff",
    "Work-for-hire: franchise side story",
  ],
};

const CONTRACT_BLURBS: Record<ContractType, string> = {
  consulting:
    "Short engagement. Your senior engineer sits in with the client's team and untangles a thorny technical knot. Light lift, easy money.",
  port:
    "Port an existing title to a new platform. Mostly engineering work — optimization, input remapping, certification. No design ownership.",
  "co-dev":
    "Embed with another studio to deliver a specific module. Good for reputation, but the other studio calls the shots on scope.",
  "publisher-spec":
    "Full work-for-hire. You build to the publisher's design doc, they own the IP. Biggest paycheck, biggest team commitment, no royalties.",
};

// =====================================================================================
// Offer generation
// =====================================================================================

/** Minimum reputation required to be offered each contract type. */
const MIN_REP_FOR_TYPE: Record<ContractType, number> = {
  consulting: 0,
  port: 30,
  "co-dev": 45,
  "publisher-spec": 65,
};

/** Default reputation floor when a studio is newborn. */
export const DEFAULT_STUDIO_REPUTATION = 50;

/** Hard caps on the pipeline so offers don't spam. */
const MAX_OPEN_OFFERS = 2;
const MAX_ACTIVE_CONTRACTS = 3;

/**
 * Roll for a new contract offer this week. Returns null if no offer appears.
 *
 * The chance scales with:
 *   - Base weekly chance (~12%)
 *   - A cash-pressure bump when runway is short (+8% / +15% at 26 / 12 wk)
 *   - Reputation (above-average rep gets modestly more offers)
 *
 * Offers are capped at MAX_OPEN_OFFERS; additional rolls short-circuit.
 */
export function maybeGenerateContractOffer(
  state: GameStudioState,
  rng: RNG,
  idGen: (prefix: string) => string,
): StudioContract | null {
  const contracts = state.contracts ?? [];

  const openOffers = contracts.filter(c => c.status === "offered");
  if (openOffers.length >= MAX_OPEN_OFFERS) return null;

  const active = contracts.filter(c => c.status === "active");
  if (active.length >= MAX_ACTIVE_CONTRACTS) return null;

  // Base weekly chance.
  let chance = 0.12;

  // Cash-pressure boost: when you're broke, someone's always "just reaching out."
  // Use recent weekly burn history as a runway proxy; fall back to $1 to avoid
  // div-by-zero on brand-new saves.
  const burnHist = state.finance.weeklyBurnHistory ?? [];
  const recentBurn = burnHist.length > 0
    ? burnHist.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, burnHist.length)
    : 0;
  const weeklyBurn = Math.max(1, recentBurn);
  const runwayWeeks = state.finance.cash / weeklyBurn;
  if (runwayWeeks < 12) chance += 0.15;
  else if (runwayWeeks < 26) chance += 0.08;

  // Reputation shift: +/- up to ~0.25 at the extremes.
  const rep = state.studioReputation ?? DEFAULT_STUDIO_REPUTATION;
  chance += (rep - 50) / 200;

  if (!rng.chance(chance)) return null;

  // Pick an eligible contract type weighted by commonality.
  // Annotate before .filter so TS doesn't widen the string literals to `string`.
  const allTypes: { type: ContractType; weight: number }[] = [
    { type: "consulting", weight: 4 },
    { type: "port", weight: 3 },
    { type: "co-dev", weight: 2 },
    { type: "publisher-spec", weight: 1 },
  ];
  const eligibleTypes = allTypes.filter(o => rep >= MIN_REP_FOR_TYPE[o.type]);
  if (eligibleTypes.length === 0) return null;

  const type = rng.weighted(eligibleTypes);
  return generateContractForType(type, state, rng, idGen);
}

/** Build a concrete StudioContract for a given type, at this week. */
function generateContractForType(
  type: ContractType,
  state: GameStudioState,
  rng: RNG,
  idGen: (prefix: string) => string,
): StudioContract {
  const base = {
    id: idGen("contract"),
    offeredWeek: state.week,
    status: "offered" as const,
    progress: 0,
    paidToDate: 0,
    weeksUnderstaffed: 0,
    assignedEngineerIds: [] as ID[],
    assignedDesignerIds: [] as ID[],
    clientName: rng.pick(CLIENT_NAMES),
    title: rng.pick(CONTRACT_TITLES[type]),
    description: CONTRACT_BLURBS[type],
  };

  switch (type) {
    case "consulting": {
      const duration = rng.int(2, 6);
      const payout = rng.int(10_000, 40_000);
      return {
        ...base,
        type: "consulting",
        durationWeeks: duration,
        expiresWeek: state.week + rng.int(2, 3),
        requiredEngineers: 1,
        requiredDesigners: 0,
        payout,
        upfrontFraction: 0.2,
        repOnSuccess: 2,
        repOnFailure: 6,
      };
    }
    case "port": {
      const duration = rng.int(8, 16);
      const payout = rng.int(40_000, 120_000);
      return {
        ...base,
        type: "port",
        durationWeeks: duration,
        expiresWeek: state.week + rng.int(2, 4),
        requiredEngineers: rng.int(2, 3),
        requiredDesigners: 0,
        payout,
        upfrontFraction: 0.25,
        repOnSuccess: 5,
        repOnFailure: 10,
      };
    }
    case "co-dev": {
      const duration = rng.int(6, 20);
      const payout = rng.int(30_000, 250_000);
      const needsDesigner = rng.chance(0.5);
      return {
        ...base,
        type: "co-dev",
        durationWeeks: duration,
        expiresWeek: state.week + rng.int(2, 4),
        requiredEngineers: rng.int(1, 3),
        requiredDesigners: needsDesigner ? 1 : 0,
        payout,
        upfrontFraction: 0.3,
        repOnSuccess: 8,
        repOnFailure: 12,
      };
    }
    case "publisher-spec": {
      const duration = rng.int(30, 60);
      const payout = rng.int(200_000, 800_000);
      return {
        ...base,
        type: "publisher-spec",
        durationWeeks: duration,
        expiresWeek: state.week + rng.int(3, 5),
        requiredEngineers: rng.int(3, 5),
        requiredDesigners: 1,
        payout,
        upfrontFraction: 0.35,
        repOnSuccess: 12,
        repOnFailure: 20,
      };
    }
  }
}

// =====================================================================================
// Accept / decline / cancel (called by store actions)
// =====================================================================================

/**
 * Accept an offer. Sets acceptedWeek, deadlineWeek, assignments, status → active.
 * Returns the updated contract and the upfront cash to credit. If the offer is
 * not acceptable (expired, understaffed), returns null.
 *
 * Deadline = acceptedWeek + durationWeeks + grace (ceil(duration × 0.25)).
 * That grace window is what gives understaffing bite without making misses
 * guaranteed on the very last week.
 */
export function acceptContract(
  contract: StudioContract,
  engineerIds: ID[],
  designerIds: ID[],
  currentWeek: number,
): { contract: StudioContract; upfrontCash: number } | null {
  if (contract.status !== "offered") return null;
  if (currentWeek >= contract.expiresWeek) return null;
  if (engineerIds.length < contract.requiredEngineers) return null;
  if (designerIds.length < contract.requiredDesigners) return null;

  const grace = Math.max(2, Math.ceil(contract.durationWeeks * 0.25));
  const deadlineWeek = currentWeek + contract.durationWeeks + grace;
  const upfrontCash = Math.round(contract.payout * contract.upfrontFraction);

  return {
    contract: {
      ...contract,
      status: "active",
      acceptedWeek: currentWeek,
      deadlineWeek,
      assignedEngineerIds: [...engineerIds],
      assignedDesignerIds: [...designerIds],
      paidToDate: upfrontCash,
    },
    upfrontCash,
  };
}

/** Player declines an offer. Marks it declined; it stays in history for flavor. */
export function declineContract(
  contract: StudioContract,
  currentWeek: number,
): StudioContract | null {
  if (contract.status !== "offered") return null;
  return { ...contract, status: "declined", resolvedWeek: currentWeek };
}

/**
 * Player cancels a contract mid-flight. Small cash hit (forfeit any unpaid
 * upfront), decent rep hit. Not currently exposed to UI but wired in case we
 * want a "bail" button later.
 */
export function cancelContract(
  contract: StudioContract,
  currentWeek: number,
): { contract: StudioContract; repDelta: number } | null {
  if (contract.status !== "active") return null;
  return {
    contract: { ...contract, status: "cancelled", resolvedWeek: currentWeek },
    repDelta: -Math.max(5, Math.round(contract.repOnFailure * 0.6)),
  };
}

// =====================================================================================
// Weekly tick — progress, expiry, completion, failure
// =====================================================================================

export interface ContractTickResult {
  contracts: StudioContract[];
  events: GameEvent[];
  cashDelta: number;
  repDelta: number;
  /** Employee IDs to hit with a one-time morale penalty because a contract they
   *  were on just failed. The caller applies the penalty in one pass. */
  moraleHitEmployeeIds: ID[];
}

/**
 * Advance all contracts one week. Called from tickStudio.
 *
 * For each contract:
 *   - "offered" past expiresWeek → status: declined (with an expiry event)
 *   - "active" with enough assigned headcount present → progress += 1/duration
 *   - "active" with too few assigned present → weeksUnderstaffed++
 *   - "active" with progress ≥ 1 → completed, final payment, rep bump
 *   - "active" past deadlineWeek without hitting 1.0 → failed, partial pay, rep hit
 *
 * Cash and reputation are summed into the result; the caller credits
 * finance.cash and studioReputation in a single pass.
 */
export function tickContracts(
  state: GameStudioState,
  currentWeek: number,
  idGen: (prefix: string) => string,
): ContractTickResult {
  const inputContracts = state.contracts ?? [];
  const events: GameEvent[] = [];
  let cashDelta = 0;
  let repDelta = 0;
  const moraleHitEmployeeIds: ID[] = [];

  const employeeIds = new Set(state.employees.map(e => e.id));

  const contracts = inputContracts.map(c => {
    // Terminal states — no-op.
    if (
      c.status === "completed"
      || c.status === "failed"
      || c.status === "declined"
      || c.status === "cancelled"
    ) {
      return c;
    }

    // Offer expiry.
    if (c.status === "offered") {
      if (currentWeek >= c.expiresWeek) {
        events.push({
          id: idGen("evt"),
          week: currentWeek,
          severity: "info",
          message:
            `${c.clientName}'s offer for "${c.title}" expired — you missed the window.`,
        });
        return { ...c, status: "declined" as const, resolvedWeek: currentWeek };
      }
      return c;
    }

    // Active: count how many assigned employees are still present.
    const presentEngineers = c.assignedEngineerIds.filter(id => employeeIds.has(id)).length;
    const presentDesigners = c.assignedDesignerIds.filter(id => employeeIds.has(id)).length;
    const fullyStaffed =
      presentEngineers >= c.requiredEngineers
      && presentDesigners >= c.requiredDesigners;

    let progress = c.progress;
    let weeksUnderstaffed = c.weeksUnderstaffed;

    if (fullyStaffed) {
      progress = Math.min(1, progress + 1 / Math.max(1, c.durationWeeks));
    } else {
      weeksUnderstaffed += 1;
    }

    // Completion.
    if (progress >= 1) {
      const finalPay = c.payout - c.paidToDate;
      cashDelta += finalPay;
      repDelta += c.repOnSuccess;
      const lateness = weeksUnderstaffed > 0
        ? ` It ran ${weeksUnderstaffed} wk over-schedule but landed in the grace window.`
        : "";
      events.push({
        id: idGen("evt"),
        week: currentWeek,
        severity: "info",
        message:
          `Contract shipped: delivered "${c.title}" to ${c.clientName}.${lateness} Final payment: $${finalPay.toLocaleString()}. Reputation +${c.repOnSuccess}.`,
      });
      return {
        ...c,
        progress: 1,
        weeksUnderstaffed,
        status: "completed" as const,
        resolvedWeek: currentWeek,
        paidToDate: c.payout,
      };
    }

    // Deadline failure.
    if (c.deadlineWeek != null && currentWeek >= c.deadlineWeek) {
      // Prorated: pay reflects how much of the work actually got delivered.
      const earnedToDate = Math.round(c.payout * progress);
      const owedNow = Math.max(0, earnedToDate - c.paidToDate);
      cashDelta += owedNow;
      repDelta -= c.repOnFailure;
      // Assigned staff who are still around take a morale hit.
      for (const id of c.assignedEngineerIds) if (employeeIds.has(id)) moraleHitEmployeeIds.push(id);
      for (const id of c.assignedDesignerIds) if (employeeIds.has(id)) moraleHitEmployeeIds.push(id);
      events.push({
        id: idGen("evt"),
        week: currentWeek,
        severity: "bad",
        message:
          `Contract FAILED: ${c.clientName} pulled the plug on "${c.title}" — deliverable was ${Math.round(progress * 100)}% complete at deadline. Paid out $${owedNow.toLocaleString()}. Reputation -${c.repOnFailure}.`,
      });
      return {
        ...c,
        progress,
        weeksUnderstaffed,
        status: "failed" as const,
        resolvedWeek: currentWeek,
        paidToDate: c.paidToDate + owedNow,
      };
    }

    // Still grinding.
    return { ...c, progress, weeksUnderstaffed };
  });

  return { contracts, events, cashDelta, repDelta, moraleHitEmployeeIds };
}

// =====================================================================================
// Queries — used by UI + tick
// =====================================================================================

/** Set of employee IDs currently busy on an active contract. Used by the tick
 *  so these engineers don't contribute to own-IP dev this week. */
export function busyEmployeeIds(contracts: readonly StudioContract[] | undefined): Set<ID> {
  const s = new Set<ID>();
  if (!contracts) return s;
  for (const c of contracts) {
    if (c.status !== "active") continue;
    for (const id of c.assignedEngineerIds) s.add(id);
    for (const id of c.assignedDesignerIds) s.add(id);
  }
  return s;
}

/** Short human-readable label for a contract type (used in UI). */
export function contractTypeLabel(t: ContractType): string {
  switch (t) {
    case "consulting": return "Consulting";
    case "port": return "Port work";
    case "co-dev": return "Co-development";
    case "publisher-spec": return "Publisher spec";
  }
}

/** Clamp + normalize a reputation value. */
export function clampReputation(r: number): number {
  return Math.max(0, Math.min(100, r));
}
