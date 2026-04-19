"use client";
import { useGame } from "@/game/store";
import { nextMilestone } from "@/game/milestones";

const TONE: Record<string, { bg: string; bar: string; tag: string; label: string }> = {
  offer: {
    bg: "var(--color-surface-2)",
    bar: "var(--color-good)",
    tag: "var(--color-good)",
    label: "Offer",
  },
  warn: {
    bg: "var(--color-surface-2)",
    bar: "var(--color-bad)",
    tag: "var(--color-bad)",
    label: "Warning",
  },
  goal: {
    bg: "var(--color-surface-2)",
    bar: "var(--color-accent)",
    tag: "var(--color-accent)",
    label: "Next up",
  },
};

/**
 * NextMilestone — a single-card "what to do next" nudge on the HQ dashboard.
 * Reads from game state so the pointer always reflects the current situation:
 * low runway beats funding offer beats first launch beats MRR climb.
 */
export function NextMilestone() {
  const state = useGame(s => s.state);
  if (!state || state.gameOver) return null;

  const m = nextMilestone(state);
  const tone = TONE[m.kind];
  const pct = Math.max(0, Math.min(1, m.progress));

  return (
    <div
      className="themed-card"
      style={{
        padding: "12px 14px",
        marginTop: 14,
        background: tone.bg,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "var(--font-display)" }}>
          {m.title}
        </div>
        <span
          className="mono"
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: ".08em",
            textTransform: "uppercase", color: tone.tag,
          }}
        >
          {tone.label}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--color-ink-2)", lineHeight: 1.4 }}>
        {m.hint}
      </div>
      {m.progress >= 0 && (
        <div
          aria-hidden
          style={{
            height: 6, borderRadius: 999, background: "var(--color-line)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.round(pct * 100)}%`,
              height: "100%",
              background: tone.bar,
              transition: "width 300ms ease",
            }}
          />
        </div>
      )}
    </div>
  );
}
