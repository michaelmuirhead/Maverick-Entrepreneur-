"use client";
import { useState } from "react";
import { useGame } from "@/game/store";
import { WeeklyDigest } from "./WeeklyDigest";
import { GameEvent } from "@/game/types";

/**
 * AdvanceButton — the one button that actually moves time forward.
 * On click: snapshots pre-tick headline stats, advances the simulation, then
 * pops the WeeklyDigest so the player sees what changed this week.
 */
export function AdvanceButton() {
  const advance = useGame(s => s.advance);
  const week = useGame(s => s.state?.week ?? 0);
  const gameOver = useGame(s => !!s.state?.gameOver);

  const [digest, setDigest] = useState<null | {
    week: number;
    events: GameEvent[];
    cashDelta: number;
    mrrDelta: number;
    userDelta: number;
  }>(null);

  const handleClick = () => {
    const prev = useGame.getState().state;
    if (!prev) return;
    const prevCash = prev.finance.cash;
    const prevMrr = prev.finance.mrr;
    const prevUsers = prev.products.reduce((s, p) => s + p.users, 0);
    const prevWeek = prev.week;

    advance();

    const next = useGame.getState().state;
    if (!next) return;
    const nextUsers = next.products.reduce((s, p) => s + p.users, 0);

    // Events emitted this tick carry week === next.week (> prevWeek).
    const thisTickEvents = next.events.filter(e => e.week > prevWeek);

    setDigest({
      week: next.week,
      events: thisTickEvents,
      cashDelta: next.finance.cash - prevCash,
      mrrDelta: next.finance.mrr - prevMrr,
      userDelta: nextUsers - prevUsers,
    });
  };

  return (
    <>
      <button
        onClick={handleClick}
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
      {digest && (
        <WeeklyDigest
          week={digest.week}
          events={digest.events}
          cashDelta={digest.cashDelta}
          mrrDelta={digest.mrrDelta}
          userDelta={digest.userDelta}
          onClose={() => setDigest(null)}
        />
      )}
    </>
  );
}
