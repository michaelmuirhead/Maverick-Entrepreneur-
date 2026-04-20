"use client";
import { Product } from "@/game/types";
import { useGame } from "@/game/store";
import { money } from "@/lib/format";
import { blendedMrr, totalUsers } from "@/game/segments";
import { debtLabel } from "@/game/debt";

const CATEGORY_GLYPH: Record<Product["category"], string> = {
  application:    "📱",
  system:         "🖥️",
  enterprise:     "🏢",
  "dev-tools":    "🧰",
  custom:         "🛠️",
  embedded:       "📟",
  "content-media":"🎨",
  "finance-ops":  "📒",
  "security-it":  "🛡️",
};

const STAGE_LABEL: Record<Product["stage"], { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  concept:   { label: "Concept",    tone: "neutral" },
  dev:       { label: "In dev",     tone: "neutral" },
  beta:      { label: "Beta",       tone: "neutral" },
  launched:  { label: "Growing",    tone: "ok" },
  mature:    { label: "Mature",     tone: "ok" },
  declining: { label: "Declining",  tone: "warn" },
  eol:       { label: "Sunset",     tone: "bad" },
};

export function ProductList({ limit }: { limit?: number }) {
  const products = useGame(s => s.state?.products ?? []);
  const visible = limit ? products.slice(0, limit) : products;

  if (visible.length === 0) {
    return <div className="themed-card" style={{ padding: 16, color: "var(--color-ink-2)" }}>No products yet. Head to Products to design your first one.</div>;
  }

  return (
    <div className="themed-card">
      {visible.map((p, i) => {
        const meta = STAGE_LABEL[p.stage];
        const mrr = blendedMrr(p);
        const userCount = totalUsers(p);
        const healthPct = Math.max(4, Math.min(100, p.health));
        const healthColor = p.health > 60 ? "var(--color-good)" : p.health > 35 ? "var(--color-warn)" : "var(--color-bad)";
        return (
          <div key={p.id} style={{
            display: "grid",
            gridTemplateColumns: "44px 1fr auto",
            gap: 10,
            alignItems: "center",
            padding: "12px 14px",
            borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, border: "var(--border-card)",
              display: "grid", placeItems: "center", fontSize: 20,
              background: "var(--color-surface-2)",
            }}>{CATEGORY_GLYPH[p.category]}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
                v{p.version} · {userCount.toLocaleString()} users · {money(mrr, { short: true })}/mo · debt {Math.round(p.techDebt ?? 0)} ({debtLabel(p.techDebt ?? 0)})
              </div>
              {p.stage === "dev" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <div style={{
                    flex: 1, height: 8, background: "var(--color-soft)",
                    border: "2px solid var(--color-line)", borderRadius: 6, overflow: "hidden",
                  }}>
                    <div style={{ height: "100%", width: `${p.devProgress}%`, background: "var(--color-blue)" }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600 }}>{Math.round(p.devProgress)}%</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <div style={{
                    flex: 1, height: 8, background: "var(--color-soft)",
                    border: "2px solid var(--color-line)", borderRadius: 6, overflow: "hidden",
                  }}>
                    <div style={{ height: "100%", width: `${healthPct}%`, background: healthColor }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600 }}>{Math.round(p.health)}</span>
                </div>
              )}
            </div>
            <span className={`themed-pill ${meta.tone === "warn" ? "warn" : meta.tone === "bad" ? "bad" : ""}`}>
              {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
