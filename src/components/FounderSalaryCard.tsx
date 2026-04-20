"use client";
import { useMemo, useState } from "react";
import { useGame } from "@/game/store";
import { money } from "@/lib/format";

/**
 * Founder salary control — shared across SaaS finance and Studio HQ.
 *
 * Sets the weekly draw from the active venture's cash into the entrepreneur's
 * personal wealth. The tick engine caps the realized amount at the venture's
 * available cash so the founder can never bankrupt the company by paying
 * themselves, but the UI doesn't hide that risk — if the number is bigger than
 * the company can support, we tell the player it'll throttle down.
 */
export function FounderSalaryCard() {
  const entrepreneur = useGame(s => s.entrepreneur);
  const activeVenture = useGame(s =>
    s.entrepreneur?.ventures.find(v => v.seed === s.entrepreneur?.activeVentureId) ?? null,
  );
  const setFounderSalary = useGame(s => s.setFounderSalary);

  const currentSalary = activeVenture?.founderSalary ?? 0;
  const [draft, setDraft] = useState<number>(currentSalary);

  // When the active venture changes or the store value shifts externally (e.g. a
  // tick completes), re-seed the draft so the slider reflects reality.
  useMemo(() => setDraft(currentSalary), [currentSalary, activeVenture?.seed]);

  if (!activeVenture || !entrepreneur) return null;

  const cash = activeVenture.finance.cash;
  // Upper bound: 20% of cash or $20k, whichever is greater. Keeps the slider
  // usable for lean startups and uncapped-feeling at scale.
  const maxSalary = Math.max(20_000, Math.round(cash * 0.2));
  const capped = Math.min(draft, maxSalary);
  // Warn if the configured salary exceeds what the company can currently support.
  const willThrottle = capped > cash;
  const dirty = capped !== currentSalary;

  const commit = () => setFounderSalary(capped);
  const reset = () => { setDraft(currentSalary); };

  return (
    <div className="themed-card" style={{ padding: 14, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
            Founder weekly draw
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>
            {money(capped)}<span style={{ fontSize: 12, color: "var(--color-ink-2)", fontWeight: 500 }}> / wk</span>
          </div>
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", textAlign: "right" }}>
          Personal wealth<br />
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>
            {money(entrepreneur.personalWealth, { short: true })}
          </span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={maxSalary}
        step={Math.max(50, Math.round(maxSalary / 200))}
        value={capped}
        onChange={(e) => setDraft(Number(e.target.value))}
        style={{ width: "100%", marginTop: 12, accentColor: "var(--color-accent)" }}
      />
      <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--color-ink-2)", marginTop: 2 }}>
        <span>{money(0)}</span>
        <span>{money(maxSalary, { short: true })}/wk cap</span>
      </div>

      <div style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 10, lineHeight: 1.5 }}>
        {capped === 0
          ? "You're on a vow of founder poverty — no weekly draw. All profit reinvested."
          : willThrottle
            ? `Set to ${money(capped)}/wk, but the venture only has ${money(cash, { short: true })} on hand. Draw auto-caps at available cash each tick.`
            : `Each week, ${money(capped)} moves from venture cash into your personal wealth — funding future ventures, lifestyle, or whatever you like.`}
      </div>

      {dirty && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <button
            onClick={reset}
            className="themed-card"
            style={{ padding: 10, fontWeight: 700, background: "var(--color-surface-2)" }}
          >
            Revert
          </button>
          <button
            onClick={commit}
            className="themed-card"
            style={{ padding: 10, fontWeight: 700, background: "var(--color-accent)", color: "#fff" }}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
