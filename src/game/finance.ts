import { FundingRound, GameEvent, GameState } from "./types";
import { blendedMrr, totalUsers } from "./segments";

/** Monthly recurring revenue from all live products. */
export function computeMrr(state: GameState): number {
  return state.products.reduce((s, p) => {
    if (!["launched", "mature", "declining"].includes(p.stage)) return s;
    return s + blendedMrr(p);
  }, 0);
}

/** Months of runway remaining, given current cash and last-known burn. */
export function runwayMonths(cashOnHand: number, weeklyBurn: number): number {
  const monthly = Math.max(1, weeklyBurn * 4.33);
  return Math.max(0, cashOnHand / monthly);
}

/** Fundraise: check if player is eligible and produce a round offer. */
export interface FundingOffer {
  label: string;
  amount: number;
  postMoney: number;
  dilution: number; // fraction of equity
}

export function fundingOffer(state: GameState): FundingOffer | null {
  const mrr = computeMrr(state);
  // A product that's either still gaining users (launched) or holding steady with revenue
  // (mature) both count as real traction from an investor's view. Restricting to "launched"
  // alone made the Seed offer expire before MRR could ramp past the $5k gate.
  const hasGrowingProduct = state.products.some(
    p => (p.stage === "launched" || p.stage === "mature") && p.health > 60 && totalUsers(p) > 50,
  );
  const stage = state.company.stage;

  if (stage === "pre-seed" && hasGrowingProduct && mrr > 5_000) {
    return { label: "Seed", amount: 2_000_000, postMoney: 10_000_000, dilution: 0.2 };
  }
  if (stage === "seed" && mrr > 40_000) {
    return { label: "Series A", amount: 10_000_000, postMoney: 50_000_000, dilution: 0.2 };
  }
  if (stage === "series-a" && mrr > 200_000) {
    return { label: "Series B", amount: 25_000_000, postMoney: 150_000_000, dilution: 0.17 };
  }
  return null;
}

/** What the player sees when they pitch for a round. Either an offer, or why investors passed. */
export type PitchOutcome =
  | { kind: "offer"; offer: FundingOffer; commentary: string }
  | { kind: "passed"; nextRound: string; reasons: string[]; diagnostics: { mrr: number; required: number | null } };

/**
 * Pitch the next round proactively. Unlike fundingOffer (which only succeeds when all
 * gates are cleared), this function always returns something — either an offer the
 * player can accept, or concrete reasons investors aren't ready yet. Drives the
 * player-facing "pursue investors" flow on the Finance page.
 */
export function pitchForFunding(state: GameState): PitchOutcome {
  const mrr = computeMrr(state);
  const stage = state.company.stage;

  // What's the target round for this stage?
  const target: { label: string; required: number; amount: number; postMoney: number; dilution: number } | null =
    stage === "pre-seed" ? { label: "Seed",     required: 5_000,   amount: 2_000_000,  postMoney: 10_000_000,  dilution: 0.2 } :
    stage === "seed"     ? { label: "Series A", required: 40_000,  amount: 10_000_000, postMoney: 50_000_000,  dilution: 0.2 } :
    stage === "series-a" ? { label: "Series B", required: 200_000, amount: 25_000_000, postMoney: 150_000_000, dilution: 0.17 } :
    null;

  if (!target) {
    return {
      kind: "passed",
      nextRound: "—",
      reasons: ["You're already at Series B. The next step is growth-stage or public markets — not something a deck can fix."],
      diagnostics: { mrr, required: null },
    };
  }

  const reasons: string[] = [];

  // Growing-product gate (Seed only — later rounds don't require this gate)
  const hasGrowingProduct = state.products.some(
    p => (p.stage === "launched" || p.stage === "mature") && p.health > 60 && totalUsers(p) > 50,
  );
  if (target.label === "Seed" && !hasGrowingProduct) {
    reasons.push("Investors want a launched product with real health (>60) and at least 50 paying users. Ship something that's actually working first.");
  }

  // MRR gate
  if (mrr < target.required) {
    const short = target.required - mrr;
    reasons.push(
      `MRR is $${Math.round(mrr).toLocaleString()}/mo; ${target.label} investors want at least $${target.required.toLocaleString()}/mo. You're about $${Math.round(short).toLocaleString()}/mo short.`,
    );
  }

  if (reasons.length > 0) {
    return {
      kind: "passed",
      nextRound: target.label,
      reasons,
      diagnostics: { mrr, required: target.required },
    };
  }

  return {
    kind: "offer",
    offer: { label: target.label, amount: target.amount, postMoney: target.postMoney, dilution: target.dilution },
    commentary: `A lead partner wants a second meeting. Terms on the table: $${(target.amount/1e6).toFixed(1)}M at $${(target.postMoney/1e6).toFixed(0)}M post, ~${(target.dilution*100).toFixed(0)}% dilution. Not bad for a deck and a dream.`,
  };
}

export function applyFundingRound(state: GameState, offer: FundingOffer, events: GameEvent[]): GameState {
  const round: FundingRound = {
    label: offer.label, amount: offer.amount, postMoney: offer.postMoney, week: state.week,
  };
  const nextStage = offer.label === "Seed" ? "seed"
                  : offer.label === "Series A" ? "series-a"
                  : offer.label === "Series B" ? "series-b"
                  : state.company.stage;
  events.push({
    id: `ev_${state.week}_round_${offer.label}`,
    week: state.week, severity: "good",
    message: `${offer.label} round closed: $${(offer.amount/1e6).toFixed(1)}M at $${(offer.postMoney/1e6).toFixed(0)}M post. The partners 'really believe in what you're building,' which is investor for 'we'll see in 18 months.'`,
    amount: offer.amount,
  });
  return {
    ...state,
    company: { ...state.company, stage: nextStage },
    finance: {
      ...state.finance,
      cash: state.finance.cash + offer.amount,
      rounds: [...state.finance.rounds, round],
    },
  };
}
