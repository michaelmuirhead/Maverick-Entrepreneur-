import { describe, it, expect } from "vitest";
import { computeSupportQuality, initSupport, supportChurnMultiplier } from "@/game/support";
import type { Employee } from "@/game/types";

function emp(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "e1",
    name: "Alex",
    role: "ops",
    level: 3,
    salary: 80_000,
    skill: 70,
    morale: 80,
    hiredWeek: 0,
    ...overrides,
  };
}

describe("support: initSupport", () => {
  it("starts at quality 80 with zero tickets/complaints", () => {
    const s = initSupport();
    expect(s.quality).toBe(80);
    expect(s.ticketsThisWeek).toBe(0);
    expect(s.complaintsRecent).toBe(0);
  });
});

describe("support: computeSupportQuality", () => {
  it("is near 100 when no users exist", () => {
    const next = computeSupportQuality(
      { totalUsers: 0, mrr: 0, employees: [emp()] },
      undefined,
    );
    expect(next.quality).toBeGreaterThanOrEqual(90);
  });

  it("degrades as users-per-rep climbs", () => {
    const small = computeSupportQuality(
      { totalUsers: 500, mrr: 10_000, employees: [emp()] },
      undefined,
    );
    const big = computeSupportQuality(
      { totalUsers: 10_000, mrr: 10_000, employees: [emp()] },
      undefined,
    );
    expect(big.quality).toBeLessThan(small.quality);
  });

  it("floors at 0 when grossly understaffed", () => {
    const next = computeSupportQuality(
      { totalUsers: 100_000, mrr: 10_000, employees: [emp()] },
      { quality: 0, ticketsThisWeek: 0, complaintsRecent: 0 },
    );
    expect(next.quality).toBeGreaterThanOrEqual(0);
    expect(next.quality).toBeLessThan(20);
  });

  it("counts ops at full weight, pm at 0.3, founder at 0.2", () => {
    const opsOnly = computeSupportQuality(
      { totalUsers: 2_000, mrr: 0, employees: [emp({ role: "ops" })] },
      undefined,
    );
    const pmOnly = computeSupportQuality(
      { totalUsers: 2_000, mrr: 0, employees: [emp({ role: "pm" })] },
      undefined,
    );
    // ops provides more support capacity than pm for the same user base.
    expect(opsOnly.quality).toBeGreaterThan(pmOnly.quality);
  });

  it("emits a ticket volume scaled ~4% of users", () => {
    const next = computeSupportQuality(
      { totalUsers: 1_000, mrr: 0, employees: [emp()] },
      undefined,
    );
    expect(next.ticketsThisWeek).toBeGreaterThan(30);
    expect(next.ticketsThisWeek).toBeLessThan(60);
  });

  it("smooths toward the target rather than snapping", () => {
    const prior = { quality: 80, ticketsThisWeek: 0, complaintsRecent: 0 };
    const next = computeSupportQuality(
      { totalUsers: 50_000, mrr: 0, employees: [emp()] },
      prior,
    );
    // Raw quality at this load would be ~0; smoothing keeps next quality between the two.
    expect(next.quality).toBeLessThan(prior.quality);
    expect(next.quality).toBeGreaterThan(0);
  });

  it("accumulates complaints while quality is poor", () => {
    let state = initSupport();
    for (let i = 0; i < 5; i++) {
      state = computeSupportQuality(
        { totalUsers: 100_000, mrr: 0, employees: [] },
        state,
      );
    }
    expect(state.complaintsRecent).toBeGreaterThan(0);
  });
});

describe("support: supportChurnMultiplier", () => {
  it("is neutral when support quality is 80", () => {
    expect(supportChurnMultiplier({ quality: 80, ticketsThisWeek: 0, complaintsRecent: 0 })).toBeCloseTo(1, 5);
  });

  it("reduces churn when support is great", () => {
    const m = supportChurnMultiplier({ quality: 100, ticketsThisWeek: 0, complaintsRecent: 0 });
    expect(m).toBeLessThan(1);
    expect(m).toBeGreaterThanOrEqual(0.85);
  });

  it("boosts churn when support is poor", () => {
    const m = supportChurnMultiplier({ quality: 0, ticketsThisWeek: 0, complaintsRecent: 0 });
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThanOrEqual(1.4);
  });

  it("returns 1 for undefined support state", () => {
    expect(supportChurnMultiplier(undefined)).toBe(1);
  });
});
