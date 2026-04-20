"use client";
import { useGame } from "@/game/store";
import { useTheme } from "./ThemeProvider";
import { quarterLabel } from "@/lib/format";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { GENRE_INFO } from "@/game/studio/genres";

/**
 * Studio-flavored HQ header. Mirrors the SaaS HqHeader in layout, but swaps
 * the "office" scene for a studio scene (marquee arcade cabinet / pixel CRT),
 * and surfaces the studio's signature genre + default scope in the subtitle.
 */
export function StudioHqHeader() {
  const s = useGame(st => st.activeStudioVenture);
  const { theme } = useTheme();
  if (!s) return null;

  const genre = GENRE_INFO[s.company.signatureGenre];

  return (
    <header style={{ paddingTop: `calc(12px + var(--safe-top))` }}>
      {theme === "cartoonish" ? <CartoonishScene /> : <PixelScene />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "10px 4px 0" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: "var(--font-display)" }}>{s.company.name}</h1>
          <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)", fontWeight: 600, marginTop: 2 }}>
            {quarterLabel(s.week)} · W{s.week} · {s.company.stage.replace("-", " ")} · {genre.label} · {s.company.defaultScope}
          </div>
        </div>
        <ThemeSwitcher />
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
      {/* marquee arcade cabinet */}
      <div style={{ position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%)", width: 120, height: 90, background: "#2B3A46", borderTopLeftRadius: 10, borderTopRightRadius: 10, border: "var(--border-card)" }}>
        {/* marquee */}
        <div style={{ position: "absolute", left: 8, right: 8, top: 6, height: 18, background: "#FFD35A", borderRadius: 4, border: "2px solid var(--color-line)", display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, color: "#1E2A33" }}>STUDIO</div>
        {/* screen */}
        <div style={{ position: "absolute", left: 14, right: 14, top: 30, bottom: 30, background: "#0F1A22", border: "2px solid var(--color-line)" }}>
          <div style={{ position: "absolute", left: 6, top: 6, width: 10, height: 10, background: "#FFB020" }} />
          <div style={{ position: "absolute", right: 6, top: 6, width: 10, height: 10, background: "#22D3EE" }} />
          <div style={{ position: "absolute", left: 10, bottom: 8, right: 10, height: 6, background: "#2BD97C" }} />
        </div>
        {/* joystick + buttons */}
        <div style={{ position: "absolute", left: 20, bottom: 8, width: 12, height: 12, borderRadius: "50%", background: "#E84A5F", border: "2px solid var(--color-line)" }} />
        <div style={{ position: "absolute", left: 44, bottom: 10, width: 8, height: 8, borderRadius: "50%", background: "#FFD35A", border: "2px solid var(--color-line)" }} />
        <div style={{ position: "absolute", left: 60, bottom: 10, width: 8, height: 8, borderRadius: "50%", background: "#22D3EE", border: "2px solid var(--color-line)" }} />
        <div style={{ position: "absolute", left: 76, bottom: 10, width: 8, height: 8, borderRadius: "50%", background: "#2BD97C", border: "2px solid var(--color-line)" }} />
      </div>
      {/* floating stars */}
      <div style={{ position: "absolute", right: 28, top: 18, fontSize: 16 }}>✦</div>
      <div style={{ position: "absolute", left: 24, top: 36, fontSize: 12, opacity: 0.8 }}>✦</div>
      <div style={{ position: "absolute", right: 80, top: 40, fontSize: 10, opacity: 0.6 }}>✦</div>
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
        {/* pixel game controller */}
        <rect x="2" y="6" width="12" height="6" fill="#2B3A46"/>
        <rect x="1" y="7" width="1" height="4" fill="#2B3A46"/>
        <rect x="14" y="7" width="1" height="4" fill="#2B3A46"/>
        {/* D-pad */}
        <rect x="4" y="8" width="1" height="2" fill="#FFB020"/>
        <rect x="3" y="9" width="3" height="1" fill="#FFB020"/>
        {/* buttons */}
        <rect x="10" y="8" width="1" height="1" fill="#E84A5F"/>
        <rect x="11" y="9" width="1" height="1" fill="#22D3EE"/>
        <rect x="9" y="9" width="1" height="1" fill="#2BD97C"/>
        <rect x="10" y="10" width="1" height="1" fill="#FFD35A"/>
        {/* cable */}
        <rect x="7" y="4" width="2" height="2" fill="#FFB020"/>
        <rect x="7" y="2" width="1" height="2" fill="#FFB020"/>
        {/* baseline */}
        <rect y="15" width="16" height="1" fill="#1E2A33"/>
      </svg>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 11, color: "var(--color-accent)", letterSpacing: ".06em" }}>STUDIO ONLINE</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 6, letterSpacing: ".08em" }}>
          <span style={{ color: "var(--color-accent)" }}>●</span> READY · press start
        </div>
      </div>
    </div>
  );
}
