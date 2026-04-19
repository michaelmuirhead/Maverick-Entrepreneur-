import { GameState } from "./types";
import { computeMrr, fundingOffer } from "./finance";
import { getHeadlineStats } from "./tick";

export interface Milestone {
  /** Headline label shown on HQ — keep short. */
  title: string;
  /** Supporting one-liner — playfully serious, max ~90 chars. */
  hint: string;
  /** 0..1 — UI can render a progress bar. -1 means "no progress applicable". */
  progress: number;
  /** "offer" = an action is available now; "goal" = keep grinding; "warn" = urgent. */
  kind: "offer" | "goal" | "warn";
}

/**
 * Pick the single most useful next-step hint for where the player currently is.
 * Priorities (high to low):
 *   1. Runway warning — if cash is drying up, nothing else matters.
 *   2. Funding offer available — surface the action.
 *   3. Shipping your first product.
 *   4. Climbing to the next funding milestone.
 *   5. End-state: you made it.
 */
export function nextMilestone(state: GameState): Milestone {
  const mrr = computeMrr(state);
  const { runwayMo } = getHeadlineStats(state);
  const offer = fundingOffer(state);

  // 1. Runway warning trumps everything.
  if (runwayMo < 3) {
    return {
      title: "Runway is thin",
      hint: `About ${runwayMo.toFixed(1)} months of cash left. Cut burn, raise, or ship revenue — fast.`,
      progress: Math.max(0, Math.min(1, runwayMo / 3)),
      kind: "warn",
    };
  }

  // 2. A funding round is available right now.
  if (offer) {
    return {
      title: `${offer.label} offer on the table`,
      hint: `$${(offer.amount/1e6).toFixed(1)}M at $${(offer.postMoney/1e6).toFixed(0)}M post. Head to Finance to accept.`,
      progress: 1,
      kind: "offer",
    };
  }

  // 3. Haven't shipped anything yet.
  const hasLive = state.products.some(p => ["launched", "mature", "declining"].includes(p.stage));
  if (!hasLive) {
    const building = state.products.find(p => p.stage === "dev");
    if (building) {
      return {
        title: `Ship ${building.name}`,
        hint: `${Math.round(building.devProgress)}% built. Keep the dev budget fed and engineers assigned.`,
        progress: building.devProgress / 100,
        kind: "goal",
      };
    }
    return {
      title: "Ship your first product",
      hint: "Design one on Products, set a dev budget, and assign an engineer to get it out of concept.",
      progress: 0,
      kind: "goal",
    };
  }

  // 4. Climb to the next funding rung.
  const stage = state.company.stage;
  if (stage === "pre-seed") {
    return {
      title: "Reach $5k MRR for Seed",
      hint: `Currently $${Math.round(mrr).toLocaleString()}/mo. A healthy launched product with 50+ users unlocks the round.`,
      progress: Math.min(1, mrr / 5000),
      kind: "goal",
    };
  }
  if (stage === "seed") {
    return {
      title: "Reach $40k MRR for Series A",
      hint: `Currently $${Math.round(mrr).toLocaleString()}/mo. Scale the products you have before designing new ones.`,
      progress: Math.min(1, mrr / 40000),
      kind: "goal",
    };
  }
  if (stage === "series-a") {
    return {
      title: "Reach $200k MRR for Series B",
      hint: `Currently $${Math.round(mrr).toLocaleString()}/mo. You're in scale-up territory now — hire ahead of growth.`,
      progress: Math.min(1, mrr / 200000),
      kind: "goal",
    };
  }

  // 5. Series B reached — victory lap.
  return {
    title: "You're playing the long game now",
    hint: "Series B closed. Defend the franchise, ship v-next, and don't let the culture slip.",
    progress: 1,
    kind: "goal",
  };
}
