"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "@/game/store";
import { StudioHqHeader } from "@/components/StudioHqHeader";
import { StudioKpiGrid } from "@/components/StudioKpiGrid";
import { StudioGameList } from "@/components/StudioGameList";
import { StudioTrendStrip } from "@/components/StudioTrendStrip";
import { StudioOffersCard } from "@/components/StudioOffersCard";
import { StudioEventLog } from "@/components/StudioEventLog";
import { StudioTabBar } from "@/components/StudioTabBar";
import { StudioAdvanceButton } from "@/components/StudioAdvanceButton";
import { capacityDiagnostics } from "@/game/studio/crunch";

/**
 * Studio HQ dashboard — mirror of `/` for the Game Studio vertical.
 *
 * Routing rules:
 *   - If no entrepreneur at all, send to /new-game (fresh player).
 *   - If active venture is SaaS, send to / (the SaaS HQ). This lets the
 *     player hit /studio from anywhere and automatically get bounced over
 *     if their active venture isn't a studio.
 *   - Otherwise, render the studio dashboard.
 */
export default function StudioHQPage() {
  const router = useRouter();
  const { entrepreneur, activeStudioVenture, state, hydrated, hydrate } = useGame();

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  useEffect(() => {
    if (!hydrated) return;
    if (!entrepreneur) { router.replace("/new-game"); return; }
    // Active venture is SaaS-shaped → kick back to /
    if (state && !activeStudioVenture) router.replace("/");
  }, [hydrated, entrepreneur, activeStudioVenture, state, router]);

  if (!activeStudioVenture) {
    return (
      <main className="app-shell" style={{ display: "grid", placeItems: "center", paddingTop: 80 }}>
        <div style={{ color: "var(--color-ink-2)" }}>Loading…</div>
      </main>
    );
  }

  const s = activeStudioVenture;
  const cap = capacityDiagnostics(s.games, s.employees);
  const weeklyEventCount = s.events.filter(e => e.week === s.week).length;

  return (
    <main className="app-shell">
      <StudioHqHeader />
      <StudioKpiGrid />
      <StudioTrendStrip />

      {cap.overCommitted && (
        <div className="themed-card" style={{ padding: "10px 14px", marginTop: 8, borderColor: "var(--color-warn)" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--color-warn)" }}>⚠️ {cap.blurb}</div>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 3 }}>
            Hire more engineers, cancel a project, or accept that something will ship broken.
          </div>
        </div>
      )}

      <StudioOffersCard />

      <Link href="/studio/games" className="themed-card" style={{
        display: "grid", gridTemplateColumns: "32px 1fr auto", alignItems: "center", gap: 10,
        padding: "10px 14px", marginTop: 12, textDecoration: "none",
      }}>
        <div style={{ fontSize: 22, lineHeight: 1 }}>🎮</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Slate</div>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 1 }}>
            {cap.inDevCount} in dev · {s.games.filter(g => g.launched).length} launched · {cap.crunchingCount} crunching
          </div>
        </div>
        <span className="mono" style={{ fontSize: 14, color: "var(--color-ink-2)" }}>›</span>
      </Link>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Active projects <span className="tag">{s.games.length}</span></h2>
      <StudioGameList limit={4} />

      <h2 className="sec-head">This week at the studio <span className="tag">{weeklyEventCount}</span></h2>
      <StudioEventLog limit={8} />

      {s.gameOver && (
        <div className="themed-card" style={{ padding: 16, marginTop: 18, borderColor: "var(--color-bad)" }}>
          <div style={{ fontWeight: 700, color: "var(--color-bad)", fontSize: 16 }}>Game over: {s.gameOver.reason}</div>
          <div style={{ marginTop: 6, color: "var(--color-ink-2)" }}>{s.gameOver.narrative}</div>
        </div>
      )}

      <StudioAdvanceButton />
      <StudioTabBar />
    </main>
  );
}
