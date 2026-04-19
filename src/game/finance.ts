import { FundingRound, GameEvent, GameState } from "./types";

/** Monthly recurring revenue from all live products. */
export function computeMrr(state: GameState): number {
  return state.products.reduce((s, p) => {
    if (!["launched", "mature", "declining"].includes(p.stage)) return s;
    return s + p.users * p.pricePerUser;
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
  const hasGrowingProduct = state.products.some(p => p.stage === "launched" && p.health > 60 && p.users > 50);
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
