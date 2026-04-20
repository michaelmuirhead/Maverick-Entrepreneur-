"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useGame } from "@/game/store";
import { StudioTabBar } from "@/components/StudioTabBar";
import { StudioAdvanceButton } from "@/components/StudioAdvanceButton";
import { GENRE_INFO, PLATFORM_INFO, SCOPE_INFO } from "@/game/studio/genres";
import {
  estimatedWeeksToShip, hasLaunched, isInDev, isReadyToShip, launchPrice,
  qualityForecast, weeklyDevBurn,
} from "@/game/studio/games";
import { capacityDiagnostics, crunchStatusBlurb, isCrunchAdvisable } from "@/game/studio/crunch";
import { reviewBombBlurb, reviewBombDescriptor } from "@/game/studio/platforms";
import { money } from "@/lib/format";
import type { Game } from "@/game/studio/types";

/**
 * Per-game detail page — the control panel for a single title. Every action
 * the studio can take on a game is here: budgets, staffing, crunch toggle,
 * planned launch week, ship-now, cancel, DLC queue, review-bomb response.
 */
export default function GameDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const gameId = params?.id;

  const { activeStudioVenture, hydrated, hydrate, entrepreneur, state } = useGame();
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  useEffect(() => {
    if (!hydrated) return;
    if (!entrepreneur) { router.replace("/new-game"); return; }
    if (state && !activeStudioVenture) router.replace("/");
  }, [hydrated, entrepreneur, state, activeStudioVenture, router]);

  const s = activeStudioVenture;
  const g = s?.games.find(x => x.id === gameId);
  if (!s || !g) {
    return (
      <main className="app-shell" style={{ paddingTop: 80 }}>
        <div style={{ color: "var(--color-ink-2)" }}>Loading game…</div>
        <StudioTabBar />
      </main>
    );
  }

  const genre = GENRE_INFO[g.genre];
  const scope = SCOPE_INFO[g.scope];
  const inDev = isInDev(g);
  const ready = inDev && isReadyToShip(g);
  const forecast = inDev ? qualityForecast(g) : null;
  const weeksLeft = inDev ? estimatedWeeksToShip(g) : 0;
  const burn = weeklyDevBurn(g, s.employees.length);
  const cap = capacityDiagnostics(s.games, s.employees);

  return (
    <main className="app-shell">
      <header style={{ paddingTop: `calc(12px + var(--safe-top))`, marginBottom: 10 }}>
        <Link href="/studio/games" style={{ fontSize: 12, color: "var(--color-ink-2)", fontWeight: 700 }}>← All games</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 0 2px", fontFamily: "var(--font-display)" }}>{g.title}</h1>
        <div style={{ color: "var(--color-ink-2)", fontSize: 12 }}>
          {genre.label} · {scope.label} · {g.platforms.map(p => PLATFORM_INFO[p].label).join(" + ")}
        </div>
      </header>

      {/* Status strip */}
      <div className="themed-card" style={{ padding: "10px 14px", display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span className="mono" style={{ fontWeight: 700, color: "var(--color-ink-2)" }}>STAGE</span>
          <span style={{ fontWeight: 700 }}>{g.stage}</span>
        </div>
        {inDev && (
          <>
            <ProgressBar value={g.devProgress} />
            <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600 }}>
              {Math.round(g.devProgress * 100)}% of stage · week {g.weeksSinceStart} of dev · target {g.targetDevWeeks}w
              {weeksLeft < 1000 ? ` · ~${weeksLeft}w to ship` : ""}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>Hype</span>
              <span className="mono" style={{ fontWeight: 700 }}>{Math.round(g.hype)} / 100</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>Wishlists</span>
              <span className="mono" style={{ fontWeight: 700 }}>{Math.round(g.wishlist).toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>Quality / polish / debt</span>
              <span className="mono" style={{ fontWeight: 700 }}>{Math.round(g.quality)} / {Math.round(g.polish)} / {Math.round(g.techDebt)}</span>
            </div>
            {forecast && (
              <div style={{ fontSize: 12, color: "var(--color-ink-2)" }}>
                Forecast at ship: <strong style={{ color: "var(--color-ink)" }}>{forecast.descriptor}</strong> ({forecast.score}/100)
              </div>
            )}
          </>
        )}
        {hasLaunched(g) && g.launched && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>Metacritic</span>
              <span className="mono" style={{ fontWeight: 700 }}>{g.launched.reviewScore} / 100</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>Total sold</span>
              <span className="mono" style={{ fontWeight: 700 }}>{g.launched.totalSold.toLocaleString()} units</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>List price</span>
              <span className="mono" style={{ fontWeight: 700 }}>${g.launched.priceAtLaunch}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>Peak weekly sales</span>
              <span className="mono" style={{ fontWeight: 700 }}>{g.peakWeeklySales.toLocaleString()} units</span>
            </div>
            {g.liveService && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>Live MAU</span>
                  <span className="mono" style={{ fontWeight: 700 }}>{Math.round(g.liveService.mau).toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>ARPDAU</span>
                  <span className="mono" style={{ fontWeight: 700 }}>${(g.liveService.arpdau / 100).toFixed(2)}</span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Review bomb */}
      {g.reviewBomb && (
        <div className="themed-card" style={{ padding: "10px 14px", marginTop: 8, borderColor: "var(--color-bad)" }}>
          <div style={{ fontSize: 11, color: "var(--color-bad)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
            🚨 Review bomb · {reviewBombDescriptor(g.reviewBomb.severity)}
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{reviewBombBlurb(g.reviewBomb)}</div>
          <ReviewBombResponse gameId={g.id} />
        </div>
      )}

      {/* Dev controls */}
      {inDev && (
        <>
          <h2 className="sec-head" style={{ marginTop: 18 }}>Dev controls</h2>
          <div className="themed-card" style={{ padding: 14, display: "grid", gap: 12 }}>
            <BudgetSlider
              label="Weekly dev budget"
              value={g.devBudget}
              onChange={(v) => useGame.getState().setGameDevBudget(g.id, v)}
              max={200_000}
              step={500}
              sub={`+ salaries & base = ~${money(burn, { short: true })}/wk total`}
            />
            <BudgetSlider
              label="Pre-launch marketing"
              value={g.marketingBudget}
              onChange={(v) => useGame.getState().setGameMarketingBudget(g.id, v)}
              max={200_000}
              step={500}
              sub={`Builds hype & wishlists. List price ~$${launchPrice(g)}.`}
            />

            <PlannedLaunchControl game={g} />

            <CrunchToggle game={g} />

            {cap.overCommitted && (
              <div style={{ fontSize: 11, color: "var(--color-warn)", fontWeight: 600 }}>
                ⚠️ Studio is over-committed ({cap.minTeamRequired} required vs. {cap.teamSize} team). This project is understaffed.
              </div>
            )}
          </div>

          <EngineerRoster game={g} />

          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {ready && (
              <button onClick={() => useGame.getState().shipGameNow(g.id)} style={primaryBtnStyle}>
                🚀 Ship now
              </button>
            )}
            {!ready && (
              <button onClick={() => { if (confirm("Ship this game right now? It may not be ready.")) useGame.getState().shipGameNow(g.id); }} style={secondaryBtnStyle}>
                Force-ship (risky)
              </button>
            )}
            <button onClick={() => { if (confirm("Cancel this project? All dev spend is sunk.")) useGame.getState().cancelStudioGame(g.id); }} style={dangerBtnStyle}>
              Cancel project
            </button>
          </div>
        </>
      )}

      {/* Launched: DLC pipeline */}
      {hasLaunched(g) && (
        <>
          <h2 className="sec-head" style={{ marginTop: 18 }}>DLC pipeline <span className="tag">{g.dlcPipeline.length}</span></h2>
          <DlcControls game={g} />
        </>
      )}

      <StudioAdvanceButton />
      <StudioTabBar />
    </main>
  );
}

// ======================================================================
// Sub-components
// ======================================================================

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div style={{
      height: 8, borderRadius: 4,
      background: "var(--color-surface-2)",
      border: "1px solid var(--color-line)", overflow: "hidden",
    }}>
      <div style={{ height: "100%", width: `${pct * 100}%`, background: "var(--color-accent)" }} />
    </div>
  );
}

function BudgetSlider({ label, value, onChange, max, step, sub }: {
  label: string; value: number; onChange: (v: number) => void; max: number; step: number; sub?: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>{label}</label>
        <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{money(value, { short: true })}/wk</span>
      </div>
      <input type="range" min={0} max={max} step={step} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} style={{ width: "100%", marginTop: 4 }} />
      {sub && <div style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PlannedLaunchControl({ game }: { game: Game }) {
  const week = useGame(s => s.activeStudioVenture?.week ?? 0);
  const target = game.plannedLaunchWeek ?? (week + Math.max(4, estimatedWeeksToShip(game)));
  const min = week + 1;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>Planned launch week</label>
        <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{game.plannedLaunchWeek == null ? "— unset —" : `W${target}`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={week + 200}
        step={1}
        value={target}
        onChange={(e) => useGame.getState().setGamePlannedLaunchWeek(game.id, parseInt(e.target.value, 10))}
        style={{ width: "100%", marginTop: 4 }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button onClick={() => useGame.getState().setGamePlannedLaunchWeek(game.id, week + Math.max(4, estimatedWeeksToShip(game)))} style={miniBtnStyle}>Auto-fit</button>
        <button onClick={() => useGame.getState().setGamePlannedLaunchWeek(game.id, null)} style={miniBtnStyle}>Clear</button>
      </div>
    </div>
  );
}

function CrunchToggle({ game }: { game: Game }) {
  const advisable = isCrunchAdvisable(game);
  const status = crunchStatusBlurb(game, game.crunchActive ? 1 : 0);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>Crunch</label>
        <button
          onClick={() => {
            if (!game.crunchActive && !confirm("Enabling crunch: +40% velocity, +25% burn, morale decay & attrition risk. Continue?")) return;
            useGame.getState().toggleGameCrunch(game.id);
          }}
          style={{
            ...(game.crunchActive ? dangerBtnStyle : secondaryBtnStyle),
            padding: "6px 12px", fontSize: 12,
          }}
        >
          {game.crunchActive ? "End crunch" : "Start crunch"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: game.crunchActive ? "var(--color-bad)" : "var(--color-ink-2)", marginTop: 4 }}>
        {status}{!advisable && " · Not advisable at this scope."}
      </div>
    </div>
  );
}

function EngineerRoster({ game }: { game: Game }) {
  const employees = useGame(s => s.activeStudioVenture?.employees ?? []);
  const assigned = employees.filter(e => game.assignedEngineers.includes(e.id));
  const unassigned = employees.filter(e => !game.assignedEngineers.includes(e.id) && e.role !== "founder");

  return (
    <>
      <h2 className="sec-head" style={{ marginTop: 14 }}>Engineers <span className="tag">{assigned.length}</span></h2>
      <div className="themed-card" style={{ padding: 0 }}>
        {assigned.length === 0 && (
          <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--color-ink-2)" }}>No engineers assigned. Assign someone below.</div>
        )}
        {assigned.map((e, i) => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderTop: i === 0 ? 0 : "2px dashed var(--color-line)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{e.name}</div>
              <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>{e.role} · L{e.level} · skill {e.skill} · morale {Math.round(e.morale)}</div>
            </div>
            <button onClick={() => useGame.getState().unassignGameEngineer(game.id, e.id)} style={miniBtnStyle}>Unassign</button>
          </div>
        ))}
        {unassigned.length > 0 && (
          <div style={{ padding: "10px 12px", borderTop: assigned.length > 0 ? "2px dashed var(--color-line)" : 0 }}>
            <div style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>Available</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {unassigned.map(e => (
                <button key={e.id} onClick={() => useGame.getState().assignGameEngineer(game.id, e.id)} style={{
                  background: "var(--color-surface)",
                  border: "var(--border-card)", borderRadius: "var(--radius-card)",
                  padding: "6px 10px", fontSize: 11, fontWeight: 700,
                }}>
                  + {e.name} ({e.role})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ReviewBombResponse({ gameId }: { gameId: string }) {
  const respond = useGame(s => s.respondToStudioReviewBomb);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
      <button onClick={() => respond(gameId, "apology")} style={miniBtnStyle}>Apology · $10k</button>
      <button onClick={() => respond(gameId, "compensation")} style={miniBtnStyle}>Compensation · $75k</button>
      <button onClick={() => respond(gameId, "rollback")} style={miniBtnStyle}>Rollback · $250k</button>
    </div>
  );
}

function DlcControls({ game }: { game: Game }) {
  const week = useGame(s => s.activeStudioVenture?.week ?? 0);
  const queue = useGame(s => s.queueStudioDlc);

  return (
    <div className="themed-card" style={{ padding: 14 }}>
      {game.dlcPipeline.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--color-ink-2)", marginBottom: 10 }}>No DLC queued. Pack some content and feed the tail.</div>
      )}
      {game.dlcPipeline.map((d, i) => (
        <div key={d.id} style={{ padding: "8px 0", borderTop: i === 0 ? 0 : "2px dashed var(--color-line)" }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{d.name}</div>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
            {d.releasedWeek != null ? `released W${d.releasedWeek} · ${money(d.revenue, { short: true })} rev` : `plan: W${d.plannedWeek} · ${Math.round(d.devProgress * 100)}% built`}
          </div>
        </div>
      ))}
      <button
        onClick={() => {
          const name = prompt("DLC name?", "Expansion");
          if (!name) return;
          queue(game.id, {
            name,
            costMult: 0.2,
            plannedWeek: week + 12,
            salesSpike: 1.4,
          });
        }}
        style={{ ...secondaryBtnStyle, marginTop: 10, fontSize: 12, padding: "6px 12px" }}
      >
        + Queue DLC
      </button>
    </div>
  );
}

// ======================================================================
// Shared button styles
// ======================================================================

const primaryBtnStyle: React.CSSProperties = {
  background: "var(--color-accent)", color: "#fff",
  border: "var(--border-card)", borderRadius: "var(--radius-card)",
  padding: "10px 14px", fontWeight: 700, fontSize: 14,
};
const secondaryBtnStyle: React.CSSProperties = {
  background: "var(--color-surface)", color: "var(--color-ink)",
  border: "var(--border-card)", borderRadius: "var(--radius-card)",
  padding: "10px 14px", fontWeight: 700, fontSize: 14,
};
const dangerBtnStyle: React.CSSProperties = {
  background: "var(--color-surface)", color: "var(--color-bad)",
  border: "var(--border-card)", borderColor: "var(--color-bad)", borderRadius: "var(--radius-card)",
  padding: "10px 14px", fontWeight: 700, fontSize: 14,
};
const miniBtnStyle: React.CSSProperties = {
  background: "var(--color-surface-2)", color: "var(--color-ink)",
  border: "var(--border-card)", borderRadius: "var(--radius-card)",
  padding: "4px 8px", fontWeight: 700, fontSize: 11,
};
