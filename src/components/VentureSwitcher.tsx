"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/game/store";
import {
  activeVentureCount, isSaasVenture, isStudioVenture,
  ventureId, ventureKind, ventureLabel,
} from "@/game/entrepreneur";

/**
 * Header-mounted dropdown that lets the player switch between the ventures in
 * their portfolio. Only renders when there is more than one active venture —
 * single-venture runs don't need it. Picking a venture calls `switchVenture`
 * and, if the destination venture's kind is different from the current route,
 * navigates to the matching shell (`/` for SaaS, `/studio` for game studio)
 * so the player isn't left looking at the wrong UI for their venture.
 */
export function VentureSwitcher() {
  const router = useRouter();
  const entrepreneur = useGame(s => s.entrepreneur);
  const activeVenture = useGame(s => {
    if (s.state) return s.state;
    if (s.activeStudioVenture) return s.activeStudioVenture;
    return null;
  });
  const switchVenture = useGame(s => s.switchVenture);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click — the popover otherwise lingers when the user taps
  // back onto the scene.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!entrepreneur || !activeVenture) return null;
  // Show the switcher as soon as >1 venture exists — even archived/game-over
  // ventures are reachable, so the player can look back at their last run.
  if (entrepreneur.ventures.length < 2) return null;

  const activeId = ventureId(activeVenture);

  const onPick = (id: string) => {
    if (id === activeId) { setOpen(false); return; }
    const target = entrepreneur.ventures.find(v => ventureId(v) === id);
    if (!target) { setOpen(false); return; }
    const targetKind = ventureKind(target);
    switchVenture(id);
    setOpen(false);
    // Route to the matching shell if the destination is a different venture
    // kind from the current view. `/` is the SaaS HQ; `/studio` is the studio
    // HQ. Either URL is safe to navigate to from any page.
    if (targetKind === "game-studio") {
      router.push("/studio");
    } else {
      router.push("/");
    }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="themed-btn"
        style={{
          fontSize: 11, padding: "6px 10px",
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "var(--color-surface-2)",
          fontWeight: 700,
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span style={{ fontSize: 13 }}>
          {isStudioVenture(activeVenture) ? "🎮" : isSaasVenture(activeVenture) ? "💾" : "◆"}
        </span>
        <span style={{ maxWidth: 110, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {activeVenture.company.name}
        </span>
        <span className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)" }}>▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="themed-card"
          style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)",
            minWidth: 240, zIndex: 40,
            padding: 6,
            boxShadow: "var(--shadow-card)",
            display: "grid", gap: 2,
          }}
        >
          <div style={{
            padding: "6px 10px 8px",
            fontSize: 10, fontWeight: 700, letterSpacing: ".08em",
            color: "var(--color-ink-2)", textTransform: "uppercase",
          }}>
            Your ventures ({activeVentureCount(entrepreneur)} active)
          </div>
          {entrepreneur.ventures.map(v => {
            const id = ventureId(v);
            const isActive = id === activeId;
            const kind = ventureKind(v);
            const glyph = kind === "game-studio" ? "🎮" : "💾";
            const dead = !!v.gameOver;
            return (
              <button
                key={id}
                role="menuitem"
                onClick={() => onPick(id)}
                style={{
                  display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 8,
                  alignItems: "center", padding: "8px 10px",
                  background: isActive ? "var(--color-surface-2)" : "transparent",
                  border: isActive ? "2px solid var(--color-accent)" : "2px solid transparent",
                  borderRadius: 8, textAlign: "left", cursor: "pointer",
                  opacity: dead ? 0.6 : 1,
                }}
              >
                <div style={{ fontSize: 16, lineHeight: 1 }}>{glyph}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{ventureLabel(v)}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 2 }}>
                    W{v.week}{dead ? ` · ${v.gameOver?.reason}` : ""}
                  </div>
                </div>
                {isActive && (
                  <span className="themed-pill" style={{
                    background: "var(--color-accent)", color: "#fff",
                    fontSize: 9, padding: "2px 6px",
                  }}>
                    active
                  </span>
                )}
              </button>
            );
          })}
          <div style={{ borderTop: "2px dashed var(--color-line)", marginTop: 4, paddingTop: 4 }}>
            <Link
              href="/portfolio"
              onClick={() => setOpen(false)}
              style={{
                display: "block", padding: "8px 10px",
                fontSize: 12, fontWeight: 700, textDecoration: "none",
                color: "var(--color-accent)",
              }}
            >
              Manage portfolio →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
