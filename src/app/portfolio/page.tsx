"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "@/game/store";
import {
  activeVentureCount, AnyVentureState, isSaasVenture, isStudioVenture,
  ventureId, ventureKind, ventureLabel,
} from "@/game/entrepreneur";
import { money } from "@/lib/format";

/**
 * Portfolio page: the entrepreneur-level view of every venture the player has
 * founded. Acts as the launch-pad for founding additional companies (each in
 * any vertical) from personal wealth, and as the switcher for ventures that
 * may already be archived/game-over.
 *
 * This page lives at `/portfolio` and is reachable from both TabBars' Settings
 * tab (linked from there) as well as from the VentureSwitcher dropdown in the
 * HQ headers.
 */
export default function PortfolioPage() {
  const router = useRouter();
  const entrepreneur = useGame(s => s.entrepreneur);
  const hydrate = useGame(s => s.hydrate);
  const hydrated = useGame(s => s.hydrated);
  const switchVenture = useGame(s => s.switchVenture);

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  useEffect(() => {
    if (!hydrated) return;
    if (!entrepreneur) router.replace("/new-game");
  }, [hydrated, entrepreneur, router]);

  if (!entrepreneur) {
    return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;
  }

  const ventures = entrepreneur.ventures;
  const activeId = entrepreneur.activeVentureId;

  const onOpen = (v: AnyVentureState) => {
    switchVenture(ventureId(v));
    if (isStudioVenture(v)) router.push("/studio");
    else router.push("/");
  };

  return (
    <main className="app-shell" style={{ paddingTop: "calc(20px + var(--safe-top))", paddingBottom: 120 }}>
      <header style={{ padding: "6px 4px 14px" }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: "var(--font-display)" }}>
          Portfolio
        </h1>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 4 }}>
          {entrepreneur.founderName} · {activeVentureCount(entrepreneur)} active / {ventures.length} total · W{entrepreneur.week}
        </div>
      </header>

      <div className="themed-card" style={{
        padding: "12px 14px", marginBottom: 14,
        display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", color: "var(--color-ink-2)", textTransform: "uppercase" }}>
            Personal wealth
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>
            {money(entrepreneur.personalWealth, { short: true })}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 4 }}>
            Untapped capital that can seed the next venture. Grows via IPO windfalls and exits.
          </div>
        </div>
        <span className="themed-pill" style={{ background: "var(--color-accent)", color: "#fff" }}>
          {money(entrepreneur.personalWealth)}
        </span>
      </div>

      <h2 className="sec-head">Ventures <span className="tag">{ventures.length}</span></h2>
      <div className="themed-card">
        {ventures.map((v, i) => (
          <VentureRow
            key={ventureId(v)}
            venture={v}
            first={i === 0}
            isActive={ventureId(v) === activeId}
            onOpen={() => onOpen(v)}
          />
        ))}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Found another company</h2>
      <div style={{ display: "grid", gap: 8 }}>
        <FoundCard
          glyph="💾"
          title="SaaS venture"
          desc="Subscriptions, MRR, VCs, IPO. The classic software-first playbook."
          enabled={entrepreneur.personalWealth >= 25_000}
          min={25_000}
          onClick={() => router.push("/new-game?mode=add&vertical=saas")}
        />
        <FoundCard
          glyph="🎮"
          title="Game studio"
          desc="Greenlight titles, hire a team, launch, survive reviews."
          enabled={entrepreneur.personalWealth >= 35_000}
          min={35_000}
          onClick={() => router.push("/new-game?mode=add&vertical=game-studio")}
        />
        {entrepreneur.personalWealth < 25_000 && (
          <div style={{
            padding: "10px 14px", fontSize: 12, color: "var(--color-ink-2)",
            border: "2px dashed var(--color-line)", borderRadius: 8,
          }}>
            Personal wealth is below the minimum seed capital for a new venture. Exit a venture
            (IPO, acquisition) to refill the tank.
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <Link href="/settings" style={{ color: "var(--color-ink-2)", fontSize: 12 }}>← back to settings</Link>
      </div>
    </main>
  );
}

function VentureRow({ venture, first, isActive, onOpen }: {
  venture: AnyVentureState;
  first: boolean;
  isActive: boolean;
  onOpen: () => void;
}) {
  const kind = ventureKind(venture);
  const glyph = kind === "game-studio" ? "🎮" : "💾";
  const dead = !!venture.gameOver;
  const cash = venture.finance?.cash ?? 0;
  const mrr = isSaasVenture(venture) ? (venture.finance?.mrr ?? 0) : 0;
  const headcount = venture.employees?.length ?? 0;
  const gameOverLabel = venture.gameOver?.reason === "acquired" ? "🎉 acquired"
    : venture.gameOver?.reason === "ipo" ? "🔔 went public"
    : venture.gameOver?.reason === "bankrupt" ? "💀 bankrupt"
    : null;

  return (
    <button
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr auto",
        gap: 10, alignItems: "center",
        padding: "12px 14px", width: "100%",
        borderTop: first ? 0 : "2px dashed var(--color-line)",
        background: isActive ? "var(--color-surface-2)" : "transparent",
        border: "none", textAlign: "left", cursor: "pointer",
        opacity: dead ? 0.65 : 1,
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>{glyph}</div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{venture.company.name}</div>
          {isActive && (
            <span className="themed-pill" style={{
              background: "var(--color-accent)", color: "#fff",
              fontSize: 9, padding: "2px 6px",
            }}>active</span>
          )}
          {gameOverLabel && (
            <span className="themed-pill" style={{
              background: "var(--color-ink-2)", color: "#fff",
              fontSize: 9, padding: "2px 6px",
            }}>{gameOverLabel}</span>
          )}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 4 }}>
          {ventureLabel(venture)} · W{venture.week} · cash {money(cash, { short: true })}
          {mrr > 0 ? ` · MRR ${money(mrr, { short: true })}` : ""}
          {headcount > 0 ? ` · ${headcount} on team` : ""}
        </div>
      </div>
      <span className="mono" style={{ fontSize: 14, color: "var(--color-ink-2)" }}>›</span>
    </button>
  );
}

function FoundCard({ glyph, title, desc, enabled, min, onClick }: {
  glyph: string;
  title: string;
  desc: string;
  enabled: boolean;
  min: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      className="themed-card"
      style={{
        display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 10,
        alignItems: "center", padding: "12px 14px", textAlign: "left",
        cursor: enabled ? "pointer" : "not-allowed",
        opacity: enabled ? 1 : 0.55,
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>{glyph}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>{desc}</div>
        <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 4 }}>
          Minimum seed: {money(min, { short: true })}
        </div>
      </div>
      <span className="mono" style={{ fontSize: 14, color: "var(--color-ink-2)" }}>›</span>
    </button>
  );
}
