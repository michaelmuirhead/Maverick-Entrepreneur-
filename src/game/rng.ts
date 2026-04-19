import seedrandom from "seedrandom";

export interface RNG {
  /** Random float in [0, 1). */
  next(): number;
  /** Random integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number;
  /** Random float in [lo, hi). */
  range(lo: number, hi: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Uniformly pick an element from an array. */
  pick<T>(arr: readonly T[]): T;
  /** Weighted pick: items with higher weight more likely. */
  weighted<T>(items: readonly { item: T; weight: number }[]): T;
  /** Current seed state (for save). */
  state(): string;
}

export function makeRng(seed: string): RNG {
  const r = seedrandom(seed, { state: true }) as any;
  return {
    next: () => r(),
    int: (lo, hi) => Math.floor(lo + r() * (hi - lo + 1)),
    range: (lo, hi) => lo + r() * (hi - lo),
    chance: (p) => r() < p,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    weighted: (items) => {
      const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
      let k = r() * total;
      for (const it of items) { k -= Math.max(0, it.weight); if (k <= 0) return it.item; }
      return items[items.length - 1].item;
    },
    state: () => JSON.stringify(r.state()),
  };
}

/** Small id generator using the RNG so ids are reproducible from the seed. */
export function makeIdGen(rng: RNG) {
  let n = 0;
  return (prefix: string) => `${prefix}_${rng.int(0, 2 ** 24).toString(36)}${(n++).toString(36)}`;
}
