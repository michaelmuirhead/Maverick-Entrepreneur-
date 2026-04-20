import { describe, it, expect } from "vitest";
import {
  OFFICE_TIERS,
  OFFICE_TIER_ORDER,
  canUpgradeTo,
  initOffice,
  officeMoraleModifier,
  officePrestige,
  officeProductivity,
  resolvePendingUpgrade,
  upgradeCost,
  weeklyOfficeCost,
} from "@/game/office";
import type { OfficeState } from "@/game/types";

describe("office: initOffice", () => {
  it("starts in the garage at week 0 with no pending upgrade", () => {
    const o = initOffice();
    expect(o.tier).toBe("garage");
    expect(o.sinceWeek).toBe(0);
    expect(o.pendingUpgrade).toBeUndefined();
  });
});

describe("office: tier progression + capacity", () => {
  it("capacities monotonically increase with tier", () => {
    const caps = OFFICE_TIER_ORDER.map(t => OFFICE_TIERS[t].capacity);
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]).toBeGreaterThan(caps[i - 1]!);
    }
  });

  it("weekly lease monotonically increases", () => {
    const leases = OFFICE_TIER_ORDER.map(t => OFFICE_TIERS[t].weeklyLease);
    for (let i = 1; i < leases.length; i++) {
      expect(leases[i]).toBeGreaterThanOrEqual(leases[i - 1]!);
    }
  });

  it("campus has no upgrade path", () => {
    expect(OFFICE_TIERS.campus.upgradesTo).toEqual([]);
  });
});

describe("office: productivity", () => {
  it("returns the base multiplier when within capacity", () => {
    const o: OfficeState = { tier: "loft", sinceWeek: 0 };
    expect(officeProductivity(o, 10)).toBeCloseTo(OFFICE_TIERS.loft.productivityMultiplier, 5);
  });

  it("drags productivity down when overcrowded", () => {
    const o: OfficeState = { tier: "loft", sinceWeek: 0 };
    const base = OFFICE_TIERS.loft.productivityMultiplier;
    const over = officeProductivity(o, 50); // double cap
    expect(over).toBeLessThan(base);
  });

  it("floors productivity at 0.7 no matter how overcrowded", () => {
    const o: OfficeState = { tier: "garage", sinceWeek: 0 };
    const absurd = officeProductivity(o, 200);
    expect(absurd).toBeGreaterThanOrEqual(0.7);
  });
});

describe("office: morale modifier", () => {
  it("returns tier morale when within capacity", () => {
    const o: OfficeState = { tier: "hq", sinceWeek: 0 };
    expect(officeMoraleModifier(o, 100)).toBe(OFFICE_TIERS.hq.moraleModifier);
  });

  it("drags morale down when over capacity", () => {
    const o: OfficeState = { tier: "garage", sinceWeek: 0 };
    const normal = officeMoraleModifier(o, 4);
    const crowded = officeMoraleModifier(o, 12);
    expect(crowded).toBeLessThan(normal);
  });
});

describe("office: prestige + pending upgrade partial credit", () => {
  it("returns the tier prestige baseline", () => {
    const o: OfficeState = { tier: "office", sinceWeek: 0 };
    expect(officePrestige(o)).toBeCloseTo(OFFICE_TIERS.office.prestige, 5);
  });

  it("gives partial credit during build-out", () => {
    const o: OfficeState = {
      tier: "coworking",
      sinceWeek: 0,
      pendingUpgrade: { toTier: "loft", startedWeek: 10, readyWeek: 13 },
    };
    const p = officePrestige(o);
    expect(p).toBeGreaterThan(OFFICE_TIERS.coworking.prestige);
    expect(p).toBeLessThan(OFFICE_TIERS.loft.prestige);
  });
});

describe("office: canUpgradeTo", () => {
  it("allows allowed-next tiers only", () => {
    expect(canUpgradeTo("garage", "coworking")).toBe(true);
    expect(canUpgradeTo("garage", "loft")).toBe(true);
    expect(canUpgradeTo("garage", "hq")).toBe(false);
  });

  it("rejects self-upgrade", () => {
    expect(canUpgradeTo("loft", "loft")).toBe(false);
  });
});

describe("office: upgradeCost + weeklyOfficeCost", () => {
  it("upgradeCost returns the target tier's cost & time", () => {
    const { cash, weeks } = upgradeCost("loft");
    expect(cash).toBe(OFFICE_TIERS.loft.buildOutCost);
    expect(weeks).toBe(OFFICE_TIERS.loft.buildOutWeeks);
  });

  it("weeklyOfficeCost returns the current tier's lease", () => {
    const o: OfficeState = { tier: "office", sinceWeek: 0 };
    expect(weeklyOfficeCost(o)).toBe(OFFICE_TIERS.office.weeklyLease);
  });
});

describe("office: resolvePendingUpgrade", () => {
  it("no-ops when no upgrade is pending", () => {
    const events: string[] = [];
    const o: OfficeState = { tier: "coworking", sinceWeek: 0 };
    const next = resolvePendingUpgrade(o, 10, msg => events.push(msg));
    expect(next).toBe(o);
    expect(events).toEqual([]);
  });

  it("no-ops when the build-out week hasn't arrived yet", () => {
    const events: string[] = [];
    const o: OfficeState = {
      tier: "coworking", sinceWeek: 0,
      pendingUpgrade: { toTier: "loft", startedWeek: 5, readyWeek: 10 },
    };
    const next = resolvePendingUpgrade(o, 7, msg => events.push(msg));
    expect(next).toBe(o);
    expect(events).toEqual([]);
  });

  it("moves in when the build-out week arrives and emits an event", () => {
    const events: string[] = [];
    const o: OfficeState = {
      tier: "coworking", sinceWeek: 0,
      pendingUpgrade: { toTier: "loft", startedWeek: 5, readyWeek: 10 },
    };
    const next = resolvePendingUpgrade(o, 10, msg => events.push(msg));
    expect(next.tier).toBe("loft");
    expect(next.pendingUpgrade).toBeUndefined();
    expect(next.sinceWeek).toBe(10);
    expect(events).toHaveLength(1);
    expect(events[0]?.toLowerCase()).toContain("loft");
  });
});
