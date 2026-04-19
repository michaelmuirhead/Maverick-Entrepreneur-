"use client";
import { useGame } from "@/game/store";

/**
 * AdvanceButton — the one button that actually moves time forward.
 * The weekly summary now surfaces inline via <WeekRecap /> on the HQ,
 * so there's no modal interruption here — just advance.
 */
export function AdvanceButton() {
  const advance = useGame(s => s.advance);
  const week = useGame(s => s.state?.week ?? 0);
  const gameOver = useGame(s => !!s.state?.gameOver);

  return (
    <button
      onClick={advance}
      disabled={gameOver}
      className="fixed-stack"
      style={{
        bottom: `calc(80px + var(--safe-bottom))`,
        background: "var(--color-accent)",
        color: "#fff",
        border: "var(--border-card)",
        borderRadius: "var(--radius-card)",
        padding: "14px 18px",
        fontWeight: 700,
        fontSize: 16,
        boxShadow: "var(--shadow-card)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        opacity: gameOver ? 0.4 : 1,
      }}
    >
      <span>Advance to Week {week + 1}</span>
      <span aria-hidden>▶</span>
    </button>
  );
}
