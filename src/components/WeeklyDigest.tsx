"use client";
import { GameEvent } from "@/game/types";
import { money } from "@/lib/format";

const TONE: Record<string, string> = {
  good: "var(--color-good)",
  warn: "var(--color-warn)",
  bad:  "var(--color-bad)",
  info: "var(--color-ink-2)",
};

interface Props {
  week: number;
  events: GameEvent[];
  cashDelta: number;
  mrrDelta: number;
  userDelta: number;
  onClose: () => void;
}

/**
 * WeeklyDigest — shown after Advance Week. Surfaces the events that actually
 * matter from this tick, plus a headline of what moved. Dismiss to continue.
 */
export function WeeklyDigest({ week, events, cashDelta, mrrDelta, userDelta, onClose }: Props) {
  // Severity ranking: bad > warn > good > info. Within severity, keep chronological order.
  const severityRank: Record<string, number> = { bad: 0, warn: 1, good: 2, info: 3 };
  const ranked = [...events].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 60,
        display: "grid", placeItems: "end center", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="themed-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: 16, maxWidth: 420, width: "100%",
          background: "var(--color-surface)",
          maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 20 }}>
            Week {week} digest
          </h2>
          <button
            onClick={onClose}
            aria-label="Close digest"
            style={{ fontSize: 18, fontWeight: 700, color: "var(--color-ink-2)", padding: 4 }}
          >✕</button>
        </div>

        <div
          style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12,
          }}
        >
          <DeltaPill label="Cash" value={cashDelta} />
          <DeltaPill label="MRR" value={mrrDelta} />
          <DeltaPill label="Users" value={userDelta} isCount />
        </div>

        {ranked.length === 0 ? (
          <p style={{ marginTop: 16, fontSize: 13, color: "var(--color-ink-2)" }}>
            A quiet week. No launches, no fires, no funding. Progress is a slow accumulation.
          </p>
        ) : (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {ranked.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "grid", gridTemplateColumns: "12px 1fr auto", gap: 10,
                  padding: "10px 12px",
                  border: "var(--border-card)",
                  borderRadius: "var(--radius-card)",
                  background: "var(--color-surface-2)",
                  alignItems: "start",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: TONE[e.severity], marginTop: 4, display: "inline-block",
                  }}
                />
                <div style={{ fontSize: 13, lineHeight: 1.35 }}>{e.message}</div>
                {e.amount !== undefined && (
                  <span
                    className="mono"
                    style={{
                      fontWeight: 700, fontSize: 12,
                      color: e.severity === "bad" ? "var(--color-bad)" : "var(--color-good)",
                    }}
                  >
                    {money(e.amount, { sign: true, short: true })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="themed-card"
          style={{
            width: "100%", padding: 12, marginTop: 16, fontWeight: 700, fontSize: 15,
            background: "var(--color-accent)", color: "#fff",
            borderColor: "var(--color-accent)",
          }}
        >
          Back to work
        </button>
      </div>
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
          fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600,
          letterSpacing: ".06em", textTransform: "uppercase",
        }}
      >{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>
        {display}
      </div>
    </div>
  );
}
