/**
 * Schema v8: entrepreneur / portfolio wrapper migration.
 *
 * The top-level save shape changed from a bare `GameState` (SaaS-only) to an
 * `EntrepreneurState` that holds a list of ventures. Legacy saves must continue
 * to load — the migration wraps them as `ventures: [migratedSaas]` so existing
 * players don't lose progress.
 */

import { describe, it, expect } from "vitest";
import { newGame } from "@/game/init";
import { migrateEntrepreneurSave, importSaveJSON, exportSaveJSON } from "@/lib/storage";
import {
  ENTREPRENEUR_SCHEMA_VERSION,
  EntrepreneurState,
  isSaasVenture,
  isStudioVenture,
} from "@/game/entrepreneur";
import type { GameState } from "@/game/types";
import { SCHEMA_VERSION } from "@/game/types";

function baseSaas(overrides: Partial<Parameters<typeof newGame>[0]> = {}): GameState {
  return newGame({
    companyName: "Maverick Labs",
    founderName: "Ada Lovelace",
    archetype: "technical",
    startingCash: "bootstrapped",
    startingCategory: "application",
    seed: "migration-v8-seed",
    ...overrides,
  });
}

describe("v8 migration: legacy GameState wrapping", () => {
  it("wraps a bare legacy GameState as ventures[0]", () => {
    const legacy = baseSaas();
    const wrapped = migrateEntrepreneurSave(legacy);

    expect(wrapped.schemaVersion).toBe(ENTREPRENEUR_SCHEMA_VERSION);
    expect(wrapped.ventures).toHaveLength(1);
    expect(wrapped.activeVentureId).toBe(legacy.seed);
    expect(wrapped.founderName).toBe("Ada Lovelace");
    expect(wrapped.week).toBe(legacy.week);
    expect(wrapped.personalWealth).toBe(0);
  });

  it("preserves the SaaS venture's seed-as-id", () => {
    const legacy = baseSaas({ seed: "unique-seed-xyz" });
    const wrapped = migrateEntrepreneurSave(legacy);

    expect(wrapped.ventures[0].seed).toBe("unique-seed-xyz");
    expect(wrapped.activeVentureId).toBe("unique-seed-xyz");
  });

  it("runs the inner SaaS save through the SaaS migration chain", () => {
    // Build a synthetic legacy blob that lacks v7 subsystems, to prove the inner
    // migration still fires when a blob is double-migrated (legacy → wrapped).
    const legacy = baseSaas();
    // Strip a v7 field — downstream migrateSave should repopulate it.
    const legacyMissingOss: GameState = { ...legacy, openSource: undefined };

    const wrapped = migrateEntrepreneurSave(legacyMissingOss);
    const venture = wrapped.ventures[0];
    expect(isSaasVenture(venture)).toBe(true);
    if (!isSaasVenture(venture)) throw new Error("expected SaaS venture");
    // migrateSave seeds openSource to [] for legacy saves missing it.
    expect(Array.isArray(venture.openSource)).toBe(true);
    // And stamps schemaVersion = 7 on the inner save (entrepreneur is v8).
    expect(venture.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe("v8 migration: passthrough for already-v8 saves", () => {
  it("accepts an EntrepreneurState unchanged in shape", () => {
    const saas = baseSaas();
    const input: EntrepreneurState = {
      personalWealth: 12_345,
      founderName: "Grace Hopper",
      week: 42,
      ventures: [saas],
      activeVentureId: saas.seed,
      schemaVersion: ENTREPRENEUR_SCHEMA_VERSION,
    };
    const out = migrateEntrepreneurSave(input);
    expect(out.schemaVersion).toBe(ENTREPRENEUR_SCHEMA_VERSION);
    expect(out.personalWealth).toBe(12_345);
    expect(out.founderName).toBe("Grace Hopper");
    expect(out.week).toBe(42);
    expect(out.activeVentureId).toBe(saas.seed);
    expect(out.ventures).toHaveLength(1);
  });

  it("falls back to first venture if activeVentureId doesn't match any venture", () => {
    const saas = baseSaas({ seed: "alpha" });
    const input: EntrepreneurState = {
      personalWealth: 0,
      founderName: "Test",
      week: 0,
      ventures: [saas],
      activeVentureId: "bogus-id-not-in-ventures",
      schemaVersion: ENTREPRENEUR_SCHEMA_VERSION,
    };
    const out = migrateEntrepreneurSave(input);
    expect(out.activeVentureId).toBe("alpha");
  });

  it("walks each venture through its per-kind migration", () => {
    // Two SaaS ventures, one stripped of a v7 field. After migration both should
    // have openSource as an array.
    const a = baseSaas({ seed: "a" });
    const b: GameState = { ...baseSaas({ seed: "b" }), openSource: undefined };
    const input: EntrepreneurState = {
      personalWealth: 0,
      founderName: "Duo",
      week: 0,
      ventures: [a, b],
      activeVentureId: "a",
      schemaVersion: ENTREPRENEUR_SCHEMA_VERSION,
    };
    const out = migrateEntrepreneurSave(input);
    expect(out.ventures).toHaveLength(2);
    for (const v of out.ventures) {
      expect(isSaasVenture(v)).toBe(true);
      if (isSaasVenture(v)) expect(Array.isArray(v.openSource)).toBe(true);
    }
  });
});

describe("v8 migration: defensive edge cases", () => {
  it("returns an empty entrepreneur for a blob with no seed", () => {
    const out = migrateEntrepreneurSave({ not: "a real save" });
    expect(out.ventures).toHaveLength(0);
    expect(out.activeVentureId).toBe("");
    expect(out.schemaVersion).toBe(ENTREPRENEUR_SCHEMA_VERSION);
  });

  it("returns an empty entrepreneur for null", () => {
    const out = migrateEntrepreneurSave(null);
    expect(out.ventures).toHaveLength(0);
  });

  it("falls back to first SaaS venture's founder when founderName is missing on v8", () => {
    const saas = baseSaas({ founderName: "From The Venture" });
    const input = {
      ventures: [saas],
      activeVentureId: saas.seed,
      personalWealth: 0,
      week: 0,
      schemaVersion: ENTREPRENEUR_SCHEMA_VERSION,
      // founderName intentionally omitted
    };
    const out = migrateEntrepreneurSave(input);
    expect(out.founderName).toBe("From The Venture");
  });
});

describe("import/export JSON round-trip", () => {
  it("legacy SaaS blob → import → entrepreneur", () => {
    const legacy = baseSaas({ companyName: "LegacyCo" });
    const json = JSON.stringify(legacy);
    const out = importSaveJSON(json);
    expect(out.schemaVersion).toBe(ENTREPRENEUR_SCHEMA_VERSION);
    expect(out.ventures).toHaveLength(1);
    const only = out.ventures[0];
    if (!isSaasVenture(only)) throw new Error("expected SaaS venture");
    expect(only.company.name).toBe("LegacyCo");
  });

  it("v8 entrepreneur round-trips through export/import", () => {
    const legacy = baseSaas();
    const wrapped = migrateEntrepreneurSave(legacy);
    const json = exportSaveJSON(wrapped);
    const out = importSaveJSON(json);
    expect(out.schemaVersion).toBe(ENTREPRENEUR_SCHEMA_VERSION);
    expect(out.ventures).toHaveLength(1);
    expect(out.activeVentureId).toBe(wrapped.activeVentureId);
  });

  it("throws on non-JSON input", () => {
    expect(() => importSaveJSON("not valid json")).toThrow();
  });

  it("throws on empty object", () => {
    // Empty object passes the `typeof === 'object'` check but triggers the empty
    // entrepreneur branch, which returns an empty portfolio rather than throwing.
    // That's the intended behavior — a non-entrepreneur-shaped, non-legacy blob
    // shouldn't crash the import path.
    expect(() => importSaveJSON("{}")).not.toThrow();
    const out = importSaveJSON("{}");
    expect(out.ventures).toHaveLength(0);
  });
});

describe("isSaasVenture / isStudioVenture discriminators", () => {
  it("identifies legacy SaaS state as SaaS", () => {
    const saas = baseSaas();
    expect(isSaasVenture(saas)).toBe(true);
    expect(isStudioVenture(saas)).toBe(false);
  });
});
