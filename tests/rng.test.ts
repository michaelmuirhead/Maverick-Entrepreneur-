import { describe, it, expect } from "vitest";
import { makeRng, makeIdGen } from "@/game/rng";

describe("makeRng", () => {
  it("two RNGs with the same seed produce identical sequences", () => {
    const a = makeRng("seed-42");
    const b = makeRng("seed-42");
    for (let i = 0; i < 25; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("different seeds diverge quickly", () => {
    const a = makeRng("A");
    const b = makeRng("B");
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("int returns values in the inclusive range", () => {
    const rng = makeRng("ints");
    for (let i = 0; i < 200; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it("chance(0) is never true, chance(1) is always true", () => {
    const rng = makeRng("chance");
    for (let i = 0; i < 50; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it("weighted eventually returns all items", () => {
    const rng = makeRng("weighted");
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      seen.add(rng.weighted([
        { item: "a", weight: 1 },
        { item: "b", weight: 1 },
        { item: "c", weight: 1 },
      ]));
    }
    expect(seen.size).toBe(3);
  });

  it("makeIdGen produces unique ids for the same RNG", () => {
    const rng = makeRng("ids");
    const id = makeIdGen(rng);
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(id("p"));
    expect(seen.size).toBe(50);
  });
});
