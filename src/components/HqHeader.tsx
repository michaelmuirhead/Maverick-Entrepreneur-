"use client";
import { useGame } from "@/game/store";
import { useTheme } from "./ThemeProvider";
import { quarterLabel } from "@/lib/format";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { VentureSwitcher } from "./VentureSwitcher";

export function HqHeader() {
  const s = useGame(st => st.state);
  const { theme } = useTheme();
  if (!s) return null;

  return (
    <header style={{ paddingTop: `calc(12px + var(--safe-top))` }}>
      {theme === "cartoonish" ? <CartoonishScene /> : <PixelScene />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "10px 4px 0" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: "var(--font-display)" }}>{s.company.name}</h1>
          <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)", fontWeight: 600, marginTop: 2 }}>
            {quarterLabel(s.week)} · W{s.week} · {s.company.stage.replace("-", " ")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <VentureSwitcher />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}

function CartoonishScene() {
  return (
    <div style={{
      position: "relative",
      height: 110,
      margin: "6px -14px 0",
      padding: "0 14px",
      background: "linear-gradient(to bottom, var(--color-sky-1), var(--color-sky-2) 70%, var(--color-bg))",
      borderBottom: "var(--border-card)",
    }}>
      <div style={{ position: "absolute", right: 24, top: 10, width: 40, height: 40, background: "#FFD35A", borderRadius: "50%", border: "var(--border-card)" }} />
      <div style={{ position: "absolute", left: 24, top: 26, width: 56, height: 16, background: "#fff", borderRadius: 30, border: "var(--border-card)" }} />
      <div style={{ position: "absolute", left: 140, top: 50, width: 74, height: 16, background: "#fff", borderRadius: 30, border: "var(--border-card)" }} />
      <div style={{ position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%)", width: 180, height: 70, background: "#FFB86B", borderTopLeftRadius: 6, borderTopRightRadius: 6, border: "var(--border-card)" }}>
        <div style={{ position: "absolute", left: "50%", top: -28, transform: "translateX(-50%)", background: "#fff", border: "var(--border-card)", padding: "3px 10px", borderRadius: 8, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "var(--shadow-card)" }}>HQ</div>
        {[14, 50, 86, 122].map(x => (
          <div key={x} style={{ position: "absolute", left: x, top: 14, width: 24, height: 20, background: "#FFF6C0", border: "2px solid var(--color-line)", borderRadius: 3 }} />
        ))}
        <div style={{ position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%)", width: 30, height: 38, background: "var(--color-blue)", border: "var(--border-card)", borderTopLeftRadius: 16, borderTopRightRadius: 16 }} />
      </div>
    </div>
  );
}

function PixelScene() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "64px 1fr",
      gap: 10,
      alignItems: "center",
      padding: "10px 2px",
      borderBottom: "1px solid var(--color-line)",
    }}>
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" style={{ width: 64, height: 64, background: "#0F1A22", border: "1px solid var(--color-line)" }}>
        <rect x="3" y="2" width="1" height="1" fill="#FFB020"/>
        <rect x="12" y="1" width="1" height="1" fill="#22D3EE"/>
        <rect x="3" y="6" width="10" height="9" fill="#2B3A46"/>
        <rect x="2" y="5" width="12" height="1" fill="#FFB020"/>
        <rect x="5" y="8" width="2" height="2" fill="#22D3EE"/>
        <rect x="9" y="8" width="2" height="2" fill="#FFB020"/>
        <rect x="5" y="11" width="2" height="2" fill="#FFB020"/>
        <rect x="9" y="11" width="2" height="2" fill="#2BD97C"/>
        <rect x="7" y="13" width="2" height="2" fill="#A78BFA"/>
        <rect y="15" width="16" height="1" fill="#1E2A33"/>
      </svg>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 11, color: "var(--color-accent)", letterSpacing: ".06em" }}>TERMINAL ONLINE</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 6, letterSpacing: ".08em" }}>
          <span style={{ color: "var(--color-accent)" }}>●</span> LIVE · ready for input
        </div>
      </div>
    </div>
  );
}
