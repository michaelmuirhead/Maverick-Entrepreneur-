"use client";
import Link from "next/link";
import { useGame } from "@/game/store";
import { GENRE_INFO, SCOPE_INFO } from "@/game/studio/genres";
import {
  estimatedWeeksToShip, hasLaunched, isInDev, isReadyToShip,
  qualityForecast,
} from "@/game/studio/games";
import type { Game } from "@/game/studio/types";

/**
 * Studio HQ games card — compact list of the studio's active slate.
 * Shows in-dev projects first (with stage/progress/hype), then any launched
 * titles on their live-service tail. Tapping a row deep-links to the game's
 * detail page. Matches the visual weight of the SaaS ProductList.
 */
export function StudioGameList({ limit = 4 }: { limit?: number }) {
  const games = useGame(s => s.activeStudioVenture?.games ?? []);
  if (games.length === 0) {
    return (
      <div className="themed-card" style={{ padding: 14, color: "var(--color-ink-2)", fontSize: 13 }}>
        No games on the slate. <Link href="/studio/games" style={{ color: "var(--color-accent)", fontWeight: 700 }}>Pitch your first title →</Link>
      </div>
    );
  }

  // Sort: in-dev first (sorted by closest-to-ship), then launched (most recent launch).
  const sorted = [...games].sort((a, b) => {
    const aDev = isInDev(a);
    const bDev = isInDev(b);
    if (aDev && !bDev) return -1;
    if (!aDev && bDev) return 1;
    if (aDev && bDev) return estimatedWeeksToShip(a) - estimatedWeeksToShip(b);
    // both launched — most recent launch first
    return (b.launched?.week ?? 0) - (a.launched?.week ?? 0);
  }).slice(0, limit);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {sorted.map(g => <GameRow key={g.id} g={g} />)}
      {games.length > limit && (
        <Link href="/studio/games" className="themed-card" style={{
          padding: "10px 14px", textAlign: "center", fontSize: 13,
          color: "var(--color-accent)", fontWeight: 700,
        }}>
          View all {games.length} games →
        </Link>
      )}
    </div>
  );
}

function GameRow({ g }: { g: Game }) {
  const genre = GENRE_INFO[g.genre];
  const scope = SCOPE_INFO[g.scope];
  const inDev = isInDev(g);
  const launched = hasLaunched(g);
  const forecast = inDev ? qualityForecast(g) : null;
  const weeksLeft = inDev ? estimatedWeeksToShip(g) : 0;
  const ready = inDev && isReadyToShip(g);

  return (
    <Link href={`/studio/games/${g.id}`} className="themed-card" style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10,
      padding: "10px 12px", textDecoration: "none",
      borderColor: ready ? "var(--color-accent)" : undefined,
    }}>
      <div style={{
        width: 40, height: 40, flex: "none", borderRadius: 8, border: "var(--border-card)",
        background: "var(--color-surface-2)", display: "grid", placeItems: "center", fontSize: 18,
      }}>
        {launched ? "🚀" : g.crunchActive ? "🔥" : "🎮"}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title}</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600, letterSpacing: ".04em" }}>
            {genre.label} · {scope.label}
          </div>
        </div>
        {inDev && (
          <>
            <ProgressBar value={g.devProgress} />
            <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600, marginTop: 3, letterSpacing: ".04em" }}>
              {g.stage} · {Math.round(g.devProgress * 100)}% · hype {Math.round(g.hype)}
              {ready ? " · READY" : weeksLeft < 1000 ? ` · ~${weeksLeft}w to ship` : ""}
            </div>
            {forecast && (
              <div style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600, marginTop: 2 }}>
                Forecast: {forecast.descriptor} ({forecast.score})
                {g.reviewBomb ? " · 🚨 review bomb" : ""}
              </div>
            )}
          </>
        )}
        {launched && g.launched && (
          <>
            <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600, marginTop: 3, letterSpacing: ".04em" }}>
              launched · Metacritic {g.launched.reviewScore} · {g.launched.totalSold.toLocaleString()} sold
              {g.reviewBomb ? " · 🚨 bombed" : ""}
            </div>
            {g.liveService && (
              <div style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600, marginTop: 2 }}>
                MAU {Math.round(g.liveService.mau).toLocaleString()} · peak {Math.round(g.liveService.peakMau).toLocaleString()}
              </div>
            )}
          </>
        )}
      </div>
      <span className="mono" style={{ fontSize: 16, color: "var(--color-ink-2)", alignSelf: "center" }}>›</span>
    </Link>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div style={{
      marginTop: 6, height: 6, borderRadius: 3,
      background: "var(--color-surface-2)",
      border: "1px solid var(--color-line)", overflow: "hidden",
    }}>
      <div style={{
        height: "100%", width: `${pct * 100}%`,
        background: "var(--color-accent)",
      }} />
    </div>
  );
}
