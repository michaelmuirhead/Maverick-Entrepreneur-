"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/game/store";
import { StudioTabBar } from "@/components/StudioTabBar";
import { StudioAdvanceButton } from "@/components/StudioAdvanceButton";
import { generateCandidates } from "@/game/team";
import { ROLE_LABELS, Employee, EmployeeRole } from "@/game/types";
import { makeRng } from "@/game/rng";
import { money } from "@/lib/format";
import { busyEmployeeIds } from "@/game/studio/contracts";

/**
 * Studio Team page. Mirrors the SaaS /team page but scoped to the active studio
 * venture. Drops the poach/counter/notice UX (studio doesn't have that depth yet)
 * in favor of a cleaner roster + hire flow. Sales candidates are filtered out of
 * the pool — studios don't run a sales motion; their distribution is platform-
 * mediated.
 */

const ROLE_GLYPH: Record<string, string> = {
  founder: "⭐", engineer: "👩‍💻", designer: "🎨", pm: "📋",
  marketing: "📣", ops: "⚙️", sales: "📞",
};

/** Roles the studio hire pool shows. Sales is excluded — studios sell through
 *  storefronts, not an outbound sales team. */
const STUDIO_ROLES: EmployeeRole[] = ["engineer", "designer", "pm", "marketing", "ops"];

export default function StudioTeamPage() {
  const router = useRouter();
  const { entrepreneur, activeStudioVenture, state, hydrated, hydrate } = useGame();
  const hire = useGame(s => s.hireStudioCandidate);
  const fire = useGame(s => s.fireStudioEmployee);
  const [tab, setTab] = useState<"roster" | "hire">("roster");

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  useEffect(() => {
    if (!hydrated) return;
    if (!entrepreneur) { router.replace("/new-game"); return; }
    if (state && !activeStudioVenture) router.replace("/team");
  }, [hydrated, entrepreneur, activeStudioVenture, state, router]);

  // Candidates derived deterministically from seed + week so re-renders don't shuffle
  // the pool. Filter out anyone already hired, and drop sales roles (studio-inappropriate).
  const candidates = useMemo(() => {
    if (!activeStudioVenture) return [];
    const rng = makeRng(`${activeStudioVenture.seed}:studio-hire-pool:${activeStudioVenture.week}`);
    const pool = generateCandidates(rng, 8, activeStudioVenture.week);
    const hiredIds = new Set(activeStudioVenture.employees.map(e => e.id));
    return pool
      .filter(c => STUDIO_ROLES.includes(c.role))
      .filter(c => !hiredIds.has(c.id))
      .slice(0, 6);
  }, [activeStudioVenture?.seed, activeStudioVenture?.week, activeStudioVenture?.employees]);

  if (!activeStudioVenture) {
    return <main className="app-shell" style={{ padding: 40, color: "var(--color-ink-2)" }}>Loading…</main>;
  }
  const s = activeStudioVenture;

  // Per-employee workload: how many in-dev games they're assigned to, plus any
  // active contract staffing. Gives the roster a "what is this person actually
  // doing" column that matches the studio's mental model.
  const contractBusy = busyEmployeeIds(s.contracts ?? []);
  const gameAssignmentsById = new Map<string, number>();
  for (const g of s.games) {
    if (g.stage === "released" || g.stage === "sunset") continue;
    for (const id of g.assignedEngineers) {
      gameAssignmentsById.set(id, (gameAssignmentsById.get(id) ?? 0) + 1);
    }
  }

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Team</h1>
      <div style={{ fontSize: 12, color: "var(--color-ink-2)", margin: "0 4px 8px" }}>
        {s.company.name} · {s.employees.length} on staff
      </div>

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
          <h2 className="sec-head" style={{ marginTop: 18 }}>Your people <span className="tag">{s.employees.length}</span></h2>
          <div className="themed-card">
            {s.employees.map((e, i) => {
              const onContract = contractBusy.has(e.id);
              const gameCount = gameAssignmentsById.get(e.id) ?? 0;
              const busyBlurb = onContract
                ? "on a contract"
                : gameCount > 0
                  ? `on ${gameCount} game${gameCount > 1 ? "s" : ""}`
                  : e.role === "founder" ? "wearing every hat" : "available";
              return (
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
                    <div style={{ fontSize: 10, color: onContract ? "var(--color-warn)" : "var(--color-ink-2)", marginTop: 2, fontWeight: 600 }}>
                      {busyBlurb}
                    </div>
                    <MoraleBar morale={e.morale} />
                  </div>
                  {e.role !== "founder" && (
                    <button onClick={() => fire(e.id)} style={{
                      fontSize: 11, color: "var(--color-bad)", textDecoration: "underline",
                      background: "transparent", border: "none", cursor: "pointer",
                    }}>Let go</button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <h2 className="sec-head" style={{ marginTop: 18 }}>Candidates <span className="tag">this week</span></h2>
          <p style={{ color: "var(--color-ink-2)", fontSize: 12, margin: "0 4px 10px" }}>
            Pool refreshes each week. Hiring costs ~1 week's salary as onboarding. Studios don't run outbound sales — no sales roles in the pool.
          </p>
          <div className="themed-card">
            {candidates.length === 0 ? (
              <div style={{ padding: 14, color: "var(--color-ink-2)", fontSize: 12 }}>
                Nobody worth hiring this week. Try again after the next tick.
              </div>
            ) : candidates.map((c, i) => (
              <CandidateRow key={c.id} c={c} i={i} cash={s.finance.cash} onHire={() => hire(c)} />
            ))}
          </div>
        </>
      )}

      <StudioAdvanceButton />
      <StudioTabBar />
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
        style={{
          background: canAfford ? "var(--color-good)" : "var(--color-muted)",
          color: "#fff", cursor: canAfford ? "pointer" : "not-allowed",
          opacity: canAfford ? 1 : 0.6, padding: "6px 10px", fontSize: 11, fontWeight: 700,
          border: "none",
        }}
      >{canAfford ? "Hire" : `Need ${money(onboarding, { short: true })}`}</button>
    </div>
  );
}
