"use client";
import { useGame } from "@/game/store";
import { money } from "@/lib/format";

/**
 * WeekRecap — inline panel that summarizes the most recent tick's headline deltas
 * (cash/MRR/users). Lives under "This week at the office" so the player never has
 * to dismiss a modal. When no events fired this week, renders a short narrative line.
 */
export function WeekRecap() {
  const state = useGame(s => s.state);
  if (!state) return null;
  const deltas = state.lastTickDeltas;
  // On a brand-new game (week 0) there's no last tick — show nothing.
  if (!deltas || deltas.week !== state.week) return null;

  const thisWeekEvents = state.events.filter(e => e.week === state.week);
  const quiet = thisWeekEvents.length === 0;

  return (
    <div
      className="themed-card"
      style={{
        padding: 12,
        marginBottom: 8,
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
        }}
      >
        <DeltaPill label="Cash" value={deltas.cash} />
        <DeltaPill label="MRR" value={deltas.mrr} />
        <DeltaPill label="Users" value={deltas.users} isCount />
      </div>
      {quiet && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--color-ink-2)",
            lineHeight: 1.4,
          }}
        >
          A quiet week. No launches, no fires, no funding. Progress is a slow accumulation.
        </p>
      )}
    </div>
  );
}

function DeltaPill({ label, value, isCount }: { label: string; value: number; isCount?: boolean }) {
  const positive = value > 0;
  const negative = value < 0;
  const color = positive ? "var(--color-good)" : negative ? "var(--color-bad)" : "var(--color-muted)";
  const display = isCount
    ? `${positive ? "+" : ""}${Math.round(value)}`
    : money(value, { sign: true, short: true });
  return (
    <div
      style={{
        padding: "8px 10px",
        border: "var(--border-card)",
        borderRadius: "var(--radius-card)",
        background: "var(--color-surface-2)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--color-ink-2)",
          fontWeight: 600,
          letterSpacing: ".06em",
          textTransform: "uppercase",
        }}
      >{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>
        {display}
      </div>
    </div>
  );
}
