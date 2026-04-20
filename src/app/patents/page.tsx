"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { CATEGORY_INFO } from "@/game/categories";
import { patentFilingCost, patentGrantWeeks } from "@/game/portfolio";
import type { ProductCategory } from "@/game/types";
import { money } from "@/lib/format";

export default function PatentsPage() {
  const state = useGame(s => s.state);
  const hydrated = useGame(s => s.hydrated);
  const hydrate = useGame(s => s.hydrate);
  const file = useGame(s => s.filePatent);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ProductCategory>("application");
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;

  const patents = state.patents ?? [];
  const cost = patentFilingCost(category);
  const grantWeeks = patentGrantWeeks(category);
  const canAfford = state.finance.cash >= cost;

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <Link href="/growth" className="mono" style={{ color: "var(--color-ink-2)", fontSize: 12 }}>← Growth</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Patents & IP</h1>

      <h2 className="sec-head">File a new patent</h2>
      <div className="themed-card" style={{ padding: 14, display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Title</span>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Novel method for..."
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Category</span>
          <select value={category} onChange={e => setCategory(e.target.value as ProductCategory)}
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }}>
            {Object.values(CATEGORY_INFO).map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
          Filing cost {money(cost, { short: true })} · Grant window ~{grantWeeks} weeks
        </div>
        <button
          onClick={() => { file(title, category); setTitle(""); }}
          disabled={!canAfford}
          className="themed-pill"
          style={{
            padding: "10px 14px", fontSize: 14, cursor: canAfford ? "pointer" : "not-allowed",
            background: canAfford ? "var(--color-accent)" : "var(--color-muted)",
            color: "#fff",
          }}
        >
          {canAfford ? "File patent" : "Insufficient cash"}
        </button>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Portfolio <span className="tag">{patents.length}</span></h2>
      {patents.length === 0 && (
        <div className="themed-card" style={{ padding: 14, color: "var(--color-ink-2)", fontSize: 13 }}>
          No patents yet. File one to protect a category from competitor feature-clone attacks.
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {patents.map(p => {
          const pct = p.grantedWeek
            ? 100
            : Math.min(99, Math.round(((state.week - p.filedWeek) / patentGrantWeeks(p.category)) * 100));
          return (
            <div key={p.id} className="themed-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</div>
                <span className="themed-pill" style={{ fontSize: 10, background: p.grantedWeek ? "var(--color-good)" : "var(--color-muted)", color: "#fff" }}>
                  {p.grantedWeek ? `granted · ${p.yearsRemaining}yr` : `${pct}%`}
                </span>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6 }}>
                {p.category} · filed wk {p.filedWeek} · {money(p.cost, { short: true })}
              </div>
            </div>
          );
        })}
      </div>

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
