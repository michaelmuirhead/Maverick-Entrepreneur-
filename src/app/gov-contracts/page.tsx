"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { weeklyGovRevenue } from "@/game/portfolio";
import { money } from "@/lib/format";

const CLEARANCE_COPY: Record<"basic" | "cleared" | "fedramp", { label: string; blurb: string; color: string }> = {
  basic:   { label: "Basic",    blurb: "Open procurement. Short timelines, modest dollars.",       color: "var(--color-muted)" },
  cleared: { label: "Cleared",  blurb: "Personnel with security clearances required.",             color: "var(--color-accent)" },
  fedramp: { label: "FedRAMP",  blurb: "Federal cloud authorization. 2+ year contracts, big $.",   color: "var(--color-good)" },
};

export default function GovContractsPage() {
  const state = useGame(s => s.state);
  const hydrated = useGame(s => s.hydrated);
  const hydrate = useGame(s => s.hydrate);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;

  const contracts = state.govContracts ?? [];
  const weeklyRevenue = weeklyGovRevenue(contracts, state.week);
  const totalValue = contracts.reduce((s, g) => s + g.totalValue, 0);

  // Eligible categories — the AI awards gov contracts to products in security-it or
  // finance-ops first, then falls through to enterprise / system.
  const hasEligibleProduct = state.products.some(p =>
    ["security-it", "finance-ops", "enterprise", "system"].includes(p.category),
  );

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <Link href="/growth" className="mono" style={{ color: "var(--color-ink-2)", fontSize: 12 }}>← Growth</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Government contracts</h1>

      <div className="themed-card" style={{ padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
              Active
            </div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, marginTop: 4 }}>
              {contracts.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
              Revenue/wk
            </div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, marginTop: 4 }}>
              {money(weeklyRevenue, { short: true })}
            </div>
          </div>
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 10 }}>
          Backlog total · {money(totalValue, { short: true })}
        </div>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>How this works</h2>
      <div className="themed-card" style={{ padding: 14, fontSize: 12, color: "var(--color-ink-2)", lineHeight: 1.5 }}>
        Government contracts aren&apos;t something you bid on directly — agencies reach
        out when you have a product in the right category (security-IT, finance-ops,
        enterprise, or system) and the right posture. Higher clearance tiers unlock as
        your compliance maturity grows. Revenue is recognized evenly over the
        contract&apos;s duration.
        {!hasEligibleProduct && (
          <div style={{ marginTop: 8, color: "var(--color-warn, #b86b00)" }}>
            ⚠️ You have no products in eligible categories. Ship something in security-IT
            or finance-ops to attract agency interest.
          </div>
        )}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Active contracts <span className="tag">{contracts.length}</span></h2>
      {contracts.length === 0 && (
        <div className="themed-card" style={{ padding: 14, color: "var(--color-ink-2)", fontSize: 13 }}>
          No awards yet. Keep shipping; the agencies will come calling.
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {contracts.map(g => {
          const totalWeeks = g.months * 4.33;
          const weeksLive = Math.max(0, state.week - g.startedWeek);
          const pct = Math.min(100, Math.round((weeksLive / totalWeeks) * 100));
          const weeksLeft = Math.max(0, Math.round(totalWeeks - weeksLive));
          const weeklyRev = g.totalValue / totalWeeks;
          const clearanceInfo = CLEARANCE_COPY[g.clearance];
          return (
            <div key={g.id} className="themed-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{g.title}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>{g.agency}</div>
                </div>
                <span className="themed-pill" style={{
                  fontSize: 10, background: clearanceInfo.color, color: "#fff",
                }}>
                  {clearanceInfo.label}
                </span>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 8, display: "grid", gap: 2 }}>
                <div>Total · {money(g.totalValue, { short: true })} over {g.months} mo</div>
                <div>Weekly · {money(weeklyRev, { short: true })} · Category {g.category}</div>
                <div>Remaining · {weeksLeft} wk</div>
              </div>
              <div style={{
                marginTop: 8, height: 6, background: "var(--color-muted)",
                borderRadius: 3, overflow: "hidden",
              }}>
                <div style={{
                  width: `${pct}%`, height: "100%", background: "var(--color-accent)",
                }} />
              </div>
              <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 4 }}>
                {pct}% paid out
              </div>
            </div>
          );
        })}
      </div>

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
