import { describe, it, expect } from "vitest";
import { buildArchiveEntry } from "@/game/archive";
import { advanceWeek } from "@/game/tick";
import { advanceProductStage } from "@/game/products";
import { makeRng } from "@/game/rng";
import { derivePricing } from "@/game/segments";
import type { GameEvent, GameState, Product } from "@/game/types";
import { newGame } from "@/game/init";

function base(): GameState {
  return newGame({
    companyName: "Maverick Labs",
    founderName: "Archive Tester",
    archetype: "technical",
    startingCash: "bootstrapped",
    startingCategory: "productivity",
    seed: "archive-test",
  });
}

function live(overrides: Partial<Product> = {}): Product {
  return {
    id: "p_arch", name: "Archie", category: "productivity",
    stage: "launched", version: "1.2",
    health: 70, quality: 70,
    users: { enterprise: 5, smb: 40, selfServe: 150 },
    pricing: derivePricing(15),
    devProgress: 100, devBudget: 0, marketingBudget: 0,
    weeksAtStage: 6, weeksSinceLaunch: 30, ageWeeks: 40,
    assignedEngineers: [],
    launchedWeek: 10,
    lifetimeRevenue: 60_000,
    lifetimeCost: 40_000,
    lifetimeDevCost: 15_000,
    lifetimeMarketingCost: 8_000,
    peakUsers: 1200,
    peakMrr: 3_000,
    techDebt: 0,
    ...overrides,
  };
}

describe("buildArchiveEntry", () => {
  it("captures lifetime tallies and verdict", () => {
    // Peak MRR must be >= current blendedMrr (live() has 4800 current MRR); otherwise backfill bumps it.
    const arch = buildArchiveEntry(live({ peakMrr: 6_000 }), 50, "sunset");
    expect(arch.lifetimeRevenue).toBe(60_000);
    expect(arch.lifetimeCost).toBe(40_000);
    expect(arch.peakUsers).toBe(1200);
    expect(arch.peakMrr).toBe(6_000);
    expect(arch.verdict).toBe("hit"); // revenue/cost = 1.5, peak >= 1000
    expect(arch.closedReason).toBe("sunset");
    expect(arch.narrative.length).toBeGreaterThan(10);
  });

  it("scores underwater products lower", () => {
    // Current users must also be tiny so peakUsers backfill doesn't bump it above the flop threshold.
    const arch = buildArchiveEntry(
      live({
        lifetimeRevenue: 2_000,
        lifetimeCost: 20_000,
        peakUsers: 80,
        users: { enterprise: 0, smb: 2, selfServe: 10 },
      }),
      50,
      "sunset",
    );
    expect(arch.verdict).toBe("flop");
  });

  it("products that never launched get 'stillborn' verdict and preLaunch reason", () => {
    const neverLaunched = live({
      stage: "concept", version: "0.1",
      launchedWeek: undefined,
      lifetimeRevenue: 0, lifetimeCost: 2_000,
      peakUsers: 0, peakMrr: 0,
    });
    const arch = buildArchiveEntry(neverLaunched, 5, "sunset");
    expect(arch.verdict).toBe("stillborn");
    expect(arch.closedReason).toBe("preLaunch");
  });

  it("peakUsers backfills from current totalUsers if never written", () => {
    const arch = buildArchiveEntry(live({ peakUsers: 0 }), 50, "sunset");
    // live() has 5 + 40 + 150 = 195 users currently
    expect(arch.peakUsers).toBe(195);
  });
});

describe("tick auto-archive on EOL", () => {
  it("moves decayed products into archivedProducts", () => {
    const s = base();
    // Force the first product to be on the brink of EOL.
    const events: GameEvent[] = [];
    const rng = makeRng("tick-arch");
    const p0 = live({
      id: s.products[0].id,
      stage: "declining", health: 5,
      weeksAtStage: 4,
      users: { enterprise: 0, smb: 2, selfServe: 5 },
    });
    const transitioned = advanceProductStage(p0, events, 20, rng);
    // Sanity: declining + low health should EOL.
    expect(transitioned.stage).toBe("eol");

    // Now bolt the transitioned product onto the game state and advance one week.
    const withEol: GameState = { ...s, products: [transitioned] };
    const next = advanceWeek(withEol);

    // The product should no longer be on the active roster.
    expect(next.products.find(p => p.id === p0.id)).toBeUndefined();
    // And there should be an archive entry with the "decayed" reason.
    expect(next.archivedProducts.length).toBeGreaterThan(0);
    const arch = next.archivedProducts.find(a => a.id === p0.id);
    expect(arch).toBeDefined();
    expect(arch?.closedReason).toBe("decayed");
  });

  it("tick accumulates lifetime revenue and peak MRR on live products", () => {
    const s = base();
    // Give the starter product enough traction that it launches and then accumulates.
    const launched = live({
      id: s.products[0].id,
      stage: "launched",
      health: 80, quality: 80,
      users: { enterprise: 5, smb: 50, selfServe: 200 },
      pricing: derivePricing(20),
      launchedWeek: 0,
      lifetimeRevenue: 0, lifetimeCost: 0,
      peakUsers: 0, peakMrr: 0,
    });
    const start: GameState = { ...s, products: [launched] };
    const next = advanceWeek(start);
    const p = next.products[0];
    expect(p.lifetimeRevenue).toBeGreaterThan(0);
    expect(p.lifetimeCost).toBeGreaterThan(0);
    expect(p.peakUsers).toBeGreaterThan(0);
    expect(p.peakMrr).toBeGreaterThan(0);
  });
});
