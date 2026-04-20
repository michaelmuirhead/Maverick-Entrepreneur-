"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "@/game/store";
import { StudioTabBar } from "@/components/StudioTabBar";
import { StudioAdvanceButton } from "@/components/StudioAdvanceButton";
import { GENRE_INFO, GENRE_ORDER, PLATFORM_INFO, PLATFORM_ORDER, SCOPE_INFO } from "@/game/studio/genres";
import { hasLaunched, isInDev } from "@/game/studio/games";
import type { GameGenre, GamePlatform, GameScope } from "@/game/studio/types";
import { money } from "@/lib/format";

/**
 * Studio / Games — list of everything the studio has on its slate (both active
 * and launched), with an inline "pitch a new game" composer at the top. Deep
 * links into the per-game detail page.
 */
export default function StudioGamesIndexPage() {
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
    return <main className="app-shell" style={{ display: "grid", placeItems: "center", paddingTop: 80 }}><div style={{ color: "var(--color-ink-2)" }}>Loading…</div></main>;
  }

  const inDev = s.games.filter(isInDev);
  const launched = s.games.filter(hasLaunched);

  return (
    <main className="app-shell">
      <header style={{ paddingTop: `calc(12px + var(--safe-top))`, marginBottom: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "6px 4px", fontFamily: "var(--font-display)" }}>Games</h1>
        <div style={{ color: "var(--color-ink-2)", fontSize: 12, margin: "0 4px" }}>
          {inDev.length} in development · {launched.length} launched · {s.archivedGames.length} archived
        </div>
      </header>

      <NewGameComposer />

      {inDev.length > 0 && (
        <>
          <h2 className="sec-head" style={{ marginTop: 18 }}>In development <span className="tag">{inDev.length}</span></h2>
          <div style={{ display: "grid", gap: 8 }}>
            {inDev.map(g => <GameCard key={g.id} gameId={g.id} />)}
          </div>
        </>
      )}

      {launched.length > 0 && (
        <>
          <h2 className="sec-head" style={{ marginTop: 18 }}>Launched <span className="tag">{launched.length}</span></h2>
          <div style={{ display: "grid", gap: 8 }}>
            {launched.map(g => <GameCard key={g.id} gameId={g.id} />)}
          </div>
        </>
      )}

      {s.archivedGames.length > 0 && (
        <>
          <h2 className="sec-head" style={{ marginTop: 18 }}>Archived <span className="tag">{s.archivedGames.length}</span></h2>
          <div className="themed-card" style={{ padding: 0 }}>
            {s.archivedGames.map((a, i) => (
              <div key={a.id} style={{ padding: "10px 14px", borderTop: i === 0 ? 0 : "2px dashed var(--color-line)" }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{a.title}</div>
                <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
                  {GENRE_INFO[a.genre].label} · {SCOPE_INFO[a.scope].label} · {a.reason} · {a.verdict}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
                  Lifetime: {money(a.lifetimeRevenue, { short: true })} rev · {money(a.lifetimeCost, { short: true })} cost
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <StudioAdvanceButton />
      <StudioTabBar />
    </main>
  );
}

/** Inline composer — picks genre/scope/platforms + opening dev budget. */
function NewGameComposer() {
  const s = useGame(st => st.activeStudioVenture);
  const createStudioGame = useGame(st => st.createStudioGame);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState<GameGenre>(s?.company.signatureGenre ?? "rpg");
  const [scope, setScope] = useState<GameScope>(s?.company.defaultScope ?? "indie");
  const [platforms, setPlatforms] = useState<GamePlatform[]>(["pc-steam"]);
  const [devBudget, setDevBudget] = useState(5_000);

  const togglePlatform = (p: GamePlatform) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const submit = () => {
    const id = createStudioGame({ title, genre, scope, platforms, devBudget });
    if (id) router.push(`/studio/games/${id}`);
  };

  const defaultPrice = useMemo(() => {
    const base = GENRE_INFO[genre].defaultPrice;
    return Math.round(base * SCOPE_INFO[scope].priceMult);
  }, [genre, scope]);

  if (!open) {
    return (
      <button className="themed-card" onClick={() => setOpen(true)} style={{
        padding: "12px 14px", width: "100%", textAlign: "left",
        display: "grid", gridTemplateColumns: "32px 1fr auto", alignItems: "center", gap: 10,
      }}>
        <div style={{ fontSize: 22 }}>✨</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Pitch a new game</div>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 1 }}>Genre, scope, platforms, budget — then greenlight.</div>
        </div>
        <span className="mono" style={{ fontSize: 14, color: "var(--color-ink-2)" }}>›</span>
      </button>
    );
  }

  return (
    <div className="themed-card" style={{ padding: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>New pitch</div>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--color-ink-2)", fontSize: 12, fontWeight: 700 }}>Cancel</button>
      </div>

      <Field label="Working title (optional)">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Auto-generated if blank"
          style={inputStyle}
        />
      </Field>

      <Field label="Genre">
        <div style={chipStripStyle}>
          {GENRE_ORDER.map(g => (
            <button key={g} onClick={() => setGenre(g)} style={{ ...chipStyle, ...(genre === g ? chipActiveStyle : {}) }}>
              {GENRE_INFO[g].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Scope">
        <div style={chipStripStyle}>
          {(Object.keys(SCOPE_INFO) as GameScope[]).map(sc => (
            <button key={sc} onClick={() => setScope(sc)} style={{ ...chipStyle, ...(scope === sc ? chipActiveStyle : {}) }}>
              {SCOPE_INFO[sc].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Platforms">
        <div style={chipStripStyle}>
          {PLATFORM_ORDER.map(p => (
            <button key={p} onClick={() => togglePlatform(p)} style={{ ...chipStyle, ...(platforms.includes(p) ? chipActiveStyle : {}) }}>
              {PLATFORM_INFO[p].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label={`Weekly dev budget · ${money(devBudget)}`}>
        <input type="range" min={0} max={100_000} step={500} value={devBudget} onChange={(e) => setDevBudget(parseInt(e.target.value, 10))} style={{ width: "100%" }} />
      </Field>

      <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600 }}>
        ~{Math.round(GENRE_INFO[genre].devWeeksBase * SCOPE_INFO[scope].devWeeksMult)}w build · min {Math.max(GENRE_INFO[genre].teamSizeMin, SCOPE_INFO[scope].minTeam)} eng · {defaultPrice === 0 ? "Free-to-play" : `$${defaultPrice} list`}
      </div>

      <button onClick={submit} style={{
        background: "var(--color-accent)", color: "#fff",
        border: "var(--border-card)", borderRadius: "var(--radius-card)",
        padding: "10px 14px", fontWeight: 700, fontSize: 14,
      }}>
        Greenlight
      </button>
    </div>
  );
}

function GameCard({ gameId }: { gameId: string }) {
  const g = useGame(s => s.activeStudioVenture?.games.find(x => x.id === gameId));
  if (!g) return null;
  const inDev = isInDev(g);
  return (
    <Link href={`/studio/games/${g.id}`} className="themed-card" style={{
      padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center",
      textDecoration: "none",
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{g.title}</div>
        <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
          {GENRE_INFO[g.genre].label} · {SCOPE_INFO[g.scope].label} · {g.platforms.map(p => PLATFORM_INFO[p].label).join(" + ")}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
          {inDev
            ? `${g.stage} · ${Math.round(g.devProgress * 100)}% · hype ${Math.round(g.hype)}`
            : g.launched
              ? `launched W${g.launched.week} · Metacritic ${g.launched.reviewScore} · ${g.launched.totalSold.toLocaleString()} sold`
              : g.stage}
          {g.crunchActive ? " · 🔥 crunch" : ""}
          {g.reviewBomb ? " · 🚨 bomb" : ""}
        </div>
      </div>
      <span className="mono" style={{ fontSize: 16, color: "var(--color-ink-2)" }}>›</span>
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 10, color: "var(--color-ink-2)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--color-surface)",
  border: "var(--border-card)",
  borderRadius: "var(--radius-card)",
  padding: "8px 12px",
  fontSize: 14,
  fontFamily: "var(--font-sans)",
};

const chipStripStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const chipStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "var(--border-card)",
  borderRadius: "var(--radius-card)",
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-ink-2)",
};
const chipActiveStyle: React.CSSProperties = {
  background: "var(--color-accent)",
  color: "#fff",
  borderColor: "var(--color-accent)",
};
