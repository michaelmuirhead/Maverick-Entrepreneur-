/**
 * Headless simulation harness for Maverick Entrepreneur.
 *
 * Runs many playthroughs with scripted "player" strategies against the
 * pure `advanceWeek` engine, then prints aggregate stats to help diagnose
 * where the economy is mis-tuned.
 *
 * Usage:
 *   vite-node scripts/sim-harness.ts
 *   vite-node scripts/sim-harness.ts --weeks 156 --seeds 80
 */

import { newGame, NewGameConfig } from "../src/game/init";
import { advanceWeek } from "../src/game/tick";
import { fundingOffer, applyFundingRound, computeMrr } from "../src/game/finance";
import { salaryFor } from "../src/game/team";
import { GameState, Employee, Product } from "../src/game/types";

// ---------- CLI ----------
function argNum(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  return Number(process.argv[i + 1] ?? fallback);
}
const WEEKS = argNum("weeks", 104);
const SEEDS = argNum("seeds", 40);

// ---------- Strategies ----------
type Strategy = "naive" | "smart" | "aggressive";
type Difficulty = "lean" | "bootstrapped" | "angel-backed";

/**
 * A "player" is a reducer that looks at the state and mutates it in place
 * between advanceWeek calls. Returns the new state.
 *
 * Mutations here bypass the store and directly shape the game state the way
 * a real UI action would (design product, set budget, assign engineer, hire).
 */
function applyStrategy(s: GameState, strat: Strategy): GameState {
  const mrr = computeMrr(s);
  const next: GameState = structuredClone(s);

  // Always: accept funding offers when available.
  const offer = fundingOffer(next);
  if (offer) {
    const events = [...next.events];
    const after = applyFundingRound(next, offer, events);
    return { ...after, events };
  }

  // Find first product and its engineer assignment.
  const firstProduct = next.products[0];
  if (!firstProduct) return next;

  // Shared: always assign both founders onto the first product if engineer-eligible
  const engineerIds = next.employees
    .filter(e => e.role === "engineer" || e.role === "founder")
    .map(e => e.id);
  for (const p of next.products) {
    if (p.stage === "eol") continue;
    p.assignedEngineers = Array.from(new Set([...p.assignedEngineers, ...engineerIds]));
  }

  // Strategy-specific behavior
  switch (strat) {
    case "naive": {
      // Naive: set a modest dev budget on first product, don't touch anything else.
      if (firstProduct.stage === "concept") firstProduct.devBudget = 2000;
      if (firstProduct.stage === "dev") firstProduct.devBudget = 2000;
      break;
    }
    case "smart": {
      // Smart: ramp dev budget, add marketing post-launch, hire one engineer once MRR > $10k.
      if (firstProduct.stage === "concept" || firstProduct.stage === "dev") {
        firstProduct.devBudget = 4000;
      }
      if (["launched", "mature"].includes(firstProduct.stage)) {
        firstProduct.devBudget = 1500; // slow maintenance dev
        firstProduct.marketingBudget = 2000;
      }
      if (firstProduct.stage === "declining") {
        firstProduct.marketingBudget = 500;
      }
      if (mrr > 10_000 && next.employees.filter(e => e.role === "engineer").length < 2) {
        // Hire a mid engineer if we can afford 12 weeks of salary
        const weekly = salaryFor("engineer", 2) / 52;
        if (next.finance.cash > weekly * 12) {
          const id = `sim_eng_${next.week}`;
          const e: Employee = {
            id, name: "Sim Engineer", role: "engineer", level: 2,
            salary: salaryFor("engineer", 2),
            skill: 60, morale: 80, hiredWeek: next.week,
          };
          next.employees.push(e);
        }
      }
      break;
    }
    case "aggressive": {
      // Aggressive: max dev budget from day 1, hire early, ramp marketing hard after launch.
      if (firstProduct.stage === "concept" || firstProduct.stage === "dev") {
        firstProduct.devBudget = 6000;
      }
      if (["launched", "mature"].includes(firstProduct.stage)) {
        firstProduct.devBudget = 2500;
        firstProduct.marketingBudget = 5000;
      }
      // Hire early: one engineer at week 6 if cash allows
      if (next.week >= 6 && next.employees.filter(e => e.role === "engineer").length < 2) {
        const weekly = salaryFor("engineer", 2) / 52;
        if (next.finance.cash > weekly * 12) {
          const id = `sim_eng_${next.week}`;
          const e: Employee = {
            id, name: "Sim Engineer", role: "engineer", level: 2,
            salary: salaryFor("engineer", 2),
            skill: 60, morale: 80, hiredWeek: next.week,
          };
          next.employees.push(e);
        }
      }
      break;
    }
  }

  return next;
}

// ---------- Single run ----------
interface RunResult {
  strategy: Strategy;
  difficulty: Difficulty;
  seed: string;
  alive: boolean;
  bankruptWeek: number | null;
  firstLaunchWeek: number | null;
  weekHit5kMrr: number | null;
  weekHit40kMrr: number | null;
  seedRoundWeek: number | null;
  seriesAWeek: number | null;
  peakCash: number;
  peakMrr: number;
  endCash: number;
  endMrr: number;
  endUsers: number;
  productsShipped: number;
}

function runOnce(strategy: Strategy, difficulty: Difficulty, seed: string): RunResult {
  const cfg: NewGameConfig = {
    companyName: "Sim Labs",
    founderName: "Sim Founder",
    archetype: "technical",
    startingCash: difficulty,
    startingCategory: "application",
    seed,
  };

  let state = newGame(cfg);
  let peakCash = state.finance.cash;
  let peakMrr = 0;
  let firstLaunchWeek: number | null = null;
  let weekHit5kMrr: number | null = null;
  let weekHit40kMrr: number | null = null;
  let seedRoundWeek: number | null = null;
  let seriesAWeek: number | null = null;

  for (let w = 0; w < WEEKS; w++) {
    state = applyStrategy(state, strategy);
    state = advanceWeek(state);

    if (state.finance.cash > peakCash) peakCash = state.finance.cash;
    const mrr = computeMrr(state);
    if (mrr > peakMrr) peakMrr = mrr;

    const shipped = state.products.find(
      (p: Product) => ["launched","mature","declining","eol"].includes(p.stage)
    );
    if (shipped && firstLaunchWeek === null) firstLaunchWeek = state.week;

    if (mrr >= 5_000 && weekHit5kMrr === null) weekHit5kMrr = state.week;
    if (mrr >= 40_000 && weekHit40kMrr === null) weekHit40kMrr = state.week;

    if (state.company.stage === "seed" && seedRoundWeek === null
        && state.finance.rounds.some(r => r.label === "Seed")) {
      seedRoundWeek = state.week;
    }
    if (state.company.stage === "series-a" && seriesAWeek === null) seriesAWeek = state.week;

    if (state.gameOver) {
      return {
        strategy, difficulty, seed,
        alive: false,
        bankruptWeek: state.gameOver.week,
        firstLaunchWeek, weekHit5kMrr, weekHit40kMrr,
        seedRoundWeek, seriesAWeek,
        peakCash, peakMrr,
        endCash: state.finance.cash,
        endMrr: mrr,
        endUsers: state.products.reduce((s, p) => s + p.users.enterprise + p.users.smb + p.users.selfServe, 0),
        productsShipped: state.products.filter(p => p.stage !== "concept" && p.stage !== "dev").length,
      };
    }
  }

  const finalMrr = computeMrr(state);
  return {
    strategy, difficulty, seed,
    alive: true,
    bankruptWeek: null,
    firstLaunchWeek, weekHit5kMrr, weekHit40kMrr,
    seedRoundWeek, seriesAWeek,
    peakCash, peakMrr,
    endCash: state.finance.cash,
    endMrr: finalMrr,
    endUsers: state.products.reduce((s, p) => s + p.users.enterprise + p.users.smb + p.users.selfServe, 0),
    productsShipped: state.products.filter(p => p.stage !== "concept" && p.stage !== "dev").length,
  };
}

// ---------- Aggregation ----------
function pct(arr: number[], p: number): number {
  if (arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * p)];
}
function mean(arr: number[]): number {
  if (arr.length === 0) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function fmt$(n: number): string {
  if (isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n/1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n/1e3).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}
function fmtWk(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `w${n}`;
}

function summarize(label: string, runs: RunResult[]) {
  const alive = runs.filter(r => r.alive);
  const bankrupt = runs.filter(r => !r.alive);
  const survivalRate = alive.length / runs.length;

  const bankruptWeeks = bankrupt.map(r => r.bankruptWeek ?? 0);
  const launchWeeks = runs.map(r => r.firstLaunchWeek).filter((x): x is number => x !== null);
  const launchRate = launchWeeks.length / runs.length;
  const hit5k = runs.filter(r => r.weekHit5kMrr !== null).length / runs.length;
  const hit40k = runs.filter(r => r.weekHit40kMrr !== null).length / runs.length;
  const gotSeed = runs.filter(r => r.seedRoundWeek !== null).length / runs.length;
  const gotSeriesA = runs.filter(r => r.seriesAWeek !== null).length / runs.length;

  console.log(`\n=== ${label} (n=${runs.length}, horizon=${WEEKS}w) ===`);
  console.log(`Survival rate:       ${(survivalRate*100).toFixed(0)}%`);
  if (bankruptWeeks.length > 0) {
    console.log(`Bankruptcy median:   w${pct(bankruptWeeks, 0.5)} (p25 w${pct(bankruptWeeks,0.25)}, p75 w${pct(bankruptWeeks,0.75)})`);
  }
  console.log(`Shipped product:     ${(launchRate*100).toFixed(0)}%  (median launch ${launchWeeks.length ? `w${Math.round(pct(launchWeeks,0.5))}` : "—"})`);
  console.log(`Hit $5k MRR:         ${(hit5k*100).toFixed(0)}%`);
  console.log(`Hit $40k MRR:        ${(hit40k*100).toFixed(0)}%`);
  console.log(`Closed Seed round:   ${(gotSeed*100).toFixed(0)}%`);
  console.log(`Closed Series A:     ${(gotSeriesA*100).toFixed(0)}%`);
  console.log(`End MRR:             mean ${fmt$(mean(runs.map(r => r.endMrr)))}, p50 ${fmt$(pct(runs.map(r => r.endMrr),0.5))}, p90 ${fmt$(pct(runs.map(r => r.endMrr),0.9))}`);
  console.log(`Peak cash:           mean ${fmt$(mean(runs.map(r => r.peakCash)))}, p90 ${fmt$(pct(runs.map(r => r.peakCash),0.9))}`);
}

// ---------- Main ----------
function main() {
  const strategies: Strategy[] = ["naive", "smart", "aggressive"];
  const difficulties: Difficulty[] = ["bootstrapped", "angel-backed", "lean"];

  const allRuns: RunResult[] = [];
  for (const d of difficulties) {
    for (const strat of strategies) {
      const runs: RunResult[] = [];
      for (let i = 0; i < SEEDS; i++) {
        runs.push(runOnce(strat, d, `sim-${d}-${strat}-${i}`));
      }
      summarize(`${d} / ${strat}`, runs);
      allRuns.push(...runs);
    }
  }

  console.log(`\nTotal runs: ${allRuns.length}`);
  console.log(`Total alive at w${WEEKS}: ${allRuns.filter(r => r.alive).length}`);
}

main();
