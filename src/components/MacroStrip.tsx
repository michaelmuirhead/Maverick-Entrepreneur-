"use client";
import { useGame } from "@/game/store";
import { economyDescription, economyLabel } from "@/game/economy";
import { trendIntensity } from "@/game/market";

/**
 * MacroStrip — tiny always-visible readout of current macro-economic phase and the
 * active tech trends. Sits between KPIs and the MRR chart on HQ so the player always
 * knows what world state is shaping their pipeline this week.
 */
export function MacroStrip() {
  const state = useGame(s => s.state);
  if (!state) return null;
  const econ = state.economy;
  const trends = state.trends ?? [];

  const econColor = econ.phase === "boom"
    ? "var(--color-good)"
    : econ.phase === "recession"
    ? "var(--color-bad)"
    : "var(--color-ink-2)";

  return (
    <div className="themed-card" style={{ padding: "10px 12px", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 26, height: 26, flex: "none", borderRadius: 8,
          border: "var(--border-card)", display: "grid", placeItems: "center",
          background: "var(--color-surface-2)", fontSize: 14,
        }}>
          {econ.phase === "boom" ? "🚀" : econ.phase === "recession" ? "🧊" : "⚖️"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600,
            letterSpacing: ".08em", textTransform: "uppercase",
          }}>Macro</div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: econColor, marginTop: 1 }}>
            {economyLabel(econ.phase)} · intensity {Math.round(econ.intensity * 100)}%
          </div>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 3, lineHeight: 1.35 }}>
            {economyDescription(econ)}
          </div>
        </div>
      </div>
      {trends.length > 0 && (
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          <div style={{
            fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600,
            letterSpacing: ".08em", textTransform: "uppercase",
          }}>Active trends</div>
          {trends.map(t => {
            const i = trendIntensity(t, state.week);
            const good = t.demandMultiplier >= 1;
            const effective = 1 + (t.demandMultiplier - 1) * i;
            return (
              <div key={t.kind} style={{
                padding: "6px 8px", border: "var(--border-card)", borderRadius: 6,
                background: "var(--color-surface-2)",
                display: "flex", alignItems: "center", gap: 8, fontSize: 12,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: good ? "var(--color-good)" : "var(--color-bad)",
                  flex: "none",
                }} />
                <span style={{ flex: 1, fontWeight: 600 }}>{t.label}</span>
                <span className="mono" style={{ color: "var(--color-ink-2)" }}>
                  {effective >= 1 ? "+" : ""}{Math.round((effective - 1) * 100)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
