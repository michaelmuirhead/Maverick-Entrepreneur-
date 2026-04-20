"use client";
import Link from "next/link";
import { useGame } from "@/game/store";
import { GENRE_INFO } from "@/game/studio/genres";
import { popularityDescriptor, trendRankings } from "@/game/studio/platforms";

/**
 * Studio HQ genre-trend strip. Mirrors the SaaS MacroStrip footprint — a
 * single low-ink card showing the three hottest genres and the three
 * cooling ones right now. Players use this to time their pitches.
 */
export function StudioTrendStrip() {
  const trends = useGame(s => s.activeStudioVenture?.genreTrends ?? []);
  if (trends.length === 0) return null;
  const { hot, cold } = trendRankings(trends);

  return (
    <Link href="/studio/trends" className="themed-card" style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
      padding: "10px 14px", textDecoration: "none",
    }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-good)", letterSpacing: ".08em", textTransform: "uppercase" }}>Hot genres</div>
        <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
          {hot.map(t => (
            <div key={t.genre} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{GENRE_INFO[t.genre].label}</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600 }}>{popularityDescriptor(t.popularity)}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-ink-2)", letterSpacing: ".08em", textTransform: "uppercase" }}>Cooling</div>
        <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
          {cold.map(t => (
            <div key={t.genre} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{GENRE_INFO[t.genre].label}</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600 }}>{popularityDescriptor(t.popularity)}</span>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
