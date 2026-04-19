"use client";
import { useTheme } from "./ThemeProvider";

export function ThemeSwitcher() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      style={{
        background: "var(--color-surface)",
        border: "var(--border-card)",
        borderRadius: "var(--radius-chip)",
        boxShadow: "var(--shadow-card)",
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 700,
        color: "var(--color-ink)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {theme === "cartoonish" ? "Pixel mode" : "Cartoon mode"}
    </button>
  );
}
