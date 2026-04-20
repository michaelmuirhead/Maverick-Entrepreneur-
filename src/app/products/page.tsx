"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { ArchivedProduct, PRODUCT_CATEGORIES, Product, ProductCategory, RevenueModel } from "@/game/types";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { ProductList } from "@/components/ProductList";
import { canStartNextVersion, majorVersion } from "@/game/products";
import { teamEffects, summarizeTeam } from "@/game/roles";
import { debtLabel, isRefactorActive, refactorWeeklyCost } from "@/game/debt";
import { money } from "@/lib/format";

export default function ProductsPage() {
  const state = useGame(s => s.state);
  const designNew = useGame(s => s.designNewProduct);
  const setBudget = useGame(s => s.setDevBudget);
  const setMarketing = useGame(s => s.setMarketingBudget);
  const sunset = useGame(s => s.sunsetProduct);
  const assign = useGame(s => s.assignEngineer);
  const unassign = useGame(s => s.unassignEngineer);
  const startVNext = useGame(s => s.startProductNextVersion);
  const cancelVNext = useGame(s => s.cancelProductNextVersion);
  const startRefactor = useGame(s => s.startRefactorSprint);
  const cancelRefactor = useGame(s => s.cancelRefactorSprint);
  const hydrate = useGame(s => s.hydrate);
  const hydrated = useGame(s => s.hydrated);
  const [designing, setDesigning] = useState(false);
  const [vNextTarget, setVNextTarget] = useState<Product | null>(null);
  const [showArchive, setShowArchive] = useState(false);

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
        {state.products.filter(p => p.stage !== "eol").map((p, idx, arr) => (
          <div key={p.id} style={{
            paddingTop: idx === 0 ? 0 : 14,
            marginTop: idx === 0 ? 0 : 14,
            borderTop: idx === 0 ? 0 : "2px dashed var(--color-line)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <div style={{ fontWeight: 700 }}>
                {p.name}{" "}
                <span className="mono" style={{ color: "var(--color-ink-2)", fontSize: 11, fontWeight: 600 }}>
                  v{p.version} · {p.stage}
                </span>
              </div>
              {["launched", "mature", "declining"].includes(p.stage) && (
                <span className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)" }}>
                  health {Math.round(p.health)} · quality {Math.round(p.quality)}
                </span>
              )}
            </div>
            {p.stage !== "eol" && (
              <>
                <label style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
                  Dev budget: {money(p.devBudget, { short: true })}/wk
                </label>
                <input type="range" min={0} max={20000} step={500}
                  value={p.devBudget} onChange={(e) => setBudget(p.id, parseInt(e.target.value))}
                  style={{ width: "100%", marginTop: 4 }}
                />
                {["launched", "mature", "declining"].includes(p.stage) && (
                  <>
                    <label style={{ display: "block", marginTop: 10, fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
                      Marketing: {money(p.marketingBudget ?? 0, { short: true })}/wk
                    </label>
                    <input type="range" min={0} max={20000} step={250}
                      value={p.marketingBudget ?? 0} onChange={(e) => setMarketing(p.id, parseInt(e.target.value))}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </>
                )}
              </>
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-ink-2)" }}>
              Team{" "}
              <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
                · {summarizeTeam(teamEffects(p.assignedEngineers, state.employees))}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {state.employees.map(e => {
                const on = p.assignedEngineers.includes(e.id);
                const roleHint = e.role === "founder" ? (e.archetype ?? "founder") : e.role;
                return (
                  <button key={e.id}
                    onClick={() => on ? unassign(p.id, e.id) : assign(p.id, e.id)}
                    className="themed-pill"
                    style={{
                      background: on ? "var(--color-accent)" : "var(--color-surface-2)",
                      color: on ? "#fff" : "var(--color-ink)",
                      cursor: "pointer",
                    }}
                    title={`${e.name} · ${roleHint}`}
                  >
                    {e.name}
                    <span
                      className="mono"
                      style={{ marginLeft: 6, fontSize: 9, opacity: 0.75, textTransform: "uppercase" }}
                    >
                      {roleHint.slice(0, 3)}
                    </span>
                  </button>
                );
              })}
            </div>
            {p.nextVersion && (
              <div style={{
                marginTop: 10,
                padding: "10px 12px",
                border: "var(--border-card)",
                borderRadius: "var(--radius-card)",
                background: "var(--color-surface-2)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    Building {p.nextVersion.targetVersion}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
                    {Math.round(p.nextVersion.progress)}% · {money(p.nextVersion.devBudget, { short: true })}/wk
                  </div>
                </div>
                <div style={{
                  marginTop: 6, height: 6, background: "var(--color-soft)",
                  border: "2px solid var(--color-line)", borderRadius: 4, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.max(2, p.nextVersion.progress)}%`,
                    background: "var(--color-accent)",
                  }} />
                </div>
              </div>
            )}
            {["dev", "launched", "mature", "declining"].includes(p.stage) && (
              <DebtPanel
                product={p}
                currentWeek={state.week}
                onStart={(weeks) => startRefactor(p.id, weeks)}
                onCancel={() => cancelRefactor(p.id)}
                weeklyCost={refactorWeeklyCost(p, teamEffects(p.assignedEngineers, state.employees))}
              />
            )}

            <div style={{ display: "flex", gap: 14, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              {!p.nextVersion && canStartNextVersion(p) && (
                <button
                  onClick={() => setVNextTarget(p)}
                  className="themed-pill"
                  style={{
                    background: p.health < 55 ? "var(--color-warn)" : "var(--color-good)",
                    color: "#fff", padding: "6px 12px", fontSize: 12, fontWeight: 700,
                  }}
                >
                  Start v{majorVersion(p.version) + 1}
                  {p.health < 55 && " — aging"}
                </button>
              )}
              {p.nextVersion && (
                <button onClick={() => cancelVNext(p.id)} style={{
                  fontSize: 11, color: "var(--color-bad)", textDecoration: "underline",
                }}>Cancel {p.nextVersion.targetVersion} build</button>
              )}
              {p.stage !== "eol" && p.stage !== "concept" && (
                <button onClick={() => sunset(p.id)} style={{
                  fontSize: 11, color: "var(--color-bad)", textDecoration: "underline",
                }}>Sunset this product</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {state.archivedProducts.length > 0 && (
        <>
          <h2 className="sec-head" style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Archive <span className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>({state.archivedProducts.length})</span></span>
            <button
              onClick={() => setShowArchive(s => !s)}
              style={{ fontSize: 11, color: "var(--color-ink-2)", textDecoration: "underline", fontWeight: 600 }}
            >{showArchive ? "Hide" : "Show"}</button>
          </h2>
          {showArchive && (
            <div style={{ display: "grid", gap: 10 }}>
              {state.archivedProducts.map(a => <ArchiveCard key={a.id} arch={a} />)}
            </div>
          )}
        </>
      )}

      {designing && <NewProductModal onClose={() => setDesigning(false)} onConfirm={(n, c, pr) => { designNew(n, c, pr); setDesigning(false); }} />}
      {vNextTarget && (
        <NextVersionModal
          product={vNextTarget}
          onClose={() => setVNextTarget(null)}
          onConfirm={(budget) => { startVNext(vNextTarget.id, budget); setVNextTarget(null); }}
        />
      )}

      <AdvanceButton />
      <TabBar />
    </main>
  );
}

const REVENUE_MODEL_LABEL: Record<RevenueModel, string> = {
  subscription: "Subscription",
  "one-time":   "One-time",
  contract:     "Contract",
  freemium:     "Freemium",
};

function NewProductModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (name: string, cat: ProductCategory, price: number) => void }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState<ProductCategory>("application");
  const selectedMeta = PRODUCT_CATEGORIES.find(c => c.id === cat)!;
  const [price, setPrice] = useState(selectedMeta.suggestedPrice);

  // When the category changes, snap the price slider to that category's suggested default.
  // Players can still override, but the starting value gives a sensible anchor.
  const handleCat = (id: ProductCategory) => {
    const meta = PRODUCT_CATEGORIES.find(c => c.id === id)!;
    setCat(id);
    setPrice(meta.suggestedPrice);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50,
      display: "grid", placeItems: "end center", padding: 16,
    }} onClick={onClose}>
      <div
        className="themed-card"
        style={{
          padding: 16, maxWidth: 420, width: "100%",
          background: "var(--color-surface)", maxHeight: "85vh", overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 10px", fontFamily: "var(--font-display)", fontSize: 18 }}>Design new product</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <label>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Name (optional)</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Leave blank for a suggestion"
              style={{ width: "100%", padding: "10px 12px", border: "var(--border-card)", borderRadius: "var(--radius-card)", background: "var(--color-surface)", fontFamily: "var(--font-sans)", fontSize: 15 }} />
          </label>

          <div>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Category</div>
            <div style={{ display: "grid", gap: 6 }}>
              {PRODUCT_CATEGORIES.map(c => {
                const active = c.id === cat;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleCat(c.id)}
                    className="themed-card"
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      background: active ? "var(--color-surface-2)" : "var(--color-surface)",
                      borderColor: active ? "var(--color-accent)" : "var(--color-line)",
                      display: "grid",
                      gap: 3,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</span>
                      <span className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600 }}>
                        ~${c.suggestedPrice}/mo
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-ink-2)", lineHeight: 1.35 }}>{c.blurb}</div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", letterSpacing: ".04em", marginTop: 2 }}>
                      {REVENUE_MODEL_LABEL[c.revenueModel]} · ~{c.devWeeksBase}w build · min {c.teamSizeMin} eng
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              padding: "10px 12px",
              border: "var(--border-card)",
              borderRadius: "var(--radius-card)",
              background: "var(--color-surface-2)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{selectedMeta.label}</div>
            <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--color-ink-2)" }}>
              {selectedMeta.detail}
            </div>
          </div>

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

function NextVersionModal({
  product, onClose, onConfirm,
}: {
  product: Product;
  onClose: () => void;
  onConfirm: (weeklyBudget: number) => void;
}) {
  const nextMajor = majorVersion(product.version) + 1;
  const [budget, setBudget] = useState(Math.max(2000, Math.round((product.devBudget || 2000) * 1.2)));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50,
      display: "grid", placeItems: "end center", padding: 16,
    }} onClick={onClose}>
      <div
        className="themed-card"
        style={{
          padding: 16, maxWidth: 420, width: "100%",
          background: "var(--color-surface)", maxHeight: "85vh", overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontSize: 18 }}>
          Start {product.name} v{nextMajor}
        </h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--color-ink-2)", lineHeight: 1.4 }}>
          Rebuild the core, restore health, bump quality. Ships in roughly 10–20 weeks depending on
          engineers and budget. While it's in flight, the current version keeps running and earning.
        </p>
        <label>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
            vNext dev budget: {money(budget, { short: true })}/wk
          </div>
          <input
            type="range" min={1000} max={20000} step={500}
            value={budget} onChange={(e) => setBudget(parseInt(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <p style={{ fontSize: 12, color: "var(--color-ink-2)", margin: "10px 0 0", lineHeight: 1.45 }}>
          Engineers already on {product.name} contribute to this build. More engineers = faster ship.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onClose} className="themed-card" style={{ flex: 1, padding: 12, fontWeight: 700 }}>Cancel</button>
          <button onClick={() => onConfirm(budget)} className="themed-card" style={{
            flex: 1, padding: 12, fontWeight: 700, background: "var(--color-good)", color: "#fff", borderColor: "var(--color-line)",
          }}>Start v{nextMajor}</button>
        </div>
      </div>
    </div>
  );
}

const VERDICT_TONE: Record<ArchivedProduct["verdict"], { label: string; bg: string; fg: string }> = {
  hit:       { label: "HIT",        bg: "var(--color-good)", fg: "#fff" },
  solid:     { label: "SOLID",      bg: "var(--color-accent)", fg: "#fff" },
  meh:       { label: "MEH",        bg: "var(--color-soft)", fg: "var(--color-ink)" },
  flop:      { label: "FLOP",       bg: "var(--color-warn)", fg: "#fff" },
  stillborn: { label: "UNSHIPPED",  bg: "var(--color-bad)",  fg: "#fff" },
};

function ArchiveCard({ arch }: { arch: ArchivedProduct }) {
  const v = VERDICT_TONE[arch.verdict];
  const net = arch.lifetimeRevenue - arch.lifetimeCost;
  const finalTotal = arch.finalUsers.enterprise + arch.finalUsers.smb + arch.finalUsers.selfServe;
  return (
    <div
      className="themed-card"
      style={{ padding: 12, display: "grid", gap: 8, background: "var(--color-surface)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {arch.name}
          <span className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, marginLeft: 8 }}>
            v{arch.finalVersion} · {arch.category}
          </span>
        </div>
        <span
          className="themed-pill"
          style={{ background: v.bg, color: v.fg, fontWeight: 700, letterSpacing: ".04em" }}
        >{v.label}</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 6,
          fontSize: 12,
          color: "var(--color-ink-2)",
        }}
      >
        <div><span className="mono" style={{ color: "var(--color-ink)", fontWeight: 700 }}>{arch.peakUsers.toLocaleString()}</span> peak users</div>
        <div><span className="mono" style={{ color: "var(--color-ink)", fontWeight: 700 }}>{money(arch.peakMrr, { short: true })}</span> peak MRR</div>
        <div><span className="mono" style={{ color: "var(--color-good)", fontWeight: 700 }}>{money(arch.lifetimeRevenue, { short: true })}</span> earned</div>
        <div><span className="mono" style={{ color: "var(--color-bad)", fontWeight: 700 }}>{money(arch.lifetimeCost, { short: true })}</span> spent</div>
        <div>
          Net{" "}
          <span
            className="mono"
            style={{
              color: net >= 0 ? "var(--color-good)" : "var(--color-bad)",
              fontWeight: 700,
            }}
          >
            {net >= 0 ? "+" : "-"}{money(Math.abs(net), { short: true })}
          </span>
        </div>
        <div>
          Closed{" "}
          <span className="mono" style={{ color: "var(--color-ink)", fontWeight: 700 }}>W{arch.archivedWeek}</span>{" "}
          · {arch.closedReason === "preLaunch" ? "unshipped" : arch.closedReason === "decayed" ? "aged out" : "sunset"}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--color-ink-2)", lineHeight: 1.45 }}>
        {arch.narrative}
      </div>

      {finalTotal > 0 && (
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
          Final roster · {arch.finalUsers.enterprise.toLocaleString()} ent · {arch.finalUsers.smb.toLocaleString()} SMB · {arch.finalUsers.selfServe.toLocaleString()} self-serve
        </div>
      )}
    </div>
  );
}

/**
 * Technical debt bar + refactor sprint controls for a single product card.
 * Shows debt as a 0..100 bar, labels the current state, and lets the player
 * launch or cancel a refactor sprint while dev/live.
 */
function DebtPanel({
  product, currentWeek, onStart, onCancel, weeklyCost,
}: {
  product: Product;
  currentWeek: number;
  onStart: (weeks: number) => void;
  onCancel: () => void;
  weeklyCost: number;
}) {
  const debt = product.techDebt ?? 0;
  const pct = Math.max(2, Math.min(100, debt));
  const color =
    debt >= 80 ? "var(--color-bad)" :
    debt >= 60 ? "var(--color-warn)" :
    debt >= 40 ? "var(--color-accent)" :
                 "var(--color-good)";
  const active = isRefactorActive(product, currentWeek);
  const weeksLeft = active && typeof product.refactorSprintUntil === "number"
    ? Math.max(0, product.refactorSprintUntil - currentWeek)
    : 0;
  const [plannedWeeks, setPlannedWeeks] = useState(4);

  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        border: "var(--border-card)",
        borderRadius: "var(--radius-card)",
        background: "var(--color-surface-2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          Tech debt
          <span className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginLeft: 8, fontWeight: 600 }}>
            {Math.round(debt)}/100 · {debtLabel(debt)}
          </span>
        </div>
        {active && (
          <span className="mono" style={{ fontSize: 10, color: "var(--color-accent)", fontWeight: 700, textTransform: "uppercase" }}>
            Refactoring · {weeksLeft}w left
          </span>
        )}
      </div>
      <div style={{
        marginTop: 6, height: 6, background: "var(--color-soft)",
        border: "2px solid var(--color-line)", borderRadius: 4, overflow: "hidden",
      }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color }} />
      </div>

      {active ? (
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
            Velocity halved. Paying ~{money(weeklyCost, { short: true })}/wk extra.
          </span>
          <button
            onClick={onCancel}
            style={{ fontSize: 11, color: "var(--color-bad)", textDecoration: "underline" }}
          >Cancel sprint</button>
        </div>
      ) : (
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          <label style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600 }}>
            Refactor sprint: {plannedWeeks} week{plannedWeeks === 1 ? "" : "s"} · ~{money(weeklyCost * plannedWeeks, { short: true })} total
          </label>
          <input
            type="range" min={1} max={12} step={1}
            value={plannedWeeks} onChange={e => setPlannedWeeks(parseInt(e.target.value))}
            style={{ width: "100%" }}
          />
          <button
            onClick={() => onStart(plannedWeeks)}
            className="themed-pill"
            style={{
              alignSelf: "start",
              background: debt >= 60 ? "var(--color-warn)" : "var(--color-accent)",
              color: "#fff", padding: "5px 10px", fontSize: 11, fontWeight: 700,
            }}
            title="Pays down debt fast at the cost of velocity + weekly cash."
          >
            Start refactor sprint
          </button>
        </div>
      )}
    </div>
  );
}
