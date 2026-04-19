import { Employee, EmployeeRole, GameEvent, GameState } from "./types";
import { RNG, makeIdGen } from "./rng";

const FIRSTS = [
  "Alex", "Sam", "Rina", "Theo", "Zaid", "Maya", "Raj", "Ava", "Jordan", "Kai",
  "Sana", "Noor", "Leo", "Priya", "Dario", "Chen", "Elif", "Tomas", "Imani", "Yuki",
];
const LASTS = [
  "Chen", "Patel", "Okafor", "Ruiz", "Lindqvist", "Hassan", "Nakamura", "Fiorentino",
  "Kim", "O'Neill", "Adebayo", "Volkov", "Singh", "Haddad", "Marino",
];

export function salaryFor(role: EmployeeRole, level: 1 | 2 | 3): number {
  const base: Record<EmployeeRole, number> = {
    founder: 0, engineer: 90_000, designer: 85_000, pm: 100_000,
    sales: 80_000, marketing: 75_000, ops: 65_000,
  };
  const mult = level === 1 ? 0.7 : level === 2 ? 1.0 : 1.45;
  return Math.round(base[role] * mult);
}

export function weeklyPayroll(employees: Employee[]): number {
  return employees.reduce((s, e) => s + e.salary / 52, 0);
}

/** Generate a candidate pool of size `n` for the hiring screen. */
export function generateCandidates(rng: RNG, n: number, week: number): Employee[] {
  const newId = makeIdGen(rng);
  const roles: EmployeeRole[] = ["engineer", "engineer", "engineer", "designer", "pm", "sales", "marketing", "ops"];
  const candidates: Employee[] = [];
  for (let i = 0; i < n; i++) {
    const role = rng.pick(roles);
    const level = rng.weighted([
      { item: 1 as const, weight: 4 },
      { item: 2 as const, weight: 3 },
      { item: 3 as const, weight: 1 },
    ]);
    const skillBase = level === 1 ? 35 : level === 2 ? 55 : 75;
    candidates.push({
      id: newId("cand"),
      name: `${rng.pick(FIRSTS)} ${rng.pick(LASTS)}`,
      role,
      level,
      salary: salaryFor(role, level),
      skill: Math.round(skillBase + rng.range(-8, 12)),
      morale: 80,
      hiredWeek: week,
    });
  }
  return candidates;
}

/** Update morale based on game conditions. Returns mutated employees + any events. */
export function updateMoraleAndAttrition(
  state: GameState, events: GameEvent[], rng: RNG,
): Employee[] {
  const salaryMedian = state.employees.length > 1
    ? median(state.employees.map(e => e.salary).filter(s => s > 0))
    : 90_000;

  return state.employees.map(e => {
    if (e.role === "founder") return e;
    let morale = e.morale;

    // Drift toward 70 by default
    morale += (70 - morale) * 0.05;

    // Runway stress: morale drops when cash is tight
    const runwayWeeks = state.finance.cash / Math.max(1, weeklyBurnFromPayroll(state));
    if (runwayWeeks < 12) morale -= 2;
    if (runwayWeeks < 6) morale -= 3;

    // Salary satisfaction
    if (e.salary < salaryMedian * 0.85) morale -= 1;
    if (e.salary > salaryMedian * 1.15) morale += 0.5;

    // Random micro-events
    const jitter = rng.range(-2, 2);
    morale = clamp(morale + jitter, 0, 100);

    // Attrition check: low morale => chance to quit
    if (morale < 40 && rng.chance(0.03 + (40 - morale) / 1000)) {
      events.push({
        id: `ev_${state.week}_quit_${e.id}`,
        week: state.week, severity: "bad",
        message: `${e.name} (${e.role}) handed in notice. Two weeks until they walk out the door.`,
        relatedEmployeeId: e.id,
      });
      // Mark for removal: we return with morale = -1 sentinel for the caller.
      return { ...e, morale: -1 };
    }

    return { ...e, morale };
  }).filter(e => e.morale >= 0);
}

function weeklyBurnFromPayroll(state: GameState): number {
  return weeklyPayroll(state.employees);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
