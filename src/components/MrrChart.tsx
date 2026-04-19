"use client";
import { useGame } from "@/game/store";
import { money } from "@/lib/format";

export function MrrChart() {
  const s = useGame(st => st.state);
  if (!s) return null;
  const data = s.finance.weeklyRevenueHistory.slice(-12);
  const max = Math.max(1, ...data, 100);
  const w = 400, h = 90;
  const pts = data.length === 0
    ? `0,${h-4} ${w},${h-4}`
    : data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - 4 - (v / max) * (h - 12)}`).join(" ");
  const last = data[data.length - 1] ?? 0;
  const prev = data[data.length - 2] ?? last;
  const delta = prev > 0 ? ((last - prev) / prev) * 100 : 0;

  return (
    <div className="themed-card" style={{ padding: "10px 12px", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
        <div className="num" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{money(last)}</div>
        <span className="themed-pill" style={{
          background: delta >= 0 ? "var(--color-good)" : "var(--color-bad)",
        }}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}%</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
        <g stroke="var(--color-line)" strokeOpacity="0.15" strokeDasharray="2 4">
          <line x1={0} y1={h*0.25} x2={w} y2={h*0.25}/>
          <line x1={0} y1={h*0.5}  x2={w} y2={h*0.5}/>
          <line x1={0} y1={h*0.75} x2={w} y2={h*0.75}/>
        </g>
        <polyline points={pts} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
