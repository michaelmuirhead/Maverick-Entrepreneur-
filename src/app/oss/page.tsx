"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { CATEGORY_INFO } from "@/game/categories";
import { ossRecruitingBoost } from "@/game/portfolio";
import type { ProductCategory } from "@/game/types";
import { money } from "@/lib/format";

export default function OssPage() {
  const state = useGame(s => s.state);
  const hydrated = useGame(s => s.hydrated);
  const hydrate = useGame(s => s.hydrate);
  const start = useGame(s => s.startOssProject);
  const setBudget = useGame(s => s.setOssBudget);
  const stop = useGame(s => s.stopOssProject);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("dev-tools");
  const [weeklyBudget, setWeeklyBudget] = useState(2000);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;

  const oss = state.openSource ?? [];
  const boost = ossRecruitingBoost(oss);

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <Link href="/growth" className="mono" style={{ color: "var(--color-ink-2)", fontSize: 12 }}>← Growth</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Open source</h1>

      <div className="themed-card" style={{ padding: 14 }}>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)" }}>
          Recruiting boost · ×{boost.toFixed(2)} (caps at 1.15)
        </div>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Start a new project</h2>
      <div className="themed-card" style={{ padding: 14, display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Project name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="quiklib-core"
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Category</span>
          <select value={category} onChange={e => setCategory(e.target.value as ProductCategory)}
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }}>
            {Object.values(CATEGORY_INFO).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Weekly budget</span>
          <input type="number" min={0} value={weeklyBudget} onChange={e => setWeeklyBudget(Math.max(0, Number(e.target.value) || 0))}
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }} />
          <span className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
            ~$2k/wk is baseline. Starved projects decay.
          </span>
        </label>
        <button
          onClick={() => { start({ name, category, weeklyBudget }); setName(""); }}
          className="themed-pill"
          style={{ padding: "10px 14px", fontSize: 14, background: "var(--color-accent)", color: "#fff", cursor: "pointer" }}
        >
          Start project
        </button>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Active projects <span className="tag">{oss.length}</span></h2>
      {oss.length === 0 && (
        <div className="themed-card" style={{ padding: 14, color: "var(--color-ink-2)", fontSize: 13 }}>None yet.</div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {oss.map(p => (
          <div key={p.id} className="themed-card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
              <span className="themed-pill" style={{ fontSize: 10 }}>⭐ {p.stars.toLocaleString()}</span>
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6 }}>
              {p.category} · started wk {p.startedWeek} · {money(p.weeklyBudget, { short: true })}/wk
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setBudget(p.id, Math.max(0, p.weeklyBudget + 1000))}
                className="themed-pill" style={{ fontSize: 12, padding: "6px 10px", cursor: "pointer" }}
              >
                +$1k/wk
              </button>
              <button
                onClick={() => setBudget(p.id, Math.max(0, p.weeklyBudget - 1000))}
                className="themed-pill" style={{ fontSize: 12, padding: "6px 10px", cursor: "pointer" }}
              >
                −$1k/wk
              </button>
              <button
                onClick={() => stop(p.id)}
                className="themed-pill" style={{ fontSize: 12, padding: "6px 10px", cursor: "pointer", background: "var(--color-bad)", color: "#fff" }}
              >
                Archive project
              </button>
            </div>
          </div>
        ))}
      </div>

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
