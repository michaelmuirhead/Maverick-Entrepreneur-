"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { IPO_MRR_FLOOR, ipoEligible, ipoMinDwell, ipoValuation } from "@/game/portfolio";
import type { IpoStage } from "@/game/types";
import { money } from "@/lib/format";

const STAGE_ORDER: IpoStage[] = ["none", "exploring", "filed", "roadshow", "public"];
const STAGE_COPY: Record<IpoStage, { label: string; blurb: string }> = {
  none:      { label: "Not started",  blurb: "No IPO activity. Everything's private." },
  exploring: { label: "Exploring",    blurb: "Talking to bankers + auditors. This takes 8 weeks minimum." },
  filed:     { label: "Filed S-1",    blurb: "Your prospectus is in with the SEC. 6 weeks to wait for review." },
  roadshow:  { label: "Roadshow",     blurb: "Meeting institutional investors. 3 weeks to pricing." },
  public:    { label: "Public",       blurb: "Shares trade. You're on the tape." },
};

export default function IpoPage() {
  const state = useGame(s => s.state);
  const hydrated = useGame(s => s.hydrated);
  const hydrate = useGame(s => s.hydrate);
  const advance = useGame(s => s.advanceIpo);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;

  const ipo = state.ipo ?? { stage: "none" as IpoStage, stageStartedWeek: 0 };
  const currentIdx = STAGE_ORDER.indexOf(ipo.stage);
  const elig = ipoEligible(state);
  const dwell = ipoMinDwell(ipo.stage);
  const weeksInStage = state.week - ipo.stageStartedWeek;
  const dwellOk = ipo.stage === "none" || weeksInStage >= dwell;
  const valuationPreview = ipoValuation(state);
  const mrr = state.finance.mrr ?? 0;
  const mrrRatio = Math.min(1, mrr / IPO_MRR_FLOOR);

  const isPublic = ipo.stage === "public";
  const canAdvance = !isPublic && (ipo.stage === "none" ? elig.ok : dwellOk);
  const buttonReason = isPublic
    ? "Already trading"
    : ipo.stage === "none"
      ? (elig.ok ? "Start exploring" : elig.reason ?? "Not yet eligible")
      : dwellOk
        ? `Advance to ${STAGE_ORDER[currentIdx + 1] ?? "—"}`
        : `Wait ${dwell - weeksInStage} more wk in this stage`;

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <Link href="/growth" className="mono" style={{ color: "var(--color-ink-2)", fontSize: 12 }}>← Growth</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>IPO</h1>

      <div className="themed-card" style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Current stage</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, fontFamily: "var(--font-display)" }}>{STAGE_COPY[ipo.stage].label}</div>
          </div>
          {isPublic && (
            <span className="themed-pill" style={{ background: "var(--color-good)", color: "#fff", fontSize: 11 }}>trading</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 6 }}>{STAGE_COPY[ipo.stage].blurb}</div>
        {ipo.stage !== "none" && !isPublic && (
          <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6 }}>
            In stage for {weeksInStage} wk · min dwell {dwell} wk
          </div>
        )}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Stage progression</h2>
      <div className="themed-card" style={{ padding: 14, display: "grid", gap: 8 }}>
        {STAGE_ORDER.map((stage, idx) => {
          const done = idx < currentIdx;
          const current = idx === currentIdx;
          const dot = done ? "●" : current ? "◉" : "○";
          const color = done ? "var(--color-good)" : current ? "var(--color-accent)" : "var(--color-muted)";
          return (
            <div key={stage} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, alignItems: "baseline" }}>
              <div style={{ color, fontSize: 16, textAlign: "center" }}>{dot}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{STAGE_COPY[stage].label}</div>
                <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 1 }}>{STAGE_COPY[stage].blurb}</div>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Eligibility</h2>
      <div className="themed-card" style={{ padding: 14, display: "grid", gap: 6 }}>
        <div className="mono" style={{ fontSize: 12 }}>
          Company stage · <span style={{ color: state.company.stage === "series-b" ? "var(--color-good)" : "var(--color-ink-2)" }}>
            {state.company.stage}
          </span>
          {state.company.stage !== "series-b" && (
            <span style={{ color: "var(--color-ink-2)" }}> (need Series B)</span>
          )}
        </div>
        <div className="mono" style={{ fontSize: 12 }}>
          MRR · {money(mrr, { short: true })} / {money(IPO_MRR_FLOOR, { short: true })} threshold
        </div>
        <div style={{
          height: 6, background: "var(--color-muted)", borderRadius: 3, overflow: "hidden",
        }}>
          <div style={{
            width: `${mrrRatio * 100}%`, height: "100%",
            background: mrrRatio >= 1 ? "var(--color-good)" : "var(--color-accent)",
          }} />
        </div>
        {!elig.ok && ipo.stage === "none" && (
          <div style={{ fontSize: 11, color: "var(--color-warn, #b86b00)", marginTop: 4 }}>
            {elig.reason}
          </div>
        )}
      </div>

      {!isPublic && (
        <>
          <h2 className="sec-head" style={{ marginTop: 18 }}>Valuation</h2>
          <div className="themed-card" style={{ padding: 14, display: "grid", gap: 4 }}>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
              {money(valuationPreview, { short: true })}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
              Blended estimate · 10× ARR. Roughly {money(Math.round(valuationPreview * 0.2), { short: true })} raised at pricing
              (20% free float).
            </div>
          </div>
        </>
      )}

      {isPublic && ipo.proceeds !== undefined && (
        <>
          <h2 className="sec-head" style={{ marginTop: 18 }}>IPO receipt</h2>
          <div className="themed-card" style={{ padding: 14, display: "grid", gap: 4 }}>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--color-good)" }}>
              {money(ipo.proceeds, { short: true })}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
              Booked to cash at pricing. Welcome to the public markets.
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: 18 }}>
        <button
          onClick={() => advance()}
          disabled={!canAdvance}
          className="themed-pill"
          style={{
            width: "100%", padding: "12px 14px", fontSize: 14, fontWeight: 700,
            cursor: canAdvance ? "pointer" : "not-allowed",
            background: canAdvance ? "var(--color-accent)" : "var(--color-muted)",
            color: "#fff",
          }}
        >
          {buttonReason}
        </button>
      </div>

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
