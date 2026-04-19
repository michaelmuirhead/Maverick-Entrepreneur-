import { GameEvent, GameState } from "./types";
import { RNG } from "./rng";

/** A tiny pool of flavorful random events that can fire each week. */
const RANDOM_EVENTS: { id: string; weight: number; severity: GameEvent["severity"]; build: (s: GameState, rng: RNG) => string | null }[] = [
  { id: "linkedin-recruiter", weight: 3, severity: "warn",
    build: (s, rng) => {
      const targets = s.employees.filter(e => e.role !== "founder" && e.morale < 75);
      if (targets.length === 0) return null;
      const t = rng.pick(targets);
      return `${t.name} got a LinkedIn message from a recruiter. They haven't said anything, but they haven't *not* said anything either.`;
    }},
  { id: "press-mention", weight: 2, severity: "good",
    build: (s, rng) => {
      const live = s.products.filter(p => ["launched","mature"].includes(p.stage));
      if (live.length === 0) return null;
      const p = rng.pick(live);
      const outlet = rng.pick(["TechCrunch", "The Pragmatic Engineer", "Lenny's Newsletter", "Product Hunt Daily"]);
      return `${outlet} mentioned ${p.name} in a roundup. Modest traffic bump incoming.`;
    }},
  { id: "office-snacks", weight: 1, severity: "info",
    build: (_s, rng) => {
      return rng.pick([
        "Someone bought a LaCroix variety pack. Morale briefly up.",
        "Team debated tabs vs. spaces for 40 minutes. No one won.",
        "The coffee machine is making a sound it shouldn't.",
      ]);
    }},
  { id: "outage", weight: 1, severity: "bad",
    build: (s, rng) => {
      const live = s.products.filter(p => ["launched","mature","declining"].includes(p.stage));
      if (live.length === 0) return null;
      const p = rng.pick(live);
      return `${p.name} had a 42-minute outage. Twitter noticed. Post-mortem scheduled.`;
    }},
  { id: "morale-boost", weight: 1, severity: "good",
    build: () => {
      return `Someone organized a company hike. Everyone is weirdly bonded now.`;
    }},
];

/** Pick a random event this week (0..1 events). Returns the rolled event or null. */
export function rollRandomEvent(state: GameState, rng: RNG): GameEvent | null {
  if (!rng.chance(0.4)) return null;
  const items = RANDOM_EVENTS.map(e => ({ item: e, weight: e.weight }));
  const pick = rng.weighted(items);
  const msg = pick.build(state, rng);
  if (!msg) return null;
  return {
    id: `ev_${state.week}_${pick.id}_${rng.int(0, 9999)}`,
    week: state.week,
    severity: pick.severity,
    message: msg,
  };
}
