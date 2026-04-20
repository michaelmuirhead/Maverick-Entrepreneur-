/**
 * Crunch mechanics — morale damage, attrition spike, and parallel-project
 * capacity diagnostics.
 *
 * Crunch is a player-toggled overdrive on a game: dev velocity goes up, but
 * the team pays in morale decay, tech debt, and a rising probability of
 * attrition. These tests exercise:
 *
 *   - Per-week morale damage (base → fatigued)
 *   - Attrition rate ramps up as continuous crunch weeks accumulate
 *   - Culture score takes a studio-wide hit, scaled by fraction of team on crunch
 *   - Capacity diagnostics correctly identify over-commitment
 *   - Crunch-needed-for-deadline advisor math
 *
 * Morale and attrition have RNG components, so spike tests aggregate over many
 * trials with distinct seeds and check statistical properties (mean, counts)
 * instead of single-trial assertions.
 */

import { describe, it, expect } from "vitest";
import { makeRng } from "@/game/rng";
import {
  applyCrunchTick,
  startCrunch,
  endCrunch,
  maxParallelProjects,
  totalMinTeamRequired,
  isOverCommitted,
  capacityDiagnostics,
  crunchWeeksNeededForDeadline,
  pruneCrunchCounters,
} from "@/game/studio/crunch";
import { makeGame } from "@/game/studio/games";
import type { Game } from "@/game/studio/types";
import type { Employee } from "@/game/types";

// ---- helpers ---------------------------------------------------------------

function prodGame(overrides: Partial<Game> = {}): Game {
  const base = makeGame({
    id: "g_crunch",
    title: "Crunch Project",
    genre: "rpg",
    scope: "AA",
    platforms: ["pc-steam"],
    startedWeek: 0,
  });
  return {
    ...base,
    stage: "production",
    assignedEngineers: ["e1", "e2", "e3", "e4", "e5"],
    ...overrides,
  };
}

function makeTeam(ids: string[], moraleBase = 80): Employee[] {
  return ids.map(id => ({
    id,
    name: id,
    role: "engineer" as const,
    level: 3,
    salary: 120_000,
    skill: 70,
    morale: moraleBase,
    hiredWeek: 0,
  }));
}

// ---- tests -----------------------------------------------------------------

describe("startCrunch / endCrunch", () => {
  it("startCrunch sets crunchActive on an in-dev game", () => {
    const g = prodGame();
    expect(startCrunch(g).crunchActive).toBe(true);
  });

  it("startCrunch is a no-op if already crunching", () => {
    const g = prodGame({ crunchActive: true });
    expect(startCrunch(g)).toBe(g);
  });

  it("startCrunch is a no-op on post-launch games", () => {
    const g: Game = {
      ...prodGame(),
      stage: "released",
      launched: { week: 5, reviewScore: 70, firstWeekSales: 1000, totalSold: 1000, priceAtLaunch: 20, weeklyTailSales: [1000] },
    };
    expect(startCrunch(g)).toBe(g);
  });

  it("endCrunch clears the flag", () => {
    const g = prodGame({ crunchActive: true });
    expect(endCrunch(g).crunchActive).toBe(false);
  });

  it("endCrunch is a no-op when not crunching", () => {
    const g = prodGame({ crunchActive: false });
    expect(endCrunch(g)).toBe(g);
  });
});

describe("applyCrunchTick — morale damage", () => {
  it("no-op when no games are crunching", () => {
    const games = [prodGame({ crunchActive: false })];
    const team = makeTeam(["e1", "e2", "e3", "e4", "e5"]);
    const res = applyCrunchTick(games, team, makeRng("noop"), 5, {});
    expect(res.employees).toBe(team);
    expect(res.cultureDelta).toBe(0);
    expect(res.resignedIds).toEqual([]);
  });

  it("assigned engineers lose morale during crunch (base hit ~2)", () => {
    const games = [prodGame({ crunchActive: true })];
    const team = makeTeam(["e1", "e2", "e3", "e4", "e5"], 80);
    const res = applyCrunchTick(games, team, makeRng("morale-1"), 1, {});
    for (const e of res.employees) {
      expect(e.morale).toBeLessThan(80); // damaged
      expect(e.morale).toBeGreaterThanOrEqual(76); // but not catastrophic
    }
  });

  it("engineers NOT assigned to the crunching game keep their morale", () => {
    const crunching = prodGame({ crunchActive: true, assignedEngineers: ["e1", "e2"] });
    const games = [crunching];
    const team = makeTeam(["e1", "e2", "e3"]);
    const res = applyCrunchTick(games, team, makeRng("unaffected"), 1, {});
    const unaffected = res.employees.find(e => e.id === "e3")!;
    expect(unaffected.morale).toBe(80); // unchanged
  });

  it("morale damage compounds over multiple continuous weeks (fatigue)", () => {
    const games = [prodGame({ crunchActive: true })];
    const team = makeTeam(["e1", "e2", "e3"], 90);
    // Start with a prior-crunch counter of 5 weeks (past fatigue threshold of 4).
    const res = applyCrunchTick(games, team, makeRng("fatigued"), 6, { g_crunch: 5 });
    // With 6+ weeks accumulated, per-week drop should be at MAX_MORALE=4.
    for (const e of res.employees) {
      expect(90 - e.morale).toBeGreaterThanOrEqual(3.5);
    }
  });

  it("morale clamps at 0 (doesn't go negative)", () => {
    const games = [prodGame({ crunchActive: true })];
    const team = makeTeam(["e1"], 2); // very low morale
    const res = applyCrunchTick(games, team, makeRng("floor"), 10, { g_crunch: 10 });
    expect(res.employees[0].morale).toBeGreaterThanOrEqual(0);
  });
});

describe("applyCrunchTick — attrition spike", () => {
  it("attrition probability is nonzero during crunch (over many trials)", () => {
    const games = [prodGame({ crunchActive: true })];
    let totalResigned = 0;
    for (let trial = 0; trial < 100; trial++) {
      const team = makeTeam(["e1", "e2", "e3", "e4", "e5"]);
      const res = applyCrunchTick(games, team, makeRng(`attr-${trial}`), 1, {});
      totalResigned += res.resignedIds.length;
    }
    // Base attrition is ~1% per engineer per week = ~5% per 5-engineer team per week.
    // Over 100 trials with 5 engineers each, expect >0 resignations.
    expect(totalResigned).toBeGreaterThan(0);
  });

  it("attrition rate roughly doubles after 8 weeks of continuous crunch", () => {
    const games = [prodGame({ crunchActive: true })];
    // Trial at week 1 vs trial at week 10 (past CRUNCH_ATTRITION_DOUBLE_AT=8).
    let earlyQuits = 0;
    let lateQuits = 0;
    for (let trial = 0; trial < 300; trial++) {
      const team = makeTeam(["e1", "e2", "e3", "e4", "e5"], 90);
      const early = applyCrunchTick(games, team, makeRng(`early-${trial}`), 1, { g_crunch: 1 });
      earlyQuits += early.resignedIds.length;
      const team2 = makeTeam(["e1", "e2", "e3", "e4", "e5"], 90);
      const late = applyCrunchTick(games, team2, makeRng(`late-${trial}`), 10, { g_crunch: 10 });
      lateQuits += late.resignedIds.length;
    }
    // Late crunch should produce more quits than early crunch.
    expect(lateQuits).toBeGreaterThan(earlyQuits);
  });

  it("resigned employees get noticeReason + noticeEndsWeek set", () => {
    // Use a known-high-quit seed: very low morale + many weeks of crunch = near-certain quit.
    const games = [prodGame({ crunchActive: true, assignedEngineers: ["e1"] })];
    let foundResignation = false;
    for (let trial = 0; trial < 200 && !foundResignation; trial++) {
      const team = makeTeam(["e1"], 10); // morale below threshold → bonus attrition
      const res = applyCrunchTick(games, team, makeRng(`resign-${trial}`), 10, { g_crunch: 10 });
      if (res.resignedIds.includes("e1")) {
        const resigned = res.employees.find(e => e.id === "e1")!;
        expect(resigned.noticeReason).toBe("resigned");
        expect(resigned.noticeEndsWeek).toBe(12); // weekNow (10) + 2
        foundResignation = true;
      }
    }
    expect(foundResignation).toBe(true);
  });

  it("employees already on notice don't re-roll attrition", () => {
    const games = [prodGame({ crunchActive: true, assignedEngineers: ["e1"] })];
    const baseTeam = makeTeam(["e1"], 10);
    baseTeam[0].noticeReason = "resigned";
    baseTeam[0].noticeEndsWeek = 3;
    const res = applyCrunchTick(games, baseTeam, makeRng("no-reroll"), 1, {});
    // They shouldn't end up in resignedIds twice.
    expect(res.resignedIds).not.toContain("e1");
  });
});

describe("applyCrunchTick — culture damage", () => {
  it("culture delta is negative when any of the team is crunching", () => {
    const games = [prodGame({ crunchActive: true })];
    const team = makeTeam(["e1", "e2", "e3", "e4", "e5"]);
    const res = applyCrunchTick(games, team, makeRng("culture-1"), 1, {});
    expect(res.cultureDelta).toBeLessThan(0);
  });

  it("culture damage scales with the fraction of the studio in crunch", () => {
    // 2/10 on crunch vs 10/10 on crunch.
    const smallCrunch = prodGame({
      crunchActive: true,
      assignedEngineers: ["e1", "e2"],
    });
    const bigCrunch = prodGame({
      crunchActive: true,
      assignedEngineers: ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "e10"],
    });
    const team = makeTeam(["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "e10"]);
    const small = applyCrunchTick([smallCrunch], team, makeRng("c-small"), 1, {});
    const big = applyCrunchTick([bigCrunch], team, makeRng("c-big"), 1, {});
    expect(big.cultureDelta).toBeLessThan(small.cultureDelta); // more negative
  });
});

describe("parallel-project capacity", () => {
  it("maxParallelProjects scales with team size and shrinks with scope", () => {
    expect(maxParallelProjects(20, "indie")).toBeGreaterThan(maxParallelProjects(20, "AA"));
    expect(maxParallelProjects(20, "AA")).toBeGreaterThanOrEqual(maxParallelProjects(20, "AAA"));
    expect(maxParallelProjects(100, "indie")).toBeGreaterThan(maxParallelProjects(20, "indie"));
  });

  it("maxParallelProjects returns at least 1 when team > 0", () => {
    expect(maxParallelProjects(1, "AAA")).toBe(1);
    expect(maxParallelProjects(5, "AAA")).toBe(1);
    expect(maxParallelProjects(0, "indie")).toBe(0);
  });

  it("totalMinTeamRequired sums across in-dev games only", () => {
    const indieRpg = prodGame({ id: "g1", genre: "rpg", scope: "indie" });
    const aaRpg = prodGame({ id: "g2", genre: "rpg", scope: "AA" });
    const shipped: Game = {
      ...prodGame({ id: "g3", genre: "rpg", scope: "AAA" }),
      stage: "released",
      launched: { week: 5, reviewScore: 70, firstWeekSales: 1000, totalSold: 1000, priceAtLaunch: 30, weeklyTailSales: [1000] },
    };
    const reqAll = totalMinTeamRequired([indieRpg, aaRpg, shipped]);
    const reqInDev = totalMinTeamRequired([indieRpg, aaRpg]);
    // The shipped game shouldn't add to the sum.
    expect(reqAll).toBe(reqInDev);
  });

  it("isOverCommitted flips true when min team required > headcount", () => {
    const games = [
      prodGame({ id: "g1", genre: "rpg", scope: "AAA" }), // needs big team
      prodGame({ id: "g2", genre: "fps", scope: "AAA" }),
    ];
    expect(isOverCommitted(games, 10)).toBe(true);
    expect(isOverCommitted(games, 200)).toBe(false);
  });

  it("capacityDiagnostics surfaces a helpful blurb per state", () => {
    // No projects.
    const empty = capacityDiagnostics([], makeTeam(["e1", "e2"]));
    expect(empty.blurb).toMatch(/pitch/i);
    expect(empty.inDevCount).toBe(0);

    // Over-committed.
    const over = capacityDiagnostics(
      [prodGame({ id: "g1", genre: "rpg", scope: "AAA" })],
      makeTeam(["e1", "e2"]),
    );
    expect(over.overCommitted).toBe(true);
    expect(over.blurb).toMatch(/over/i);

    // Healthy.
    const healthy = capacityDiagnostics(
      [prodGame({ id: "g1", genre: "puzzle", scope: "indie" })],
      makeTeam(["e1", "e2", "e3", "e4", "e5", "e6"]),
    );
    expect(healthy.overCommitted).toBe(false);
  });

  it("capacityDiagnostics crunchFraction reflects engineers on crunching games", () => {
    const crunching = prodGame({
      crunchActive: true,
      assignedEngineers: ["e1", "e2"],
    });
    const team = makeTeam(["e1", "e2", "e3", "e4"]);
    const diag = capacityDiagnostics([crunching], team);
    expect(diag.crunchFraction).toBe(0.5);
  });
});

describe("crunchWeeksNeededForDeadline", () => {
  it("returns null for launched games or games with no plannedLaunchWeek", () => {
    const launched: Game = {
      ...prodGame(),
      stage: "released",
      launched: { week: 1, reviewScore: 70, firstWeekSales: 100, totalSold: 100, priceAtLaunch: 20, weeklyTailSales: [100] },
    };
    expect(crunchWeeksNeededForDeadline(launched, 5, 10)).toBeNull();
    const noDeadline = prodGame({ plannedLaunchWeek: undefined });
    expect(crunchWeeksNeededForDeadline(noDeadline, 5, 10)).toBeNull();
  });

  it("returns 0 when nominal weeks left ≤ weeks-to-deadline", () => {
    const g = prodGame({ plannedLaunchWeek: 20 });
    expect(crunchWeeksNeededForDeadline(g, 10, 5)).toBe(0); // 5 weeks needed, 10 weeks to spare
  });

  it("returns a positive integer when crunch is required to hit the deadline", () => {
    const g = prodGame({ plannedLaunchWeek: 20 });
    // 10 weeks to deadline, 14 weeks nominal left — need crunch.
    const weeks = crunchWeeksNeededForDeadline(g, 10, 14);
    expect(weeks).toBeGreaterThan(0);
    expect(Number.isInteger(weeks)).toBe(true);
  });
});

describe("pruneCrunchCounters", () => {
  it("drops counter entries for games that aren't crunching anymore", () => {
    const games = [
      prodGame({ id: "g1", crunchActive: true }),
      prodGame({ id: "g2", crunchActive: false }),
    ];
    const prior = { g1: 3, g2: 5, g3_ghost: 7 };
    const next = pruneCrunchCounters(prior, games);
    expect(next.g1).toBe(3);
    expect(next.g2).toBeUndefined();
    expect(next.g3_ghost).toBeUndefined();
  });

  it("drops counter entries for games that have shipped", () => {
    const shipped: Game = {
      ...prodGame({ id: "g1", crunchActive: true }),
      stage: "released",
      launched: { week: 5, reviewScore: 70, firstWeekSales: 1000, totalSold: 1000, priceAtLaunch: 20, weeklyTailSales: [1000] },
    };
    const next = pruneCrunchCounters({ g1: 4 }, [shipped]);
    expect(next.g1).toBeUndefined();
  });
});
