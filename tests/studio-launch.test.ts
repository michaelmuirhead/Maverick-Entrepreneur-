/**
 * Launch mechanics — review score roll, first-week sales, and post-launch
 * sales curve.
 *
 * The review score is rolled from quality + polish with tech-debt + crunch
 * penalties and a small ±8 RNG jitter. Because the rolled value drives every
 * downstream revenue decision (first-week sales conversion, live-service MAU
 * seeding, review-bomb vulnerability), these tests pin down its determinism
 * (same inputs + same seed → same score) and its monotonicity under the main
 * levers.
 *
 * They also cover the post-launch sales curve: exponential decay weighted by
 * review score (masterworks decay slower, flops decay faster) and the blended
 * platform rev-share path.
 */

import { describe, it, expect } from "vitest";
import { makeRng } from "@/game/rng";
import { launchGame, rollReviewScore, tickPostLaunchSales, nextPostLaunchStage, reviewDescriptor } from "@/game/studio/launch";
import { makeGame } from "@/game/studio/games";
import type { Game, GamePlatform, GameScope } from "@/game/studio/types";

/** Build a polish-stage game with the caller's override knobs. */
function polishGame(overrides: Partial<Game> = {}): Game {
  const g = makeGame({
    id: "g_launch",
    title: "Launch Test",
    genre: "rpg",
    scope: "indie",
    platforms: ["pc-steam"],
    startedWeek: 0,
  });
  return {
    ...g,
    stage: "polish",
    devProgress: 1,
    quality: 70,
    polish: 70,
    techDebt: 5,
    hype: 40,
    wishlist: 5000,
    assignedEngineers: ["e1", "e2", "e3"],
    ...overrides,
  };
}

describe("rollReviewScore — determinism", () => {
  it("same game + same rng seed → same score every time", () => {
    const g = polishGame({ quality: 72, polish: 68, techDebt: 10 });
    const a = rollReviewScore(g, makeRng("rev-seed-A"));
    const b = rollReviewScore(g, makeRng("rev-seed-A"));
    const c = rollReviewScore(g, makeRng("rev-seed-A"));
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("different rng seeds yield different scores (variance exists)", () => {
    const g = polishGame({ quality: 72, polish: 68 });
    const scores = new Set<number>();
    for (let i = 0; i < 20; i++) {
      scores.add(rollReviewScore(g, makeRng(`rev-${i}`)));
    }
    // At least 5 distinct values across 20 seeds.
    expect(scores.size).toBeGreaterThan(5);
  });

  it("clamps output to the [10, 98] range", () => {
    const broken = polishGame({ quality: 0, polish: 0, techDebt: 100, crunchActive: true });
    const masterwork = polishGame({ quality: 100, polish: 100, techDebt: 0 });
    for (let i = 0; i < 50; i++) {
      const r = makeRng(`clamp-${i}`);
      expect(rollReviewScore(broken, r)).toBeGreaterThanOrEqual(10);
      expect(rollReviewScore(broken, r)).toBeLessThanOrEqual(98);
    }
    for (let i = 0; i < 50; i++) {
      const r = makeRng(`clamp-hi-${i}`);
      const score = rollReviewScore(masterwork, r);
      expect(score).toBeGreaterThanOrEqual(10);
      expect(score).toBeLessThanOrEqual(98);
    }
  });
});

describe("rollReviewScore — monotonicity", () => {
  it("higher quality → higher average score", () => {
    const avg = (q: number) => {
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        sum += rollReviewScore(polishGame({ quality: q, polish: 60 }), makeRng(`q-${q}-${i}`));
      }
      return sum / 50;
    };
    expect(avg(90)).toBeGreaterThan(avg(40));
  });

  it("tech debt drags down the score", () => {
    const avg = (debt: number) => {
      let sum = 0;
      for (let i = 0; i < 50; i++) {
        sum += rollReviewScore(polishGame({ techDebt: debt }), makeRng(`debt-${debt}-${i}`));
      }
      return sum / 50;
    };
    expect(avg(0)).toBeGreaterThan(avg(50));
  });

  it("crunch adds a ~4-point penalty at the mean", () => {
    const avgCrunch = (crunch: boolean) => {
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += rollReviewScore(polishGame({ crunchActive: crunch }), makeRng(`cr-${crunch}-${i}`));
      }
      return sum / 100;
    };
    expect(avgCrunch(false) - avgCrunch(true)).toBeGreaterThan(2);
  });
});

describe("reviewDescriptor", () => {
  it("maps score ranges to descriptor buckets", () => {
    expect(reviewDescriptor(95)).toBe("Universal Acclaim");
    expect(reviewDescriptor(85)).toBe("Great");
    expect(reviewDescriptor(72)).toBe("Generally Favorable");
    expect(reviewDescriptor(60)).toBe("Mixed");
    expect(reviewDescriptor(45)).toBe("Unfavorable");
    expect(reviewDescriptor(20)).toBe("Disaster");
  });
});

describe("launchGame", () => {
  it("transitions stage to released and sets launched payload", () => {
    const g = polishGame();
    const res = launchGame(g, 30, makeRng("launch-seed"));
    expect(res.game.stage).toBe("released");
    expect(res.game.version).toBe("1.0");
    expect(res.game.launched).toBeDefined();
    expect(res.game.launched?.week).toBe(30);
    expect(res.game.launched?.firstWeekSales).toBe(res.firstWeekSales);
    expect(res.game.launched?.totalSold).toBe(res.firstWeekSales);
  });

  it("ends crunch at ship even if it was active during dev", () => {
    const crunched = polishGame({ crunchActive: true });
    const res = launchGame(crunched, 30, makeRng("no-more-crunch"));
    expect(res.game.crunchActive).toBe(false);
  });

  it("records the first tail-sales entry matching firstWeekSales", () => {
    const res = launchGame(polishGame(), 20, makeRng("tail-seed"));
    expect(res.game.launched?.weeklyTailSales).toEqual([res.firstWeekSales]);
  });

  it("is deterministic: same seed → same units + same net cash", () => {
    const g = polishGame({ quality: 80, polish: 80, hype: 60, wishlist: 8000 });
    const a = launchGame(g, 25, makeRng("determ"));
    const b = launchGame(g, 25, makeRng("determ"));
    expect(a.reviewScore).toBe(b.reviewScore);
    expect(a.firstWeekSales).toBe(b.firstWeekSales);
    expect(a.netCashToStudio).toBe(b.netCashToStudio);
  });

  it("list price follows scope — AAA priced higher than indie", () => {
    const indie = launchGame(polishGame({ scope: "indie" }), 30, makeRng("price-i"));
    const aaa = launchGame(polishGame({ scope: "AAA" }), 30, makeRng("price-a"));
    expect(aaa.listPrice).toBeGreaterThan(indie.listPrice);
  });

  it("is pure — does not mutate the input game", () => {
    const g = polishGame();
    const snapshot = JSON.stringify(g);
    launchGame(g, 30, makeRng("purity"));
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it("first-week sales scale with hype (holding review roughly constant)", () => {
    // Use a fixed seed so review rolls within same variance band.
    const low = polishGame({ hype: 10, wishlist: 5000 });
    const hot = polishGame({ hype: 80, wishlist: 5000 });
    const lowAvg = average(20, i => launchGame(low, 30, makeRng(`hype-lo-${i}`)).firstWeekSales);
    const hotAvg = average(20, i => launchGame(hot, 30, makeRng(`hype-hi-${i}`)).firstWeekSales);
    expect(hotAvg).toBeGreaterThan(lowAvg);
  });
});

describe("platform deal revenue path (blended dev-share)", () => {
  /**
   * The platform revenue share shapes *net* cash at launch: a single-platform
   * Steam ship at 70% dev share should bank ~70% of gross. A multi-platform
   * ship should also land near ~70% net because consoles share the same 70%.
   */
  it("Steam-only ship banks ~70% of gross revenue", () => {
    const g = polishGame({ platforms: ["pc-steam"], quality: 80, polish: 80, hype: 60, wishlist: 8000 });
    const res = launchGame(g, 30, makeRng("rev-steam"));
    const gross = res.firstWeekSales * res.listPrice;
    // Blended share = 0.70 on Steam.
    expect(res.netCashToStudio).toBeGreaterThan(gross * 0.68);
    expect(res.netCashToStudio).toBeLessThan(gross * 0.72);
  });

  it("multi-platform (Steam + PS + Xbox) still yields ~70% dev share (consoles also at 0.70)", () => {
    const platforms: GamePlatform[] = ["pc-steam", "playstation", "xbox"];
    const g = polishGame({ platforms, quality: 80, polish: 80, hype: 60, wishlist: 8000 });
    const res = launchGame(g, 30, makeRng("rev-multi"));
    const gross = res.firstWeekSales * res.listPrice;
    expect(res.netCashToStudio).toBeGreaterThan(gross * 0.68);
    expect(res.netCashToStudio).toBeLessThan(gross * 0.72);
  });
});

describe("tickPostLaunchSales", () => {
  /** Build a freshly-launched game with a deterministic launched payload. */
  function launched(reviewScore: number, overrides: Partial<Game> = {}): Game {
    const base = polishGame();
    return {
      ...base,
      stage: "released",
      launched: {
        week: 0,
        reviewScore,
        firstWeekSales: 10_000,
        totalSold: 10_000,
        priceAtLaunch: 20,
        weeklyTailSales: [10_000],
      },
      ...overrides,
    };
  }

  it("returns zero when the game isn't launched", () => {
    const g = polishGame();
    const res = tickPostLaunchSales(g, 5, makeRng("not-launched"));
    expect(res.units).toBe(0);
    expect(res.revenue).toBe(0);
  });

  it("zero units/revenue at launch week (no weeks elapsed)", () => {
    const g = launched(70);
    const res = tickPostLaunchSales(g, 0, makeRng("week-0"));
    expect(res.units).toBe(0);
    expect(res.revenue).toBe(0);
  });

  it("high-review games have a slower decay (more sales on week 5) than flops", () => {
    const masterwork = launched(92);
    const flop = launched(30);
    const mAvg = average(20, i =>
      tickPostLaunchSales(masterwork, 5, makeRng(`mw-${i}`)).units,
    );
    const fAvg = average(20, i =>
      tickPostLaunchSales(flop, 5, makeRng(`flop-${i}`)).units,
    );
    expect(mAvg).toBeGreaterThan(fAvg);
  });

  it("sales decay exponentially over successive weeks", () => {
    const g = launched(70);
    const wk1 = average(40, i => tickPostLaunchSales(g, 1, makeRng(`w1-${i}`)).units);
    const wk10 = average(40, i => tickPostLaunchSales(g, 10, makeRng(`w10-${i}`)).units);
    expect(wk1).toBeGreaterThan(wk10);
  });

  it("same seed + same game + same week → same units and same revenue", () => {
    const g = launched(75);
    const a = tickPostLaunchSales(g, 6, makeRng("post-determ"));
    const b = tickPostLaunchSales(g, 6, makeRng("post-determ"));
    expect(a.units).toBe(b.units);
    expect(a.revenue).toBe(b.revenue);
  });
});

describe("nextPostLaunchStage", () => {
  it("transitions 'released' → 'live-service' after 8+ weeks for a live-service genre", () => {
    const base = makeGame({
      id: "g_ls",
      title: "LS Test",
      genre: "live-service",
      scope: "AAA",
      platforms: ["pc-steam"],
      startedWeek: 0,
    });
    const g: Game = {
      ...base,
      stage: "released",
      launched: { week: 0, reviewScore: 75, firstWeekSales: 1000, totalSold: 1000, priceAtLaunch: 40, weeklyTailSales: [1000] },
    };
    expect(nextPostLaunchStage(g, 10)).toBe("live-service");
  });

  it("transitions 'released' → 'mature' after 8+ weeks for a non-live-service genre", () => {
    const base = makeGame({
      id: "g_nar",
      title: "Story Game",
      genre: "narrative",
      scope: "indie",
      platforms: ["pc-steam"],
      startedWeek: 0,
    });
    const g: Game = {
      ...base,
      stage: "released",
      launched: { week: 0, reviewScore: 75, firstWeekSales: 1000, totalSold: 1000, priceAtLaunch: 20, weeklyTailSales: [1000] },
    };
    expect(nextPostLaunchStage(g, 10)).toBe("mature");
  });

  it("keeps 'released' before 8 weeks have passed", () => {
    const g: Game = {
      ...polishGame({ genre: "rpg", scope: "AA" }),
      stage: "released",
      launched: { week: 0, reviewScore: 75, firstWeekSales: 1000, totalSold: 1000, priceAtLaunch: 30, weeklyTailSales: [1000] },
    };
    expect(nextPostLaunchStage(g, 5)).toBe("released");
  });

  it("transitions 'mature' → 'sunset' when sales die out after 52 weeks", () => {
    const g: Game = {
      ...polishGame(),
      stage: "mature",
      launched: {
        week: 0, reviewScore: 60, firstWeekSales: 1000, totalSold: 2000, priceAtLaunch: 20,
        weeklyTailSales: [2, 1, 0, 1], // very low tail, triggers sunset
      },
    };
    expect(nextPostLaunchStage(g, 60)).toBe("sunset");
  });
});

// ---- helpers ---------------------------------------------------------------

function average(n: number, fn: (i: number) => number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += fn(i);
  return s / n;
}

/** Guard against unused imports (keeps GameScope referenced if the mocks drop it). */
const _scopes: GameScope[] = ["indie", "AA", "AAA"];
void _scopes;
