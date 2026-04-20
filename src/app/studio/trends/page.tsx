"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/game/store";
import { StudioTabBar } from "@/components/StudioTabBar";
import { StudioAdvanceButton } from "@/components/StudioAdvanceButton";
import { GENRE_INFO } from "@/game/studio/genres";
import { popularityDescriptor } from "@/game/studio/platforms";
import type { GameGenre, GenreTrend } from "@/game/studio/types";
import { isInDev, hasLaunched } from "@/game/studio/games";

/**
 * Studio Trends page. The HQ trend strip shows a 3+3 highlight reel; this page
 * is the full board — every genre ranked by popularity, with drift direction,
 * regime stability, and how many of your own games are riding each wave.
 *
 * Players use this to time pitches: "RPGs are hot and still climbing, my
 * narrative game is cooling, the mobile-casual regime is 40 weeks old (due
 * for a flip)." The goal is to let a player scan the industry in ten seconds.
 */

/** Background color for the descriptor pill, keyed by popularity tier. */
const DESCRIPTOR_COLOR: Record<ReturnType<typeof popularityDescriptor>, string> = {
  "on-fire": "var(--color-good)",
  hot: "var(--color-good)",
  neutral: "var(--color-ink-2)",
  quiet: "var(--color-warn)",
  cooling: "var(--color-bad)",
};

/** Pretty-print a drift value as an arrow + signed delta. */
function driftGlyph(drift: number): { glyph: string; color: string } {
  if (drift > 0.012) return { glyph: "↑↑", color: "var(--color-good)" };
  if (drift > 0.003) return { glyph: "↑",  color: "var(--color-good)" };
  if (drift < -0.012) return { glyph: "↓↓", color: "var(--color-bad)" };
  if (drift < -0.003) return { glyph: "↓",  color: "var(--color-bad)" };
  return { glyph: "→", color: "var(--color-ink-2)" };
}

export default function StudioTrendsPage() {
  const router = useRouter();
  const { activeStudioVenture, hydrated, hydrate, entrepreneur, state } = useGame();

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  useEffect(() => {
    if (!hydrated) return;
    if (!entrepreneur) { router.replace("/new-game"); return; }
    if (state && !activeStudioVenture) router.replace("/");
  }, [hydrated, entrepreneur, state, activeStudioVenture, router]);

  const s = activeStudioVenture;
  if (!s) {
    return (
      <main className="app-shell" style={{ display: "grid", placeItems: "center", paddingTop: 80 }}>
        <div style={{ color: "var(--color-ink-2)" }}>Loading…</div>
      </main>
    );
  }

  const trends: GenreTrend[] = s.genreTrends ?? [];
  const ranked = [...trends].sort((a, b) => b.popularity - a.popularity);

  // Per-genre exposure: how many of your in-dev games are betting on this genre,
  // plus how many launched titles ride this wave. Drives the "you're invested"
  // annotation so the player sees "RPGs cooling · you have 2 in dev" at a glance.
  const exposureByGenre = new Map<GameGenre, { inDev: number; live: number }>();
  for (const g of s.games) {
    const cur = exposureByGenre.get(g.genre) ?? { inDev: 0, live: 0 };
    if (isInDev(g)) cur.inDev += 1;
    else if (hasLaunched(g)) cur.live += 1;
    exposureByGenre.set(g.genre, cur);
  }

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Genre trends</h1>
      <div style={{ fontSize: 12, color: "var(--color-ink-2)", margin: "0 4px 10px" }}>
        Week {s.week} · {ranked.length} genres tracked. Popularity drifts weekly, regimes flip every few quarters.
      </div>

      <p style={{ color: "var(--color-ink-2)", fontSize: 12, margin: "0 4px 12px", lineHeight: 1.5 }}>
        Popularity is a 0–2 multiplier on a genre's market size (1.0 = neutral). Drift is the weekly direction
        it's moving in. Green genres are where audiences are hungry; red ones are where you'll fight for
        attention. Regime age hints at how long the current mood has held — older regimes are closer to a flip.
      </p>

      {ranked.length === 0 ? (
        <div className="themed-card" style={{ padding: 14, color: "var(--color-ink-2)", fontSize: 12 }}>
          No trend data yet. Advance a week to see the market move.
        </div>
      ) : (
        <div className="themed-card" style={{ padding: 0 }}>
          {ranked.map((t, i) => {
            const info = GENRE_INFO[t.genre];
            const desc = popularityDescriptor(t.popularity);
            const drift = driftGlyph(t.drift);
            const exposure = exposureByGenre.get(t.genre) ?? { inDev: 0, live: 0 };
            const regimeAge = Math.max(0, s.week - t.regimeStartedWeek);
            return (
              <div key={t.genre} style={{
                display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10,
                padding: "12px 14px", alignItems: "center",
                borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
              }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 700, textAlign: "right" }}>
                  {i + 1}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{info.label}</div>
                    <span className="mono" style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
                      color: DESCRIPTOR_COLOR[desc],
                    }}>
                      {desc}
                    </span>
                    {(exposure.inDev > 0 || exposure.live > 0) && (
                      <span className="tag" style={{ fontSize: 10 }}>
                        {exposure.inDev > 0 ? `${exposure.inDev} in dev` : null}
                        {exposure.inDev > 0 && exposure.live > 0 ? " · " : ""}
                        {exposure.live > 0 ? `${exposure.live} live` : null}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 3, lineHeight: 1.4 }}>
                    {info.blurb}
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 4, fontWeight: 600 }}>
                    regime age {regimeAge}w · market {info.marketSize.toFixed(2)}× base
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 70 }}>
                  <div className="num" style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                    {t.popularity.toFixed(2)}
                  </div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: drift.color, marginTop: 2 }}>
                    {drift.glyph}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="themed-card" style={{ padding: 12, marginTop: 12, background: "var(--color-surface-2)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-ink-2)", letterSpacing: ".08em", textTransform: "uppercase" }}>
          How to read this
        </div>
        <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6, lineHeight: 1.5 }}>
          <strong>Popularity</strong> multiplies a genre's reach at launch. <strong>Drift</strong> is the
          weekly change — pitch into rising genres if you can, avoid ones in free-fall. <strong>Regime age</strong>{" "}
          is weeks since the last directional flip; long regimes are fragile and often snap back. The game
          minimum between flips is 20 weeks, so anything past ~40w is overdue.
        </div>
      </div>

      <StudioAdvanceButton />
      <StudioTabBar />
    </main>
  );
}
