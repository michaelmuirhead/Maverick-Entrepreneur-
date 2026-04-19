import type {
  Company,
  ContestedMarket,
  GameState,
  Rival,
  RivalMove,
  RivalMoveKind,
  RivalThreat,
} from "@/types";
import { CITY_MAP } from "@/data/cities";
import { INDUSTRIES } from "@/data/industries";

// ---------- RNG helpers ----------
function rand(min: number, max: number): number { return Math.random() * (max - min) + min; }
function chance(p: number): boolean { return Math.random() < p; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function uid(): string { return Math.random().toString(36).slice(2, 10); }

// ---------- Archetype move weights ----------
// Each archetype has a different probability distribution over possible moves.
// This is what makes rivals feel distinct rather than identical.
const ARCHETYPE_MOVE_WEIGHTS: Record<Rival["archetype"], Partial<Record<RivalMoveKind, number>>> = {
  incumbent: {
    open_location: 25,
    cut_prices: 20,
    win_contract: 10,
    poach_exec: 8,
    press_profile: 7,
    lay_low: 30,
  },
  disruptor: {
    poach_exec: 30,
    open_location: 20,
    cut_prices: 15,
    press_profile: 10,
    announce_acquisition: 5,
    lay_low: 20,
  },
  specialist: {
    win_contract: 35,
    press_profile: 10,
    open_location: 10,
    lay_low: 45,
  },
  acquirer: {
    approach_merger: 20,
    announce_acquisition: 15,
    press_profile: 10,
    lay_low: 55,
  },
  hometown_hero: {
    propose_partnership: 15,
    cross_promote: 15,
    win_contract: 10,
    press_profile: 10,
    lay_low: 50,
  },
};

// ---------- Move generation ----------
export function rollRivalMoves(state: GameState): RivalMove[] {
  const newMoves: RivalMove[] = [];

  for (const rival of state.rivals) {
    // A rival acts with probability based on aggression. 20..95 aggression ≈ 20..75% monthly activity.
    const actProb = 0.2 + (rival.aggression / 100) * 0.55;
    if (!chance(actProb)) continue;

    const kind = chooseMove(rival);
    const move = buildMove(rival, kind, state);
    if (move) newMoves.push(move);

    // Highly aggressive rivals occasionally get a second move
    if (rival.aggression > 75 && chance(0.3)) {
      const secondKind = chooseMove(rival);
      if (secondKind !== kind) {
        const secondMove = buildMove(rival, secondKind, state);
        if (secondMove) newMoves.push(secondMove);
      }
    }
  }

  return newMoves;
}

function chooseMove(rival: Rival): RivalMoveKind {
  const weights = ARCHETYPE_MOVE_WEIGHTS[rival.archetype];
  const entries = Object.entries(weights) as [RivalMoveKind, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [kind, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return kind;
  }
  return "lay_low";
}

// ---------- Move builders ----------
function buildMove(rival: Rival, kind: RivalMoveKind, state: GameState): RivalMove | null {
  // Skip silent "lay low" moves — we don't clutter the feed with inaction
  if (kind === "lay_low") return null;

  const playerCities = new Set(
    state.companies.flatMap((c) => c.locations.map((l) => l.cityId))
  );
  const overlappingCities = rival.cities.filter((c) => playerCities.has(c));

  const base = { id: uid(), month: state.month, rivalId: rival.id, kind };

  switch (kind) {
    case "open_location": {
      const targetCity = overlappingCities.length > 0 && chance(0.7)
        ? pick(overlappingCities)
        : pick(rival.cities.length > 0 ? rival.cities : ["austin"]);
      const cityName = CITY_MAP[targetCity]?.name ?? targetCity;
      const overlapping = playerCities.has(targetCity);
      return {
        ...base,
        cityId: targetCity,
        tone: overlapping ? "hostile" : "neutral",
        headline: overlapping
          ? `${rival.name} opens a new ${cityName} location — blocks from yours`
          : `${rival.name} expands into ${cityName}`,
        body: overlapping
          ? `The CFO called it "market expansion." Your district manager called it "a declaration." Foot traffic at your nearest location is expected to dip.`
          : `A new storefront. Not in your backyard — yet. Analysts are calling it a regional push.`,
        effect: {
          grudgeDelta: overlapping ? -4 : 0,
          playerBrandDelta: overlapping ? -2 : 0,
        },
      };
    }

    case "cut_prices": {
      const targetCity = overlappingCities.length > 0
        ? pick(overlappingCities)
        : pick(rival.cities.length > 0 ? rival.cities : ["austin"]);
      const cityName = CITY_MAP[targetCity]?.name ?? targetCity;
      const cut = Math.round(rand(10, 22));
      return {
        ...base,
        cityId: targetCity,
        tone: "hostile",
        headline: `${rival.name} cuts prices ${cut}% across its ${cityName} locations`,
        body: `A direct shot. Analysts say the move is unsustainable — but they can bleed longer than most. The question isn't whether you match, but how long they can hold the line.`,
        effect: {
          grudgeDelta: -3,
          rivalCashDelta: -Math.round(rand(200_000, 500_000)),
          playerMoraleDelta: -2,
        },
      };
    }

    case "poach_exec": {
      const targetCity = overlappingCities.length > 0
        ? pick(overlappingCities)
        : pick(rival.cities.length > 0 ? rival.cities : ["austin"]);
      const cityName = CITY_MAP[targetCity]?.name ?? targetCity;
      const roles = ["VP of Engineering", "Head of Operations", "Regional Director", "Chief Marketing Officer"];
      const role = pick(roles);
      return {
        ...base,
        cityId: targetCity,
        tone: "threat",
        headline: `${rival.name} poaches your ${cityName} ${role}`,
        body: `She took the offer on a Thursday. The internal announcement went out Monday morning. Two senior reports followed within the week. Internal communications have been very quiet.`,
        effect: {
          grudgeDelta: -6,
          playerMoraleDelta: -8,
          playerBrandDelta: -3,
        },
      };
    }

    case "win_contract": {
      const targetCity = pick(rival.cities.length > 0 ? rival.cities : ["phoenix"]);
      const cityName = CITY_MAP[targetCity]?.name ?? targetCity;
      const amount = Math.round(rand(2, 8));
      return {
        ...base,
        cityId: targetCity,
        tone: "neutral",
        headline: `${rival.name} wins a $${amount}M contract in ${cityName}`,
        body: `Locked in a long stretch of steady revenue. Not your fight today — but they now have the cash to start one.`,
        effect: { rivalCashDelta: amount * 1_000_000 },
      };
    }

    case "announce_acquisition": {
      return {
        ...base,
        tone: "hostile",
        headline: `${rival.name} announces quiet acquisition talks with a mid-cap competitor`,
        body: `The rumor hit the trade press on a Friday afternoon. If it closes, they double in size and land in new cities overnight.`,
        effect: { grudgeDelta: -2 },
      };
    }

    case "approach_merger": {
      const offer = Math.round(rand(1.5, 4.5) * 1_000_000);
      return {
        ...base,
        tone: "approach",
        headline: `${rival.name} quietly approaches your board about a friendly merger`,
        body: `Over dinner at the Carlyle. The pitch was elegant: combine, take the whole thing public in eighteen months, everyone wins. A standing offer of $${(offer / 1_000_000).toFixed(1)}M has been floated.`,
        effect: { grudgeDelta: 2 },
      };
    }

    case "propose_partnership": {
      return {
        ...base,
        tone: "friendly",
        headline: `${rival.name} proposes a joint marketing venture`,
        body: `The call came from their founder directly. No lawyers on the first call. Just an idea: shared promotions, shared goodwill, both brands benefit.`,
        effect: {
          grudgeDelta: 4,
          playerReputationDelta: 2,
        },
      };
    }

    case "cross_promote": {
      return {
        ...base,
        tone: "friendly",
        headline: `${rival.name} publicly praises your latest expansion`,
        body: `A warm quote in a regional business journal. Costs them nothing. Worth a great deal.`,
        effect: {
          grudgeDelta: 3,
          playerReputationDelta: 3,
        },
      };
    }

    case "press_profile": {
      const isPositive = chance(0.6);
      return {
        ...base,
        tone: isPositive ? "neutral" : "approach",
        headline: isPositive
          ? `${rival.name} lands a flattering profile in the business press`
          : `${rival.name} is the subject of a skeptical long-read`,
        body: isPositive
          ? `Cover story treatment. The CEO smiles in the photo. Their brand has a very good month.`
          : `The piece asks hard questions. Not devastating — but not forgotten.`,
        effect: {
          rivalReputationDelta: isPositive ? 3 : -4,
          rivalCashDelta: 0,
        },
      };
    }

    default:
      return null;
  }
}

// ---------- Threat prediction ----------
// Generate "what they might do next" based on archetype tendencies and recent behavior.
export function generateThreats(state: GameState): RivalThreat[] {
  const threats: RivalThreat[] = [];
  const playerCities = new Set(state.companies.flatMap((c) => c.locations.map((l) => l.cityId)));

  for (const rival of state.rivals) {
    // Check: active acquisition offer?
    if (rival.activeAcquisitionOffer) {
      threats.push({
        id: uid(),
        rivalId: rival.id,
        kind: "approach_merger",
        probability: 1,
        earliestMonth: rival.activeAcquisitionOffer.expiresMonth,
        latestMonth: rival.activeAcquisitionOffer.expiresMonth,
        headline: `${rival.name}'s acquisition offer expires`,
        detail: "If you don't respond, they move on. They don't come back for a year, if at all.",
        severity: "warning",
      });
    }

    // Likely hostile moves from aggressive rivals
    if (rival.aggression > 70 && rival.grudge < -20) {
      const nearestOverlap = rival.cities.find((c) => playerCities.has(c));
      if (nearestOverlap && rival.archetype === "incumbent") {
        threats.push({
          id: uid(),
          rivalId: rival.id,
          kind: "open_location",
          probability: 0.7,
          earliestMonth: state.month + 1,
          latestMonth: state.month + 3,
          headline: `${rival.name} will likely open a new ${CITY_MAP[nearestOverlap]?.name ?? ""} location`,
          detail: "Analyst consensus based on their leasing pattern.",
          severity: "critical",
        });
      }
      if (rival.archetype === "disruptor" && rival.talentPull > 75) {
        threats.push({
          id: uid(),
          rivalId: rival.id,
          kind: "poach_exec",
          probability: 0.6,
          earliestMonth: state.month + 1,
          latestMonth: state.month + 4,
          headline: `${rival.name} will attempt a senior poach`,
          detail: "Based on their hiring pattern and funding runway.",
          severity: "warning",
        });
      }
    }

    // Friendly rivals may propose partnerships
    if (rival.grudge > 30 && rival.archetype === "hometown_hero") {
      threats.push({
        id: uid(),
        rivalId: rival.id,
        kind: "propose_partnership",
        probability: 0.4,
        earliestMonth: state.month + 1,
        latestMonth: state.month + 3,
        headline: `${rival.name} may propose a formal partnership`,
        detail: "They've mentioned a joint marketing deal in two public interviews.",
        severity: "info",
      });
    }
  }

  return threats;
}

// ---------- Contested market calculation ----------
export function calculateContestedMarkets(state: GameState): ContestedMarket[] {
  const contested: ContestedMarket[] = [];
  for (const company of state.companies) {
    for (const loc of company.locations) {
      const rival = state.rivals.find(
        (r) => r.industry === company.industry && r.cities.includes(loc.cityId)
      );
      if (!rival) continue;
      // Share based on brand strength comparison
      const yourPower = company.brandStrength + 10;
      const theirPower = rival.brandStrength;
      const total = yourPower + theirPower;
      const yourShare = yourPower / total;
      const existing = contested.find(
        (c) => c.cityId === loc.cityId && c.industry === company.industry
      );
      if (!existing) {
        contested.push({
          cityId: loc.cityId,
          industry: company.industry,
          yourShare,
          rivalId: rival.id,
          rivalShare: 1 - yourShare,
        });
      }
    }
  }
  return contested;
}

// ---------- Applying move effects to state ----------
export function applyMoveEffects(state: GameState, moves: RivalMove[]): GameState {
  let cash = state.cash;
  const rivals = state.rivals.map((r) => ({ ...r }));
  const companies = state.companies.map((c) => ({ ...c }));

  for (const move of moves) {
    const rival = rivals.find((r) => r.id === move.rivalId);
    if (!rival || !move.effect) continue;

    if (move.effect.grudgeDelta) rival.grudge = Math.max(-100, Math.min(100, rival.grudge + move.effect.grudgeDelta));
    if (move.effect.rivalCashDelta) rival.estimatedCash += move.effect.rivalCashDelta;
    if (move.effect.rivalReputationDelta) rival.reputation = Math.max(0, Math.min(100, rival.reputation + move.effect.rivalReputationDelta));

    if (move.effect.playerCashDelta) cash += move.effect.playerCashDelta;

    // Player-affecting morale/brand/rep hits land on the flagship company
    if (companies.length > 0) {
      const flagship = companies[0];
      if (move.effect.playerMoraleDelta) {
        flagship.morale = Math.max(0, Math.min(100, flagship.morale + move.effect.playerMoraleDelta));
      }
      if (move.effect.playerBrandDelta) {
        flagship.brandStrength = Math.max(0, Math.min(100, flagship.brandStrength + move.effect.playerBrandDelta));
      }
      if (move.effect.playerReputationDelta) {
        flagship.reputation = Math.max(0, Math.min(100, flagship.reputation + move.effect.playerReputationDelta));
      }
    }
  }

  return { ...state, cash, rivals, companies };
}
