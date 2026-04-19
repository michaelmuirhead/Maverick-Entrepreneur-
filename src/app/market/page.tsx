"use client";
import { useEffect } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { PRODUCT_CATEGORIES } from "@/game/types";
import { demandFor } from "@/game/market";
import { pressureOn } from "@/game/competitors";

export default function MarketPage() {
  const state = useGame(s => s.state);
  const hydrate = useGame(s => s.hydrate);
  const hydrated = useGame(s => s.hydrated);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <div className="app-shell" style={{ padding: 40 }}>Loading…</div>;

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Market</h1>

      <h2 className="sec-head">Active trends <span className="tag">{state.trends.length}</span></h2>
      <div className="themed-card">
        {state.trends.length === 0 ? (
          <div style={{ padding: 14, color: "var(--color-ink-2)" }}>No major shifts this week. The calm before the boom.</div>
        ) : state.trends.map((t, i) => (
          <div key={t.kind} style={{
            padding: "12px 14px", borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 700 }}>{t.label}</div>
              <span className="themed-pill" style={{ background: t.demandMultiplier >= 1 ? "var(--color-good)" : "var(--color-bad)" }}>
                {t.demandMultiplier >= 1 ? "+" : ""}{((t.demandMultiplier - 1) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 4 }}>
              Affects: {t.affects.join(", ")} · ends ~W{t.startedWeek + t.durationWeeks}
            </div>
          </div>
        ))}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Demand by category</h2>
      <div className="themed-card">
        {PRODUCT_CATEGORIES.map((c, i) => {
          const mult = demandFor(c.id, state.trends);
          const pressure = pressureOn(c.id, state.competitors);
          return (
            <div key={c.id} style={{
              padding: "12px 14px", borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
              display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center",
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
                  demand {mult.toFixed(2)}× · competition {(pressure*100).toFixed(0)}%
                </div>
              </div>
              <span className="themed-pill" style={{ background: mult >= 1 ? "var(--color-good)" : "var(--color-bad)" }}>
                {mult >= 1 ? "+" : ""}{((mult - 1) * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Competitors <span className="tag">{state.competitors.length}</span></h2>
      <div className="themed-card">
        {state.competitors.map((c, i) => (
          <div key={c.id} style={{
            padding: "12px 14px", borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
            display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
                {c.category} · strength {Math.round(c.strength)} · share {(c.marketShare * 100).toFixed(1)}%
              </div>
            </div>
            <span className="themed-pill" style={{
              background: c.strength > 75 ? "var(--color-bad)" : c.strength > 50 ? "var(--color-warn)" : "var(--color-muted)",
              color: "#fff",
            }}>{c.strength > 75 ? "Dominant" : c.strength > 50 ? "Rising" : "Niche"}</span>
          </div>
        ))}
      </div>

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
