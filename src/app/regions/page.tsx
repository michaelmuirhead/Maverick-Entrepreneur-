"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { REGION_INFO, regionalSignupMultiplier } from "@/game/portfolio";
import type { Region } from "@/game/types";
import { money } from "@/lib/format";

const ALL_REGIONS: Region[] = ["na", "emea", "apac", "latam"];

export default function RegionsPage() {
  const state = useGame(s => s.state);
  const hydrated = useGame(s => s.hydrated);
  const hydrate = useGame(s => s.hydrate);
  const expand = useGame(s => s.expandRegion);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;

  const regions = state.regions ?? [];
  const activeIds = new Set(regions.map(r => r.region));
  const globalMult = regionalSignupMultiplier(regions);

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <Link href="/growth" className="mono" style={{ color: "var(--color-ink-2)", fontSize: 12 }}>← Growth</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Regional expansion</h1>

      <div className="themed-card" style={{ padding: 14 }}>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)" }}>
          Global signup multiplier · ×{globalMult.toFixed(2)}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 4 }}>
          More regions + better localization = more global signups. Localization climbs
          passively each week.
        </div>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Regions</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {ALL_REGIONS.map(r => {
          const info = REGION_INFO[r];
          const live = regions.find(x => x.region === r);
          const canAfford = state.finance.cash >= info.expansionCost;
          return (
            <div key={r} className="themed-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{info.label}</div>
                {live
                  ? <span className="themed-pill" style={{ background: "var(--color-good)", color: "#fff", fontSize: 10 }}>live</span>
                  : <span className="themed-pill" style={{ fontSize: 10 }}>not present</span>}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6, display: "grid", gap: 2 }}>
                <div>Max share · {Math.round(info.maxShare * 100)}%</div>
                {live && (
                  <>
                    <div>Market capture · {(live.marketCapture * 100).toFixed(1)}%</div>
                    <div>Localization · {live.localizationScore.toFixed(0)}/100</div>
                    <div>Entered week · {live.enteredWeek}</div>
                  </>
                )}
                {!live && <div>Expansion cost · {money(info.expansionCost, { short: true })}</div>}
              </div>
              {!live && (
                <button
                  onClick={() => expand(r)}
                  disabled={!canAfford || activeIds.has(r)}
                  className="themed-pill"
                  style={{
                    marginTop: 10, padding: "8px 14px", fontSize: 13,
                    background: canAfford ? "var(--color-accent)" : "var(--color-muted)",
                    color: "#fff", cursor: canAfford ? "pointer" : "not-allowed",
                  }}
                >
                  {canAfford ? `Expand into ${info.label}` : "Insufficient cash"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
