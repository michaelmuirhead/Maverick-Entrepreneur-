"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { PERKS, PERK_ORDER, cultureRecruitingMultiplier, weeklyPerkCost } from "@/game/culture";
import { money } from "@/lib/format";

export default function CulturePage() {
  const state = useGame(s => s.state);
  const hydrated = useGame(s => s.hydrated);
  const hydrate = useGame(s => s.hydrate);
  const toggle = useGame(s => s.togglePerk);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;

  const culture = state.culture ?? { perks: [], cultureScore: 40 };
  const enabledSet = new Set(culture.perks);
  const burn = weeklyPerkCost(culture, state.employees.length);
  const recruitMult = cultureRecruitingMultiplier(culture);

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <Link href="/growth" className="mono" style={{ color: "var(--color-ink-2)", fontSize: 12 }}>← Growth</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Culture & perks</h1>

      <div className="themed-card" style={{ padding: 14 }}>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)" }}>
          Culture score · {culture.cultureScore}/100 · Recruiting ×{recruitMult.toFixed(2)}
        </div>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 2 }}>
          Weekly perk burn: {money(burn, { short: true })} (headcount {state.employees.length})
        </div>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Perks</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {PERK_ORDER.map(k => {
          const info = PERKS[k];
          const on = enabledSet.has(k);
          return (
            <div key={k} className="themed-card" style={{ padding: 14, borderColor: on ? "var(--color-accent)" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{info.label}</div>
                <span className="themed-pill" style={{ fontSize: 10, background: on ? "var(--color-good)" : "var(--color-muted)" }}>
                  {info.vibe}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 4 }}>{info.blurb}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 8, display: "grid", gap: 2 }}>
                <div>
                  ${info.weeklyCostPerEmployee}/employee/wk · morale +{info.moraleLift.toFixed(2)}/tick
                </div>
                <div>Attrition −{(info.attritionReduction * 100).toFixed(0)}% · Culture +{info.cultureScore}</div>
              </div>
              <button
                onClick={() => toggle(k)}
                className="themed-pill"
                style={{
                  marginTop: 10, padding: "8px 14px", fontSize: 13,
                  background: on ? "var(--color-bad)" : "var(--color-accent)",
                  color: "#fff", cursor: "pointer",
                }}
              >
                {on ? "Turn off" : "Enable"}
              </button>
            </div>
          );
        })}
      </div>

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
