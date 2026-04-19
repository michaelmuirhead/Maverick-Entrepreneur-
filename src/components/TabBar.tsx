"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/",         label: "HQ",       glyph: "🏠" },
  { href: "/products", label: "Products", glyph: "📦" },
  { href: "/team",     label: "Team",     glyph: "👥" },
  { href: "/market",   label: "Market",   glyph: "🌐" },
  { href: "/finance",  label: "Finance",  glyph: "💵" },
  { href: "/settings", label: "Settings", glyph: "⚙️" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed-stack"
      style={{
        bottom: `calc(14px + var(--safe-bottom))`,
        background: "var(--color-surface)",
        border: "var(--border-card)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        padding: 8,
      }}
    >
      {TABS.map(t => {
        const active = pathname === t.href || (t.href !== "/" && pathname?.startsWith(t.href));
        return (
          <Link key={t.href} href={t.href} style={{
            padding: "8px 4px", textAlign: "center",
            color: active ? "var(--color-accent)" : "var(--color-ink-2)",
            fontWeight: 700, fontSize: 11, display: "grid", justifyItems: "center", gap: 2,
          }}>
            <span style={{ fontSize: 18 }}>{t.glyph}</span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
