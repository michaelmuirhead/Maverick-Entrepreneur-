import { Competitor, Employee, EmployeeRole, GameEvent, GameState } from "./types";
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

/**
 * Founder-salary morale drag — vertical-agnostic.
 *
 * When the founder's weekly draw sits at $0 past week 26, every equity holder
 * (founder + cofounders) starts feeling it. This is a deliberate pressure knob
 * for the new Founder Salary feature: if the player never turns on a draw,
 * equity-holders gradually lose morale even while the company is shipping.
 *
 * Applied *after* updateMoraleAndAttrition so it stacks on top of the usual
 * drift. The drag is small (~0.3/wk) — it's meant to be noticeable over
 * quarters, not punishing in a single tick. Emits one "equity tension" event
 * per affected employee per crossing of 60 → caller dedupes if needed.
 */
export function applyFounderSalaryDrag(
  employees: Employee[],
  ctx: { week: number; founderSalary: number },
  events: GameEvent[],
): Employee[] {
  const UNPAID_THRESHOLD_WEEKS = 26;
  const DRAG_PER_WEEK = 0.3;
  if (ctx.founderSalary > 0) return employees;
  if (ctx.week < UNPAID_THRESHOLD_WEEKS) return employees;

  return employees.map(e => {
    const isEquityHolder = e.role === "founder" || (e.equity ?? 0) > 0;
    if (!isEquityHolder) return e;
    const prevMorale = e.morale;
    const nextMorale = Math.max(0, prevMorale - DRAG_PER_WEEK);
    // Fire a one-time "feeling the squeeze" event when we cross 60 going down —
    // serves as a nudge for the player to turn on the draw.
    if (prevMorale >= 60 && nextMorale < 60) {
      events.push({
        id: `ev_${ctx.week}_founder_unpaid_${e.id}`,
        week: ctx.week,
        severity: "warn",
        message: e.role === "founder"
          ? `You've been drawing $0/wk for ${ctx.week} weeks. Equity tension: your co-founder is quietly wondering when this becomes sustainable.`
          : `${e.name} is feeling the unpaid-equity stretch. Morale slipping — turning on a founder salary would help.`,
        relatedEmployeeId: e.id,
      });
    }
    return { ...e, morale: nextMorale };
  });
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

/**
 * Each week: drift morale, react to conditions (runway, salary, workload), then
 * flip low-morale employees into a notice period rather than an instant departure.
 * When an employee's notice period ends, they walk out (returned morale of -1
 * sentinel is stripped by the caller).
 *
 * Note: this function processes resignations only. Poaching attempts are driven
 * from competitors.ts via `tryPoach` and land on the same noticeEndsWeek pathway.
 */
export function updateMoraleAndAttrition(
  state: GameState, events: GameEvent[], rng: RNG,
): Employee[] {
  const salaryMedian = state.employees.length > 1
    ? median(state.employees.map(e => e.salary).filter(s => s > 0))
    : 90_000;

  // Workload calc: how many distinct products each engineer/non-founder is on.
  const workloadByEmp = new Map<string, number>();
  for (const p of state.products) {
    if (p.stage === "eol") continue;
    for (const id of p.assignedEngineers) {
      workloadByEmp.set(id, (workloadByEmp.get(id) ?? 0) + 1);
    }
  }

  return state.employees.flatMap(e => {
    if (e.role === "founder") return [e];

    // Already on notice — does their notice run out this week?
    if (typeof e.noticeEndsWeek === "number" && state.week >= e.noticeEndsWeek) {
      const why = e.noticeReason === "poached" ? "poached by a rival"
                : e.noticeReason === "offer"   ? "took the competing offer"
                :                                 "resigned for a new chapter";
      events.push({
        id: `ev_${state.week}_exit_${e.id}`,
        week: state.week, severity: "bad",
        message: `${e.name} walked out. ${capitalize(why)}. ${attritionFlavor(e, rng)}`,
        relatedEmployeeId: e.id,
      });
      return []; // employee leaves — flatMap drops them
    }
    // Still on notice but hasn't hit the week yet — pass through unchanged.
    if (typeof e.noticeEndsWeek === "number") return [e];

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

    // Workload: 1 product = fine, 2 = stretched, 3+ = grinding.
    const workload = workloadByEmp.get(e.id) ?? 0;
    if (workload >= 3) morale -= 2;
    else if (workload === 2) morale -= 0.5;

    // Random micro-events
    const jitter = rng.range(-2, 2);
    morale = clamp(morale + jitter, 0, 100);

    // Resignation check: low morale => chance to give notice (not quit instantly).
    if (morale < 40 && rng.chance(0.03 + (40 - morale) / 1000)) {
      const noticeEnds = state.week + 2;
      events.push({
        id: `ev_${state.week}_notice_${e.id}`,
        week: state.week, severity: "warn",
        message: `${e.name} (${e.role}) gave notice — ${noticeWeeksLeft(noticeEnds, state.week)} weeks until they're gone. You've got a window to counter.`,
        relatedEmployeeId: e.id,
      });
      return [{ ...e, morale, noticeReason: "resigned", noticeEndsWeek: noticeEnds }];
    }

    return [{ ...e, morale }];
  });
}

/**
 * Attempt to poach an employee on behalf of a competitor. Returns the updated
 * employees list plus an event if the attempt landed. Poaching only sticks to
 * folks NOT already on notice — a wobbly employee with low morale is more
 * vulnerable. Caller (competitor AI) owns the chance roll; this just applies.
 */
export function applyPoachAttempt(
  state: GameState, poacher: Competitor, events: GameEvent[], rng: RNG,
): Employee[] {
  // Pick the most poachable employee: non-founder, not already on notice, lowest morale.
  const target = [...state.employees]
    .filter(e => e.role !== "founder" && typeof e.noticeEndsWeek !== "number")
    .sort((a, b) => a.morale - b.morale)[0];
  if (!target) return state.employees;

  // Susceptibility: baseline 15% + morale effect + salary gap proxy.
  const moralePenalty = (70 - target.morale) / 100; // higher when morale is bad
  const baseChance = 0.15 + Math.max(0, moralePenalty) * 0.5;
  if (!rng.chance(baseChance)) {
    events.push({
      id: `ev_${state.week}_poach_miss_${target.id}`,
      week: state.week, severity: "info",
      message: `${poacher.name} pinged ${target.name} about a role. They passed — for now.`,
      relatedEmployeeId: target.id,
    });
    return state.employees;
  }

  const noticeEnds = state.week + 2;
  events.push({
    id: `ev_${state.week}_poach_hit_${target.id}`,
    week: state.week, severity: "bad",
    message: `${target.name} has a competing offer from ${poacher.name}. Two weeks to keep them or lose them.`,
    relatedEmployeeId: target.id,
  });
  return state.employees.map(e => e.id === target.id
    ? { ...e, noticeReason: "poached" as const, noticeEndsWeek: noticeEnds, poacherId: poacher.id }
    : e);
}

/** Cost of a counter-offer (salary bump). Scales with prior saves so it can't be spammed. */
export function counterOfferCost(e: Employee): number {
  const saves = e.retentionSaves ?? 0;
  return Math.round(e.salary * (0.15 + saves * 0.05)); // 15%, 20%, 25% annual raise
}

/** Cost of a one-time retention bonus (stock refresh proxy). Cash out the door today. */
export function retentionBonusCost(e: Employee): number {
  return Math.round(e.salary * 0.5); // six months of salary paid as a bonus
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
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function noticeWeeksLeft(noticeEndsWeek: number, week: number): number {
  return Math.max(0, noticeEndsWeek - week);
}
function attritionFlavor(e: Employee, rng: RNG): string {
  const lines = [
    `The team gathered around a sheet cake that said 'Good Luck ${e.name.split(" ")[0]}' in slightly uneven frosting.`,
    `Their farewell Slack post hit 37 hug emojis. Unclear if that's a lot or not.`,
    `They promised to 'stay in touch' which we all know means one LinkedIn like in 2028.`,
    `${e.name} took the team out for drinks. Two engineers have already updated their résumés.`,
  ];
  return rng.pick(lines);
}
