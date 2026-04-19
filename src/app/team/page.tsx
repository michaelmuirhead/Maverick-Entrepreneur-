"use client";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { generateCandidates } from "@/game/team";
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
  const hydrate = useGame(s => s.hydrate);
  const hydrated = useGame(s => s.hydrated);
  const [tab, setTab] = useState<"roster" | "hire">("roster");

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);

  // Candidates are derived from the game seed + week so they're stable across re-renders.
  const candidates = useMemo(() => {
    if (!state) return [];
    const rng = makeRng(`${state.seed}:hire-pool:${state.week}`);
    return generateCandidates(rng, 6, state.week);
  }, [state?.seed, state?.week]);

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
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{e.name}</div>
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
