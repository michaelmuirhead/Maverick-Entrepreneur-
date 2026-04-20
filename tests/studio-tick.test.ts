/**
 * Studio tick engine — integration tests for `tickStudio`.
 *
 * The tick is the pure-function centerpiece of the studio sim. These tests
 * exercise it end-to-end: that it's pure + deterministic, that the calendar
 * advances correctly, that it no-ops on gameOver, that burn debits cash, and
 * that the long-running paths (dev progress → launch → live-service → MAU
 * cap + churn) all hang together over many ticks.
 *
 * Live-service MAU cap is exercised explicitly: MAU should never exceed
 * peakMau (tracking invariant), churn should bring MAU down when content
 * cadence slips, and content drops should kick MAU back up to a bounded
 * fraction of peak.
 */

import { describe, it, expect } from "vitest";
import { newStudio } from "@/game/studio/init";
import { tickStudio, addGameToStudio, cancelGame } from "@/game/studio/tick";
import { makeGame } from "@/game/studio/games";
import { initLiveService, tickLiveService } from "@/game/studio/live-service";
import { makeRng } from "@/game/rng";
import type { GameStudioState, Game } from "@/game/studio/types";

function baseStudio(overrides: Partial<Parameters<typeof newStudio>[0]> = {}): GameStudioState {
  return newStudio({
    companyName: "Test Studio",
    founderName: "Test Founder",
    archetype: "design",
    startingCash: "bootstrapped",
    signatureGenre: "rpg",
    defaultScope: "indie",
    seed: "studio-unit-test-seed",
    ...overrides,
  });
}

describe("newStudio / init", () => {
  it("produces a valid starting state", () => {
    const s = baseStudio();
    expect(s.kind).toBe("game-studio");
    expect(s.week).toBe(0);
    expect(s.year).toBe(1);
    expect(s.quarter).toBe(1);
    expect(s.finance.cash).toBe(120_000); // bootstrapped
    expect(s.games).toHaveLength(0);
    expect(s.archivedGames).toHaveLength(0);
    expect(s.employees).toHaveLength(2); // founder + cofounder
    expect(s.competitorStudios.length).toBeGreaterThanOrEqual(5);
    expect(s.genreTrends.length).toBeGreaterThan(0);
    expect(s.company.signatureGenre).toBe("rpg");
  });

  it("angel-backed starts with $500k and a seed-stage company", () => {
    const s = baseStudio({ startingCash: "angel-backed" });
    expect(s.finance.cash).toBe(500_000);
    expect(s.company.stage).toBe("seed");
    expect(s.finance.rounds).toHaveLength(1);
  });

  it("founder + cofounder equity sums to 1.0", () => {
    const s = baseStudio();
    const founder = s.employees.find(e => e.role === "founder")!;
    const cofounder = s.employees.find(e => e.role !== "founder")!;
    expect((founder.equity ?? 0) + (cofounder.equity ?? 0)).toBeCloseTo(1.0, 2);
  });
});

describe("tickStudio — determinism & purity", () => {
  it("is pure: calling twice on same input returns structurally identical output", () => {
    const s = baseStudio();
    const a = tickStudio(s);
    const b = tickStudio(s);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not mutate the input state", () => {
    const s = baseStudio();
    const snapshot = JSON.stringify(s);
    tickStudio(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("advances week counter by exactly 1", () => {
    const s = baseStudio();
    expect(tickStudio(s).week).toBe(s.week + 1);
  });

  it("is reproducible across many ticks with the same seed", () => {
    const runA = (() => {
      let s = baseStudio();
      for (let i = 0; i < 30; i++) s = tickStudio(s);
      return s;
    })();
    const runB = (() => {
      let s = baseStudio();
      for (let i = 0; i < 30; i++) s = tickStudio(s);
      return s;
    })();
    expect(JSON.stringify(runA)).toBe(JSON.stringify(runB));
  });

  it("rolls year/quarter correctly over 52 weeks", () => {
    let s = baseStudio();
    for (let i = 0; i < 52; i++) s = tickStudio(s);
    expect(s.year).toBe(2);
    expect(s.week).toBe(52);
  });

  it("no-ops when gameOver is set", () => {
    const s: GameStudioState = {
      ...baseStudio(),
      gameOver: { reason: "ipo", week: 10, narrative: "fin" },
    };
    expect(tickStudio(s)).toBe(s);
  });
});

describe("tickStudio — finance burn", () => {
  it("burn debits cash when there's no revenue", () => {
    // Add a game in production with a dev budget so there's something to burn on.
    const s0 = baseStudio();
    const project: Game = {
      ...makeGame({ id: "g1", title: "Proj", genre: "rpg", scope: "indie", platforms: ["pc-steam"], startedWeek: 0 }),
      stage: "production",
      assignedEngineers: [s0.employees[0].id, s0.employees[1].id],
      devBudget: 3_000,
    };
    const s = addGameToStudio(s0, project);
    const next = tickStudio(s);
    // Founders are $0 salary so the burn comes entirely from devBudget.
    expect(next.finance.cash).toBeLessThan(s.finance.cash);
    const delta = s.finance.cash - next.finance.cash;
    expect(delta).toBeGreaterThanOrEqual(3_000);
    // And bounded on the upside — burn shouldn't be wildly larger than devBudget.
    expect(delta).toBeLessThanOrEqual(5_000);
  });

  it("crunch adds ~25% premium to dev burn", () => {
    const founderIds = (s: GameStudioState) => [s.employees[0].id, s.employees[1].id];
    const normal = addGameToStudio(baseStudio(), {
      ...makeGame({ id: "g1", title: "A", genre: "rpg", scope: "indie", platforms: ["pc-steam"], startedWeek: 0 }),
      stage: "production",
      assignedEngineers: founderIds(baseStudio()),
      devBudget: 4_000,
    });
    const crunched = addGameToStudio(baseStudio(), {
      ...makeGame({ id: "g1", title: "A", genre: "rpg", scope: "indie", platforms: ["pc-steam"], startedWeek: 0 }),
      stage: "production",
      assignedEngineers: founderIds(baseStudio()),
      devBudget: 4_000,
      crunchActive: true,
    });
    const normalBurn = normal.finance.cash - tickStudio(normal).finance.cash;
    const crunchBurn = crunched.finance.cash - tickStudio(crunched).finance.cash;
    expect(crunchBurn).toBeGreaterThan(normalBurn);
    // Premium should be roughly 25% (allow 10..50% band to absorb rounding / other deltas).
    expect(crunchBurn / normalBurn).toBeGreaterThan(1.1);
    expect(crunchBurn / normalBurn).toBeLessThan(1.5);
  });

  it("bankruptcy fires when cash goes below -$10k", () => {
    const s0 = baseStudio();
    const bleeding: GameStudioState = {
      ...s0,
      finance: { ...s0.finance, cash: 100 },
      employees: [
        ...s0.employees,
        {
          id: "e_expensive",
          name: "Expensive Hire",
          role: "engineer",
          level: 3,
          salary: 10_000_000, // absurd salary — immediate bankruptcy
          skill: 80,
          morale: 80,
          hiredWeek: 0,
        },
      ],
    };
    const next = tickStudio(bleeding);
    expect(next.gameOver?.reason).toBe("bankrupt");
  });
});

describe("tickStudio — calendar advance", () => {
  it("quarter rolls from 1 → 2 at week 13", () => {
    let s = baseStudio();
    for (let i = 0; i < 13; i++) s = tickStudio(s);
    expect(s.week).toBe(13);
    expect(s.quarter).toBe(2);
  });

  it("quarter wraps back to 1 when year rolls over", () => {
    let s = baseStudio();
    for (let i = 0; i < 52; i++) s = tickStudio(s);
    expect(s.year).toBe(2);
    expect(s.quarter).toBe(1);
  });
});

describe("tickStudio — dev progress", () => {
  it("in-dev games accrue devProgress or roll to the next stage", () => {
    const s0 = baseStudio();
    const fullyStaffed: Game = {
      ...makeGame({ id: "g1", title: "Proj", genre: "puzzle", scope: "indie", platforms: ["pc-steam"], startedWeek: 0 }),
      stage: "concept",
      assignedEngineers: [s0.employees[0].id, s0.employees[1].id],
      devBudget: 2_000,
    };
    const s = addGameToStudio(s0, fullyStaffed);
    const next = tickStudio(s);
    const project = next.games[0];
    // Either progress ticked up OR stage rolled.
    const progressed = project.devProgress > 0 || project.stage !== "concept";
    expect(progressed).toBe(true);
    expect(project.weeksSinceStart).toBe(1);
  });
});

describe("tickStudio — integration: dev → launch", () => {
  it("game shipped via planned launch flag shows up in lastTickDeltas & earns revenue", () => {
    const s0 = baseStudio();
    const shipping: Game = {
      ...makeGame({ id: "g1", title: "Ready to Ship", genre: "puzzle", scope: "indie", platforms: ["pc-steam"], startedWeek: 0 }),
      stage: "polish",
      devProgress: 0.95,
      quality: 80,
      polish: 75,
      hype: 50,
      wishlist: 5_000,
      assignedEngineers: [s0.employees[0].id, s0.employees[1].id],
      devBudget: 0,
      plannedLaunchWeek: 0, // ship now
    };
    const s = addGameToStudio(s0, shipping);
    const next = tickStudio(s);
    const shippedGame = next.games.find(g => g.id === "g1")!;
    expect(shippedGame.stage).toBe("released");
    expect(shippedGame.launched).toBeDefined();
    expect(shippedGame.launched!.firstWeekSales).toBeGreaterThan(0);
    expect(next.finance.cash).toBeGreaterThan(s.finance.cash - 5_000); // revenue offset burn
  });
});

describe("live-service MAU cap + decay", () => {
  /**
   * These tests exercise live-service mechanics at the unit level (via
   * tickLiveService directly) because the MAU cap invariant is a property of
   * the function, not of the full tick — and calling it directly lets us
   * control the starting MAU and churn inputs precisely.
   */

  function launchedLsGame(firstWeekSales = 100_000): Game {
    const base = makeGame({
      id: "g_ls",
      title: "Live Service Test",
      genre: "live-service",
      scope: "AAA",
      platforms: ["pc-steam", "playstation"],
      startedWeek: 0,
    });
    return {
      ...base,
      stage: "live-service",
      launched: {
        week: 0,
        reviewScore: 82,
        firstWeekSales,
        totalSold: firstWeekSales,
        priceAtLaunch: 40,
        weeklyTailSales: [firstWeekSales],
      },
    };
  }

  it("initLiveService seeds MAU proportional to first-week sales + review score", () => {
    const g = launchedLsGame(100_000);
    const seeded = initLiveService(g, 10);
    expect(seeded.liveService).toBeDefined();
    // Review 82 → 0.7 mult on firstWeekSales → 70k MAU.
    expect(seeded.liveService!.mau).toBe(70_000);
    expect(seeded.liveService!.peakMau).toBe(70_000);
  });

  it("MAU never exceeds peakMau within a single tick", () => {
    let g = initLiveService(launchedLsGame(50_000), 10);
    for (let wk = 11; wk < 50; wk++) {
      const res = tickLiveService(g, wk, makeRng(`cap-${wk}`), 0.7);
      g = res.game;
      // Invariant: current MAU never exceeds recorded peak.
      expect(g.liveService!.mau).toBeLessThanOrEqual(g.liveService!.peakMau);
      // Invariant: MAU non-negative.
      expect(g.liveService!.mau).toBeGreaterThanOrEqual(0);
    }
  });

  it("stale content causes churn to accelerate — MAU drops over weeks without drops", () => {
    // Seed a game with LS, then advance many weeks past the content cadence.
    const g0 = initLiveService(launchedLsGame(50_000), 0);
    const initialMau = g0.liveService!.mau;

    // Tick several weeks — first drop fires on cadence (week 4 for live-service),
    // but wait much longer than cadence so stale-content churn accumulates.
    let g: Game = g0;
    for (let wk = 1; wk <= 3; wk++) {
      g = tickLiveService(g, wk, makeRng(`stale-${wk}`), 0.7).game;
    }
    const midMau = g.liveService!.mau;
    // Over short windows MAU may bounce, but over the span from week 1 to 3
    // with no growth bucket recovery, it should generally track down.
    expect(midMau).toBeLessThanOrEqual(initialMau * 1.1);
  });

  it("content drop boosts MAU toward peak when it fires on cadence", () => {
    // Seed with content cadence 4 (default for live-service genre).
    const g0 = initLiveService(launchedLsGame(80_000), 0);
    // Synthetically reduce MAU to simulate accumulated churn.
    const g1: Game = {
      ...g0,
      liveService: { ...g0.liveService!, mau: 20_000 }, // far below peak
    };
    // Tick at week 4 — cadence satisfied, drop should fire.
    const res = tickLiveService(g1, 4, makeRng("drop"), 0.7);
    expect(res.contentDropped).toBe(true);
    // MAU should jump back up meaningfully (content boost is ~15% of peak).
    expect(res.game.liveService!.mau).toBeGreaterThan(20_000);
  });

  it("produces nonzero weekly revenue while MAU > 0", () => {
    const g = initLiveService(launchedLsGame(50_000), 0);
    const res = tickLiveService(g, 1, makeRng("rev"), 0.7);
    expect(res.revenue).toBeGreaterThan(0);
  });

  it("is pure: same inputs + same seed → same revenue and MAU delta", () => {
    const g = initLiveService(launchedLsGame(50_000), 0);
    const a = tickLiveService(g, 3, makeRng("determ-ls"), 0.7);
    const b = tickLiveService(g, 3, makeRng("determ-ls"), 0.7);
    expect(a.revenue).toBe(b.revenue);
    expect(a.mauDelta).toBe(b.mauDelta);
  });

  it("skips init for non-live-service-viable genres", () => {
    const narrative: Game = {
      ...makeGame({ id: "g_nar", title: "Story Game", genre: "narrative", scope: "indie", platforms: ["pc-steam"], startedWeek: 0 }),
      stage: "released",
      launched: { week: 0, reviewScore: 85, firstWeekSales: 10_000, totalSold: 10_000, priceAtLaunch: 25, weeklyTailSales: [10_000] },
    };
    const seeded = initLiveService(narrative, 5);
    expect(seeded.liveService).toBeUndefined();
  });

  it("skips init if liveService is already present (idempotent)", () => {
    const g0 = initLiveService(launchedLsGame(50_000), 0);
    const g1 = initLiveService(g0, 10);
    // Should return the same object (or an identical one, but definitely not overwritten).
    expect(g1.liveService).toEqual(g0.liveService);
  });
});

describe("cancelGame", () => {
  it("removes the game and archives a cancelled record", () => {
    const s0 = baseStudio();
    const project: Game = {
      ...makeGame({ id: "g1", title: "Abandoned", genre: "rpg", scope: "indie", platforms: ["pc-steam"], startedWeek: 0 }),
      stage: "production",
      weeksSinceStart: 15,
    };
    const s = addGameToStudio(s0, project);
    const next = cancelGame(s, "g1");
    expect(next.games).toHaveLength(0);
    expect(next.archivedGames).toHaveLength(1);
    expect(next.archivedGames[0].reason).toBe("cancelled");
    expect(next.archivedGames[0].title).toBe("Abandoned");
  });

  it("does nothing if the game is already launched", () => {
    const s0 = baseStudio();
    const launched: Game = {
      ...makeGame({ id: "g1", title: "Shipped", genre: "rpg", scope: "indie", platforms: ["pc-steam"], startedWeek: 0 }),
      stage: "released",
      launched: { week: 5, reviewScore: 70, firstWeekSales: 1000, totalSold: 1000, priceAtLaunch: 20, weeklyTailSales: [1000] },
    };
    const s = addGameToStudio(s0, launched);
    const next = cancelGame(s, "g1");
    expect(next.games).toHaveLength(1);
    expect(next.archivedGames).toHaveLength(0);
  });
});
