"use client";
import { useEffect } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { MrrChart } from "@/components/MrrChart";
import { getHeadlineStats } from "@/game/tick";
import { fundingOffer } from "@/game/finance";
import { money } from "@/lib/format";
import { weeklyPayroll } from "@/game/team";

export default function FinancePage() {
  const state = useGame(s => s.state);
  const accept = useGame(s => s.acceptFundingOffer);
  const hydrate = useGame(s => s.hydrate);
  const hydrated = useGame(s => s.hydrated);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <div className="app-shell" style={{ padding: 40 }}>Loading…</div>;
  const stats = getHeadlineStats(state);
  const payroll = weeklyPayroll(state.employees);
  const offer = fundingOffer(state);

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Finance</h1>

      <div className="themed-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>Cash on hand</div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, marginTop: 4 }}>{money(state.finance.cash)}</div>
          </div>
          <span className="themed-pill" style={{ background: stats.runwayMo < 6 ? "var(--color-bad)" : "var(--color-good)" }}>
            {stats.runwayMo.toFixed(1)} mo runway
          </span>
        </div>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 10 }}>
          MRR {money(stats.mrr)} · Payroll {money(payroll * 4.33)}/mo · Burn ~{money(stats.monthlyBurn)}/mo
        </div>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>MRR trend</h2>
      <MrrChart />

      <h2 className="sec-head" style={{ marginTop: 18 }}>Fundraising</h2>
      <div className="themed-card" style={{ padding: 14 }}>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)" }}>Stage: {state.company.stage}</div>
        {offer ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{offer.label} offer on the table</div>
            <div className="mono" style={{ fontSize: 13, color: "var(--color-ink-2)", marginTop: 4 }}>
              {money(offer.amount, { short: true })} at {money(offer.postMoney, { short: true })} post · {(offer.dilution * 100).toFixed(0)}% dilution
            </div>
            <button onClick={accept} className="themed-pill" style={{
              marginTop: 10, background: "var(--color-accent)", color: "#fff",
              padding: "10px 14px", fontSize: 14,
            }}>Close the round</button>
          </div>
        ) : (
          <div style={{ marginTop: 10, color: "var(--color-ink-2)", fontSize: 13 }}>
            No offers this week. Investors want to see signal: a launched product with traction and healthy MRR for your stage.
          </div>
        )}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Round history</h2>
      <div className="themed-card">
        {state.finance.rounds.length === 0 ? (
          <div style={{ padding: 14, color: "var(--color-ink-2)" }}>No rounds yet.</div>
        ) : state.finance.rounds.map((r, i) => (
          <div key={i} style={{
            padding: "12px 14px", borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
            display: "grid", gridTemplateColumns: "1fr auto", gap: 10,
          }}>
            <div>
              <div style={{ fontWeight: 700 }}>{r.label}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>Week {r.week} · {money(r.postMoney, { short: true })} post</div>
            </div>
            <div className="mono" style={{ fontWeight: 700 }}>{money(r.amount, { short: true })}</div>
          </div>
        ))}
      </div>

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
