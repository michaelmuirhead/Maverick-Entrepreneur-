"use client";
import { useGame } from "@/game/store";
import { money } from "@/lib/format";
import { capacityDiagnostics } from "@/game/studio/crunch";
import { isInDev, hasLaunched } from "@/game/studio/games";

/**
 * Studio-flavored KPI strip. Mirrors the SaaS KpiGrid — four square cards of
 * cash / runway-ish / revenue-ish / team — but substitutes game-shaped
 * numbers: active projects, launched titles, and weekly burn instead of MRR.
 */
export function StudioKpiGrid() {
  const s = useGame(st => st.activeStudioVenture);
  if (!s) return null;

  // Burn = average of the last few weeks if we have a history, else 0.
  const burnHistory = s.finance.weeklyBurnHistory ?? [];
  const recentBurn = burnHistory.length > 0
    ? burnHistory.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, burnHistory.length)
    : 0;
  // Runway in months (burn is per week).
  const runwayMo = recentBurn > 0 ? (s.finance.cash / recentBurn) / 4.33 : Infinity;
  const runwayLabel = !isFinite(runwayMo) ? "∞" : `${runwayMo.toFixed(1)} mo`;

  const inDev = s.games.filter(isInDev).length;
  const launched = s.games.filter(hasLaunched).length;
  const cap = capacityDiagnostics(s.games, s.employees);

  const hiring = s.employees.filter(e => e.hiredWeek === s.week).length;

  const cells: { icon: string; lbl: string; val: string; sub?: string; bad?: boolean }[] = [
    { icon: "💰", lbl: "Cash",    val: money(s.finance.cash),   sub: `~${money(recentBurn, { short: true })}/wk burn` },
    { icon: "⏱️", lbl: "Runway",  val: runwayLabel,             bad: isFinite(runwayMo) && runwayMo < 6 },
    { icon: "🎮", lbl: "Projects",val: `${inDev} in dev`,       sub: `${launched} launched · ${cap.crunchingCount} crunching` },
    { icon: "❤️", lbl: "Team",    val: `${s.employees.length}${hiring ? ` · +${hiring}` : ""}`, bad: cap.overCommitted, sub: cap.overCommitted ? "over-committed" : undefined },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
      {cells.map(c => (
        <div key={c.lbl} className="themed-card" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, flex: "none", borderRadius: 10, border: "var(--border-card)",
            display: "grid", placeItems: "center", fontSize: 18,
            background: "var(--color-surface-2)",
          }}>{c.icon}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>{c.lbl}</div>
            <div className="num" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, fontFamily: "var(--font-mono)", color: c.bad ? "var(--color-bad)" : undefined }}>{c.val}</div>
            {c.sub && (
              <div style={{ fontSize: 10, color: c.bad ? "var(--color-bad)" : "var(--color-ink-2)", fontWeight: 600, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
