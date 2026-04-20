"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import {
  OFFICE_TIERS, OFFICE_TIER_ORDER, canUpgradeTo, officeMoraleModifier,
  officeProductivity, upgradeCost,
} from "@/game/office";
import type { OfficeTier } from "@/game/types";
import { money } from "@/lib/format";

export default function OfficePage() {
  const state = useGame(s => s.state);
  const hydrated = useGame(s => s.hydrated);
  const hydrate = useGame(s => s.hydrate);
  const startUpgrade = useGame(s => s.startOfficeUpgrade);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;

  const office = state.office ?? { tier: "garage" as OfficeTier, sinceWeek: 0 };
  const info = OFFICE_TIERS[office.tier];
  const headcount = state.employees.length;
  const prodMult = officeProductivity(office, headcount);
  const moraleMod = officeMoraleModifier(office, headcount);
  const pending = office.pendingUpgrade;
  const weeksLeft = pending ? Math.max(0, pending.readyWeek - state.week) : 0;

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <Link href="/growth" className="mono" style={{ color: "var(--color-ink-2)", fontSize: 12 }}>← Growth</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Office</h1>

      <div className="themed-card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{info.label}</div>
        <div style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 4 }}>{info.blurb}</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 10, display: "grid", gap: 2 }}>
          <div>Rent {money(info.weeklyLease, { short: true })}/wk · Capacity {info.capacity}</div>
          <div>Headcount {headcount} / {info.capacity} · Productivity {(prodMult * 100).toFixed(0)}% · Morale {moraleMod >= 0 ? "+" : ""}{moraleMod.toFixed(1)}</div>
          {headcount > info.capacity && (
            <div style={{ color: "var(--color-bad)" }}>
              Overcrowded — consider upgrading.
            </div>
          )}
        </div>
        {pending && (
          <div className="themed-pill" style={{ marginTop: 10, background: "var(--color-accent)", color: "#fff", fontSize: 11 }}>
            Building out: {OFFICE_TIERS[pending.toTier].label} ({weeksLeft} wk left)
          </div>
        )}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Upgrade options</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {OFFICE_TIER_ORDER.map(t => {
          const tinfo = OFFICE_TIERS[t];
          const isCurrent = t === office.tier;
          const isAllowed = canUpgradeTo(office.tier, t);
          const { cash, weeks } = upgradeCost(t);
          const canAfford = state.finance.cash >= cash;
          const disabled = !isAllowed || !canAfford || !!pending;
          return (
            <div key={t} className="themed-card" style={{ padding: 14, opacity: isCurrent || (!isAllowed && !isCurrent) ? 0.65 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {tinfo.label}
                  {isCurrent && <span className="themed-pill" style={{ fontSize: 10, marginLeft: 8 }}>current</span>}
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>cap {tinfo.capacity}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 4 }}>{tinfo.blurb}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 8, display: "grid", gap: 2 }}>
                <div>Rent {money(tinfo.weeklyLease, { short: true })}/wk · Prestige {(tinfo.prestige * 100).toFixed(0)}%</div>
                <div>Prod×{tinfo.productivityMultiplier.toFixed(2)} · Morale {tinfo.moraleModifier >= 0 ? "+" : ""}{tinfo.moraleModifier}</div>
                {!isCurrent && (
                  <div>
                    Move-in {money(cash, { short: true })} · Build-out {weeks} wk
                  </div>
                )}
              </div>
              {!isCurrent && isAllowed && (
                <button
                  onClick={() => startUpgrade(t)}
                  disabled={disabled}
                  className="themed-pill"
                  style={{
                    marginTop: 10,
                    background: disabled ? "var(--color-muted)" : "var(--color-accent)",
                    color: "#fff", padding: "8px 14px", fontSize: 13,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  {pending ? "Build-out in progress" : canAfford ? `Upgrade → ${tinfo.label}` : "Insufficient cash"}
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
