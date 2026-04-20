import { describe, it, expect } from "vitest";
import {
  PERKS,
  PERK_ORDER,
  cultureRecruitingMultiplier,
  initCulture,
  perkAttritionMultiplier,
  perkMoraleLift,
  recomputeCultureScore,
  weeklyPerkCost,
} from "@/game/culture";
import type { CultureState, PerkKind } from "@/game/types";

describe("culture: initCulture", () => {
  it("starts with no perks and a neutral-ish culture score", () => {
    const c = initCulture();
    expect(c.perks).toEqual([]);
    expect(c.cultureScore).toBeGreaterThan(0);
    expect(c.cultureScore).toBeLessThanOrEqual(60);
  });
});

describe("culture: PERKS table shape", () => {
  it("every entry in PERK_ORDER has a matching PERKS record", () => {
    for (const k of PERK_ORDER) {
      expect(PERKS[k]).toBeDefined();
      expect(PERKS[k].id).toBe(k);
      expect(PERKS[k].weeklyCostPerEmployee).toBeGreaterThanOrEqual(0);
      expect(PERKS[k].attritionReduction).toBeGreaterThan(0);
      expect(PERKS[k].attritionReduction).toBeLessThanOrEqual(1);
    }
  });
});

describe("culture: weeklyPerkCost", () => {
  it("returns 0 when no perks are enabled", () => {
    expect(weeklyPerkCost(initCulture(), 25)).toBe(0);
  });

  it("scales linearly with headcount", () => {
    const c: CultureState = { perks: ["free-lunch"], cultureScore: 50 };
    const per = PERKS["free-lunch"].weeklyCostPerEmployee;
    expect(weeklyPerkCost(c, 10)).toBe(per * 10);
    expect(weeklyPerkCost(c, 0)).toBe(0);
  });

  it("sums costs across enabled perks", () => {
    const c: CultureState = { perks: ["free-lunch", "gym-stipend"], cultureScore: 50 };
    const per = PERKS["free-lunch"].weeklyCostPerEmployee + PERKS["gym-stipend"].weeklyCostPerEmployee;
    expect(weeklyPerkCost(c, 3)).toBe(per * 3);
  });
});

describe("culture: perkMoraleLift", () => {
  it("is 0 with no perks", () => {
    expect(perkMoraleLift(initCulture())).toBe(0);
  });

  it("sums lifts across active perks", () => {
    const c: CultureState = { perks: ["remote-flex", "learning-budget"], cultureScore: 50 };
    const expected = PERKS["remote-flex"].moraleLift + PERKS["learning-budget"].moraleLift;
    expect(perkMoraleLift(c)).toBeCloseTo(expected, 5);
  });
});

describe("culture: perkAttritionMultiplier — diminishing stacking", () => {
  it("is 1.0 with no perks", () => {
    expect(perkAttritionMultiplier(initCulture())).toBe(1);
  });

  it("a single perk reduces attrition by its rate", () => {
    const c: CultureState = { perks: ["equity-refresh"], cultureScore: 50 };
    const expected = 1 - PERKS["equity-refresh"].attritionReduction;
    expect(perkAttritionMultiplier(c)).toBeCloseTo(expected, 5);
  });

  it("two perks stack sub-additively", () => {
    const c: CultureState = { perks: ["equity-refresh", "remote-flex"], cultureScore: 50 };
    const naive = 1 - PERKS["equity-refresh"].attritionReduction - PERKS["remote-flex"].attritionReduction;
    const stacked = perkAttritionMultiplier(c);
    expect(stacked).toBeGreaterThan(naive); // diminishing — not as good as naive sum
    expect(stacked).toBeLessThan(1 - PERKS["equity-refresh"].attritionReduction);
  });

  it("is capped at 0.5 even with every perk enabled", () => {
    const c: CultureState = { perks: PERK_ORDER as PerkKind[], cultureScore: 50 };
    expect(perkAttritionMultiplier(c)).toBeGreaterThanOrEqual(0.5);
  });
});

describe("culture: recomputeCultureScore", () => {
  it("defaults to morale-only when no perks are enabled", () => {
    const c = initCulture();
    const score = recomputeCultureScore(c, 70);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("scores higher with more perks active", () => {
    const low: CultureState = { perks: [], cultureScore: 40 };
    const high: CultureState = { perks: ["remote-flex", "learning-budget", "equity-refresh"], cultureScore: 40 };
    const morale = 70;
    expect(recomputeCultureScore(high, morale)).toBeGreaterThan(recomputeCultureScore(low, morale));
  });

  it("caps at 100", () => {
    const c: CultureState = { perks: PERK_ORDER as PerkKind[], cultureScore: 0 };
    expect(recomputeCultureScore(c, 100)).toBeLessThanOrEqual(100);
  });

  it("treats null morale as ~70", () => {
    const c = initCulture();
    const nullScore = recomputeCultureScore(c, null);
    const seventyScore = recomputeCultureScore(c, 70);
    expect(nullScore).toBe(seventyScore);
  });
});

describe("culture: cultureRecruitingMultiplier", () => {
  it("is neutral at culture score 40", () => {
    const c: CultureState = { perks: [], cultureScore: 40 };
    expect(cultureRecruitingMultiplier(c)).toBeCloseTo(1, 5);
  });

  it("exceeds 1 with higher culture score", () => {
    const c: CultureState = { perks: [], cultureScore: 80 };
    expect(cultureRecruitingMultiplier(c)).toBeGreaterThan(1);
  });

  it("dips below 1 with poor culture", () => {
    const c: CultureState = { perks: [], cultureScore: 10 };
    expect(cultureRecruitingMultiplier(c)).toBeLessThan(1);
  });

  it("is clamped +/- 25%", () => {
    const high: CultureState = { perks: [], cultureScore: 100 };
    const low: CultureState = { perks: [], cultureScore: 0 };
    expect(cultureRecruitingMultiplier(high)).toBeLessThanOrEqual(1.25);
    expect(cultureRecruitingMultiplier(low)).toBeGreaterThanOrEqual(0.75);
  });
});
