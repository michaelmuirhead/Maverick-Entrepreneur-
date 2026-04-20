"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { FounderSalaryCard } from "@/components/FounderSalaryCard";
import { MrrChart } from "@/components/MrrChart";
import { getHeadlineStats } from "@/game/tick";
import { fundingOffer, PitchOutcome } from "@/game/finance";
import { money } from "@/lib/format";
import { weeklyPayroll } from "@/game/team";

export default function FinancePage() {
  const state = useGame(s => s.state);
  const accept = useGame(s => s.acceptFundingOffer);
  const pitch = useGame(s => s.pitchForRound);
  const hydrate = useGame(s => s.hydrate);
  const hydrated = useGame(s => s.hydrated);
  const [lastPitch, setLastPitch] = useState<null | { week: number; outcome: PitchOutcome }>(null);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <div className="app-shell" style={{ padding: 40 }}>Loading…</div>;
  const stats = getHeadlineStats(state);
  const payroll = weeklyPayroll(state.employees);
  const offer = fundingOffer(state);
  // Reset any stale pitch feedback when the player advances a week — investors won't
  // rescind an offer mid-tick, but stale rejection diagnostics lie once MRR moves.
  const freshPitch = lastPitch && lastPitch.week === state.week ? lastPitch.outcome : null;
  const pitchedOffer = freshPitch?.kind === "offer" ? freshPitch.offer : null;

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

      <FounderSalaryCard />

      <h2 className="sec-head" style={{ marginTop: 18 }}>MRR trend</h2>
      <MrrChart />

      <h2 className="sec-head" style={{ marginTop: 18 }}>Fundraising</h2>
      <div className="themed-card" style={{ padding: 14 }}>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)" }}>Stage: {state.company.stage}</div>

        {/* Existing "on the table" offer (from a passive/random source or a successful pitch this week). */}
        {(offer || pitchedOffer) && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {(offer ?? pitchedOffer)!.label} offer on the table
            </div>
            <div className="mono" style={{ fontSize: 13, color: "var(--color-ink-2)", marginTop: 4 }}>
              {money((offer ?? pitchedOffer)!.amount, { short: true })} at {money((offer ?? pitchedOffer)!.postMoney, { short: true })} post · {((offer ?? pitchedOffer)!.dilution * 100).toFixed(0)}% dilution
            </div>
            <button onClick={accept} className="themed-pill" style={{
              marginTop: 10, background: "var(--color-accent)", color: "#fff",
              padding: "10px 14px", fontSize: 14,
            }}>Close the round</button>
          </div>
        )}

        {/* Active pitch action. Always available — the outcome tells you exactly where you stand. */}
        {state.company.stage !== "series-b" && !offer && (
          <div style={{ marginTop: offer || pitchedOffer ? 14 : 10 }}>
            <button
              onClick={() => setLastPitch({ week: state.week, outcome: pitch() })}
              className="themed-pill"
              disabled={freshPitch?.kind === "passed"}
              style={{
                background: freshPitch?.kind === "passed" ? "var(--color-muted)" : "var(--color-accent)",
                color: "#fff",
                padding: "10px 14px", fontSize: 14,
                opacity: freshPitch?.kind === "passed" ? 0.65 : 1,
                cursor: freshPitch?.kind === "passed" ? "not-allowed" : "pointer",
              }}
            >
              {freshPitch?.kind === "passed"
                ? "Pitched this week — try again next week"
                : state.company.stage === "pre-seed" ? "Pitch investors for Seed"
                : state.company.stage === "seed" ? "Pitch investors for Series A"
                : "Pitch investors for Series B"}
            </button>
            {freshPitch?.kind !== "passed" && (
              <p style={{ marginTop: 8, fontSize: 12, color: "var(--color-ink-2)", lineHeight: 1.4 }}>
                Active pitch — investors will give you specific feedback either way.
              </p>
            )}
          </div>
        )}

        {/* Result of the pitch this week, if they passed. */}
        {freshPitch?.kind === "passed" && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              border: "2px solid var(--color-warn)",
              borderRadius: "var(--radius-card)",
              background: "var(--color-surface-2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--color-warn)" }}>
                Investors passed on {freshPitch.nextRound}
              </div>
              <span className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)" }}>
                wk {state.week}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>
              Why they passed
            </div>
            <ul style={{ margin: "4px 0 0 0", paddingLeft: 18, fontSize: 12, color: "var(--color-ink)", lineHeight: 1.5 }}>
              {freshPitch.reasons.map((r, i) => (<li key={i}>{r}</li>))}
            </ul>
            {freshPitch.diagnostics?.required != null && (
              <div className="mono" style={{
                marginTop: 10, paddingTop: 8,
                borderTop: "1px dashed var(--color-line)",
                fontSize: 11, color: "var(--color-ink-2)",
                display: "flex", justifyContent: "space-between",
              }}>
                <span>You: {money(freshPitch.diagnostics.mrr)} MRR</span>
                <span>Bar: {money(freshPitch.diagnostics.required)} MRR</span>
              </div>
            )}
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
