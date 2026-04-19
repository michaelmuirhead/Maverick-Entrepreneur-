"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { PRODUCT_CATEGORIES, ProductCategory } from "@/game/types";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { ProductList } from "@/components/ProductList";
import { money } from "@/lib/format";

export default function ProductsPage() {
  const state = useGame(s => s.state);
  const designNew = useGame(s => s.designNewProduct);
  const setBudget = useGame(s => s.setDevBudget);
  const sunset = useGame(s => s.sunsetProduct);
  const assign = useGame(s => s.assignEngineer);
  const unassign = useGame(s => s.unassignEngineer);
  const hydrate = useGame(s => s.hydrate);
  const hydrated = useGame(s => s.hydrated);
  const [designing, setDesigning] = useState(false);

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <div className="app-shell" style={{ padding: 40 }}>Loading…</div>;

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Products</h1>
      <p style={{ color: "var(--color-ink-2)", fontSize: 13, margin: "0 4px 14px" }}>
        Design new products, adjust dev budgets, assign engineers. Every product ages; plan replacements before they go cold.
      </p>

      <button
        onClick={() => setDesigning(true)}
        className="themed-card"
        style={{ width: "100%", padding: 14, background: "var(--color-surface-2)", fontWeight: 700, fontSize: 15 }}
      >+ Design a new product</button>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Portfolio</h2>
      <ProductList />

      <h2 className="sec-head" style={{ marginTop: 18 }}>Assignments</h2>
      <div className="themed-card" style={{ padding: 14 }}>
        {state.products.filter(p => p.stage !== "eol").map(p => (
          <div key={p.id} style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{p.name} <span className="mono" style={{ color: "var(--color-ink-2)", fontSize: 11, fontWeight: 600 }}>· {p.stage}</span></div>
            {p.stage !== "eol" && (
              <>
                <label style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
                  Dev budget: {money(p.devBudget, { short: true })}/wk
                </label>
                <input type="range" min={0} max={20000} step={500}
                  value={p.devBudget} onChange={(e) => setBudget(p.id, parseInt(e.target.value))}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </>
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-ink-2)" }}>Engineers:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {state.employees
                .filter(e => e.role === "engineer" || e.role === "founder")
                .map(e => {
                  const on = p.assignedEngineers.includes(e.id);
                  return (
                    <button key={e.id}
                      onClick={() => on ? unassign(p.id, e.id) : assign(p.id, e.id)}
                      className="themed-pill"
                      style={{
                        background: on ? "var(--color-accent)" : "var(--color-surface-2)",
                        color: on ? "#fff" : "var(--color-ink)",
                        cursor: "pointer",
                      }}
                    >{e.name}</button>
                  );
                })}
            </div>
            {p.stage !== "eol" && p.stage !== "concept" && (
              <button onClick={() => sunset(p.id)} style={{
                marginTop: 8, fontSize: 11, color: "var(--color-bad)", textDecoration: "underline",
              }}>Sunset this product</button>
            )}
          </div>
        ))}
      </div>

      {designing && <NewProductModal onClose={() => setDesigning(false)} onConfirm={(n, c, pr) => { designNew(n, c, pr); setDesigning(false); }} />}

      <AdvanceButton />
      <TabBar />
    </main>
  );
}

function NewProductModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (name: string, cat: ProductCategory, price: number) => void }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState<ProductCategory>("productivity");
  const [price, setPrice] = useState(19);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50,
      display: "grid", placeItems: "end center", padding: 16,
    }} onClick={onClose}>
      <div className="themed-card" style={{ padding: 16, maxWidth: 380, width: "100%", background: "var(--color-surface)" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 10px", fontFamily: "var(--font-display)", fontSize: 18 }}>Design new product</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <label>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Name (optional)</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Leave blank for a suggestion"
              style={{ width: "100%", padding: "10px 12px", border: "var(--border-card)", borderRadius: "var(--radius-card)", background: "var(--color-surface)", fontFamily: "var(--font-sans)", fontSize: 15 }} />
          </label>
          <label>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Category</div>
            <select value={cat} onChange={e => setCat(e.target.value as ProductCategory)}
              style={{ width: "100%", padding: "10px 12px", border: "var(--border-card)", borderRadius: "var(--radius-card)", background: "var(--color-surface)", fontFamily: "var(--font-sans)", fontSize: 15 }}>
              {PRODUCT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Price per user: ${price}/mo</div>
            <input type="range" min={5} max={199} step={1} value={price} onChange={e => setPrice(parseInt(e.target.value))} style={{ width: "100%" }} />
          </label>
          <p style={{ fontSize: 12, color: "var(--color-ink-2)", margin: 0 }}>
            Concept starts at 0% built. Set a dev budget and assign engineers on the Products screen to ship it.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button onClick={onClose} className="themed-card" style={{ flex: 1, padding: 12, fontWeight: 700 }}>Cancel</button>
            <button onClick={() => onConfirm(name, cat, price)} className="themed-card" style={{ flex: 1, padding: 12, fontWeight: 700, background: "var(--color-accent)", color: "#fff", borderColor: "var(--color-line)" }}>Add to roadmap</button>
          </div>
        </div>
      </div>
    </div>
  );
}
