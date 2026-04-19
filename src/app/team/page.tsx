"use client";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { counterOfferCost, generateCandidates, retentionBonusCost } from "@/game/team";
import { ROLE_LABELS, Employee } from "@/game/types";
import { makeRng } from "@/game/rng";
import { money } from "@/lib/format";

const ROLE_GLYPH: Record<string, string> = {
  founder: "⭐", engineer: "👩‍💻", designer: "🎨", pm: "📋", sales: "📞", marketing: "📣", ops: "⚙️",
};

export default function TeamPage() {
  const state = useGame(s => s.state);
  const hire = useGame(s => s.hireCandidate);
  const fire = useGame(s => s.fireEmployee);
  const counter = useGame(s => s.counterOffer);
  const bonus = useGame(s => s.retentionBonus);
  const hydrate = useGame(s => s.hydrate);
  const hydrated = useGame(s => s.hydrated);
  const [tab, setTab] = useState<"roster" | "hire">("roster");

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);

  // Candidates are derived from the game seed + week so they're stable across re-renders.
  // We filter out candidates whose ID is already on the roster — hired candidates keep their
  // ID when they become employees, so this is what makes the "Hire" click feel immediate:
  // the row disappears from the pool and shows up in Roster on the next render.
  const candidates = useMemo(() => {
    if (!state) return [];
    const rng = makeRng(`${state.seed}:hire-pool:${state.week}`);
    const pool = generateCandidates(rng, 6, state.week);
    const hiredIds = new Set(state.employees.map(e => e.id));
    return pool.filter(c => !hiredIds.has(c.id));
  }, [state?.seed, state?.week, state?.employees]);

  if (!state) return <div className="app-shell" style={{ padding: 40 }}>Loading…</div>;

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Team</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
        {(["roster", "hire"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="themed-card"
            style={{
              padding: 10, fontWeight: 700, fontSize: 14,
              background: tab === t ? "var(--color-accent)" : "var(--color-surface)",
              color: tab === t ? "#fff" : "var(--color-ink)",
            }}
          >{t === "roster" ? "Roster" : "Hire"}</button>
        ))}
      </div>

      {tab === "roster" ? (
        <>
          {state.employees.some(e => typeof e.noticeEndsWeek === "number") && (
            <>
              <h2 className="sec-head" style={{ marginTop: 18, color: "var(--color-warn)" }}>
                On notice <span className="tag warn">{state.employees.filter(e => typeof e.noticeEndsWeek === "number").length}</span>
              </h2>
              <div className="themed-card" style={{ borderColor: "var(--color-warn)" }}>
                {state.employees
                  .filter(e => typeof e.noticeEndsWeek === "number")
                  .map((e, i, arr) => (
                    <NoticeRow
                      key={e.id}
                      e={e}
                      week={state.week}
                      cash={state.finance.cash}
                      onCounter={() => counter(e.id)}
                      onBonus={() => bonus(e.id)}
                      onAccept={() => fire(e.id)}
                      isFirst={i === 0}
                      _hasMore={i < arr.length - 1}
                    />
                  ))}
              </div>
            </>
          )}

          <h2 className="sec-head" style={{ marginTop: 18 }}>Your people <span className="tag">{state.employees.length}</span></h2>
          <div className="themed-card">
            {state.employees.map((e, i) => (
              <div key={e.id} style={{
                display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 10,
                padding: "12px 14px", alignItems: "center",
                borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", border: "var(--border-card)",
                  display: "grid", placeItems: "center", fontSize: 20, background: "var(--color-surface-2)",
                }}>{ROLE_GLYPH[e.role] ?? "👤"}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {e.name}
                    {typeof e.noticeEndsWeek === "number" && (
                      <span className="themed-pill warn" style={{ marginLeft: 8, fontSize: 10 }}>
                        notice
                      </span>
                    )}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
                    {ROLE_LABELS[e.role]} L{e.level} · {money(e.salary, { short: true })}/yr · skill {Math.round(e.skill)} · morale {Math.round(e.morale)}
                  </div>
                  <MoraleBar morale={e.morale} />
                </div>
                {e.role !== "founder" && (
                  <button onClick={() => fire(e.id)} style={{ fontSize: 11, color: "var(--color-bad)", textDecoration: "underline" }}>Let go</button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2 className="sec-head" style={{ marginTop: 18 }}>Candidates <span className="tag">this week</span></h2>
          <p style={{ color: "var(--color-ink-2)", fontSize: 12, margin: "0 4px 10px" }}>
            Pool refreshes each week. Hiring costs ~1 week's salary in onboarding.
          </p>
          <div className="themed-card">
            {candidates.map((c, i) => (
              <CandidateRow key={c.id} c={c} i={i} cash={state.finance.cash} onHire={() => hire(c)} />
            ))}
          </div>
        </>
      )}

      <AdvanceButton />
      <TabBar />
    </main>
  );
}

function MoraleBar({ morale }: { morale: number }) {
  const color = morale > 70 ? "var(--color-good)" : morale > 45 ? "var(--color-warn)" : "var(--color-bad)";
  return (
    <div style={{
      marginTop: 6, height: 6, background: "var(--color-soft)",
      border: "2px solid var(--color-line)", borderRadius: 4, overflow: "hidden", maxWidth: 180,
    }}>
      <div style={{ height: "100%", width: `${Math.max(4, morale)}%`, background: color }} />
    </div>
  );
}

function NoticeRow({
  e, week, cash, onCounter, onBonus, onAccept, isFirst,
}: {
  e: Employee; week: number; cash: number;
  onCounter: () => void; onBonus: () => void; onAccept: () => void;
  isFirst: boolean; _hasMore: boolean;
}) {
  const weeksLeft = Math.max(0, (e.noticeEndsWeek ?? week) - week);
  const reasonLabel = e.noticeReason === "poached" ? "Rival made a competing offer"
                    : e.noticeReason === "offer"   ? "Got an outside offer"
                    :                                 "Resigned";
  const counterCost = counterOfferCost(e);
  const bonusCost = retentionBonusCost(e);
  const canCounter = cash >= counterCost;
  const canBonus = cash >= bonusCost;
  return (
    <div style={{
      padding: "12px 14px",
      borderTop: isFirst ? 0 : "2px dashed var(--color-line)",
      display: "grid", gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{e.name}</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
            {ROLE_LABELS[e.role]} L{e.level} · {reasonLabel} · {weeksLeft}w left
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <button
          onClick={onCounter}
          disabled={!canCounter}
          className="themed-pill"
          style={{
            background: canCounter ? "var(--color-accent)" : "var(--color-muted)",
            color: "#fff",
            padding: "8px 10px", fontSize: 12, fontWeight: 700,
            opacity: canCounter ? 1 : 0.6,
            cursor: canCounter ? "pointer" : "not-allowed",
          }}
        >Counter (+{money(counterCost, { short: true })}/yr)</button>
        <button
          onClick={onBonus}
          disabled={!canBonus}
          className="themed-pill"
          style={{
            background: canBonus ? "var(--color-good)" : "var(--color-muted)",
            color: "#fff",
            padding: "8px 10px", fontSize: 12, fontWeight: 700,
            opacity: canBonus ? 1 : 0.6,
            cursor: canBonus ? "pointer" : "not-allowed",
          }}
        >Bonus ({money(bonusCost, { short: true })})</button>
      </div>
      <button onClick={onAccept} style={{ fontSize: 11, color: "var(--color-bad)", textDecoration: "underline", textAlign: "left" }}>
        Accept their resignation now
      </button>
    </div>
  );
}

function CandidateRow({ c, i, cash, onHire }: { c: Employee; i: number; cash: number; onHire: () => void }) {
  const onboarding = Math.round(c.salary / 52);
  const canAfford = cash >= onboarding;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 10,
      padding: "12px 14px", alignItems: "center",
      borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%", border: "var(--border-card)",
        display: "grid", placeItems: "center", fontSize: 20, background: "var(--color-surface-2)",
      }}>{ROLE_GLYPH[c.role] ?? "👤"}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
          {ROLE_LABELS[c.role]} L{c.level} · {money(c.salary, { short: true })}/yr · skill {Math.round(c.skill)}
        </div>
      </div>
      <button onClick={onHire} disabled={!canAfford} className="themed-pill"
        style={{ background: canAfford ? "var(--color-good)" : "var(--color-muted)", cursor: canAfford ? "pointer" : "not-allowed", opacity: canAfford ? 1 : 0.6 }}
      >{canAfford ? "Hire" : `Need ${money(onboarding, { short: true })}`}</button>
    </div>
  );
}
