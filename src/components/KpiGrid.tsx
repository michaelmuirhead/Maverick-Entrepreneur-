"use client";
import { useGame } from "@/game/store";
import { getHeadlineStats } from "@/game/tick";
import { money } from "@/lib/format";

export function KpiGrid() {
  const s = useGame(st => st.state);
  if (!s) return null;
  const stats = getHeadlineStats(s);
  const hiring = s.employees.filter(e => e.hiredWeek === s.week).length;

  const cells: { icon: string; lbl: string; val: string; delta?: string; bad?: boolean }[] = [
    { icon: "💰", lbl: "Cash",   val: money(s.finance.cash) },
    { icon: "⏱️", lbl: "Runway", val: `${stats.runwayMo.toFixed(1)} mo`, bad: stats.runwayMo < 6 },
    { icon: "📈", lbl: "MRR",    val: money(stats.mrr) },
    { icon: "❤️", lbl: "Team",   val: `${s.employees.length}${hiring ? ` · +${hiring}` : ""}` },
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
          <div>
            <div style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>{c.lbl}</div>
            <div className="num" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, fontFamily: "var(--font-mono)" }}>{c.val}</div>
            {c.delta && <div style={{ fontSize: 11, color: c.bad ? "var(--color-bad)" : "var(--color-good)", fontWeight: 700, marginTop: 3 }}>{c.delta}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
