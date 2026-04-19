// ============================================================
// Phase 3.3 — Rival Defeat Detection
// ============================================================
// Detects when rivals collapse or get outgrown, moves them to the
// rivalsDefeated ledger, generates narrative feed items, and prunes
// the active rivals list.

import type { GameState, Rival, RivalMove } from "@/types";

export interface DefeatResult {
  survivingRivals: Rival[];
  defeatedIds: string[];
  defeatMoves: RivalMove[];
}

// A rival is defeated when:
// - estimatedCash falls below -$500,000 (they're burning cash faster than they can raise)
// - OR marketShare falls below 1%
// - OR grudge is < -90 AND monthlyRevenue fell below 20% of starting
export function detectDefeats(state: GameState, currentMonth: number): DefeatResult {
  const defeatedIds: string[] = [];
  const defeatMoves: RivalMove[] = [];
  const survivingRivals: Rival[] = [];

  for (const rival of state.rivals) {
    // Already defeated in a prior tick? Don't re-detect.
    if (state.rivalsDefeated.includes(rival.id)) continue;

    const bankrupt = rival.estimatedCash < -500_000;
    const marginalized = rival.marketShare < 0.01;
    const crushed =
      rival.grudge < -90 &&
      rival.monthlyRevenue < 0 &&
      rival.estimatedCash < 100_000;

    if (bankrupt || marginalized || crushed) {
      defeatedIds.push(rival.id);
      defeatMoves.push(buildDefeatMove(rival, currentMonth, bankrupt, marginalized));
      continue; // rival removed from active roster
    }

    survivingRivals.push(rival);
  }

  return { survivingRivals, defeatedIds, defeatMoves };
}

function buildDefeatMove(
  rival: Rival,
  month: number,
  bankrupt: boolean,
  marginalized: boolean
): RivalMove {
  const reason = bankrupt
    ? "bankruptcy"
    : marginalized
    ? "obsolescence"
    : "attrition";

  const flavor = pickFlavor(rival, reason);

  return {
    id: `defeat_${rival.id}_${month}`,
    month,
    rivalId: rival.id,
    kind: "collapse",
    headline: buildHeadline(rival, reason),
    body: flavor,
    tone: "neutral",
  };
}

function buildHeadline(rival: Rival, reason: "bankruptcy" | "obsolescence" | "attrition"): string {
  if (reason === "bankruptcy") return `${rival.name} files for bankruptcy`;
  if (reason === "obsolescence") return `${rival.name} quietly exits the market`;
  return `${rival.name} is finished`;
}

function pickFlavor(rival: Rival, reason: "bankruptcy" | "obsolescence" | "attrition"): string {
  if (reason === "bankruptcy") {
    const quotes = [
      `The Chapter 11 filing came on a Tuesday. ${rival.name} listed $${Math.abs(rival.estimatedCash / 1000).toFixed(0)}K in creditor claims it couldn't meet. You outlasted them.`,
      `${rival.name} couldn't make payroll. The assets will be auctioned; the brand, retired. A competitor has been removed.`,
      `The receivers moved in overnight. ${rival.name}'s offices were sealed by morning. Their cash ran out before their ambition did.`,
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }
  if (reason === "obsolescence") {
    const quotes = [
      `${rival.name} holds ${(rival.marketShare * 100).toFixed(1)}% of the market now. A rounding error. The trade press has stopped writing about them.`,
      `There was no announcement. ${rival.name} just stopped showing up in the industry reports. One fewer name to worry about.`,
      `The founders of ${rival.name} have moved on to "strategic consulting." The brand survives on paper. Nothing more.`,
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }
  const quotes = [
    `Years of pressure finally broke ${rival.name}. The last of their executives left last month. The name is a shell.`,
    `${rival.name} lost the will to compete somewhere along the way. The company exists. The threat doesn't.`,
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}
