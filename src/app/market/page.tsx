"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { BuyoutOffersCard } from "@/components/BuyoutOffersCard";
import { PRODUCT_CATEGORIES, type Competitor, type OfferTier } from "@/game/types";
import { demandFor } from "@/game/market";
import { pressureOn } from "@/game/competitors";
import {
  competitorValuation,
  competitorRunway,
  isAcquirable,
  previewOffer,
} from "@/game/mergers";
import { money } from "@/lib/format";

export default function MarketPage() {
  const state = useGame(s => s.state);
  const hydrate = useGame(s => s.hydrate);
  const hydrated = useGame(s => s.hydrated);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <div className="app-shell" style={{ padding: 40 }}>Loading…</div>;

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Market</h1>

      {(state.buyoutOffers?.length ?? 0) > 0 && (
        <>
          <h2 className="sec-head">Inbound buyout offers <span className="tag">{state.buyoutOffers!.length}</span></h2>
          <BuyoutOffersCard />
        </>
      )}

      <h2 className="sec-head" style={{ marginTop: 18 }}>Active trends <span className="tag">{state.trends.length}</span></h2>
      <div className="themed-card">
        {state.trends.length === 0 ? (
          <div style={{ padding: 14, color: "var(--color-ink-2)" }}>No major shifts this week. The calm before the boom.</div>
        ) : state.trends.map((t, i) => (
          <div key={t.kind} style={{
            padding: "12px 14px", borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 700 }}>{t.label}</div>
              <span className="themed-pill" style={{ background: t.demandMultiplier >= 1 ? "var(--color-good)" : "var(--color-bad)" }}>
                {t.demandMultiplier >= 1 ? "+" : ""}{((t.demandMultiplier - 1) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 4 }}>
              Affects: {t.affects.join(", ")} · ends ~W{t.startedWeek + t.durationWeeks}
            </div>
          </div>
        ))}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Demand by category</h2>
      <div className="themed-card">
        {PRODUCT_CATEGORIES.map((c, i) => {
          const mult = demandFor(c.id, state.trends);
          const pressure = pressureOn(c.id, state.competitors);
          return (
            <div key={c.id} style={{
              padding: "12px 14px", borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
              display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center",
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
                  demand {mult.toFixed(2)}× · competition {(pressure*100).toFixed(0)}%
                </div>
              </div>
              <span className="themed-pill" style={{ background: mult >= 1 ? "var(--color-good)" : "var(--color-bad)" }}>
                {mult >= 1 ? "+" : ""}{((mult - 1) * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Competitors <span className="tag">{state.competitors.filter(c => c.stage !== "acquired" && c.stage !== "dead").length}</span></h2>
      <div className="themed-card">
        {state.competitors.map((c, i) => (
          <CompetitorRow key={c.id} c={c} first={i === 0} cash={state.finance.cash} />
        ))}
      </div>

      {state.deals.length > 0 && (
        <>
          <h2 className="sec-head" style={{ marginTop: 18 }}>Recent deals <span className="tag">{state.deals.length}</span></h2>
          <div className="themed-card">
            {state.deals.slice(0, 8).map((d, i) => (
              <div key={d.id} style={{
                padding: "12px 14px", borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {d.acquirerName} <span style={{ color: "var(--color-ink-2)", fontWeight: 400 }}>→</span> {d.targetName}
                  </div>
                  <span className="themed-pill" style={{ background: d.acquirerId === "player" ? "var(--color-good)" : "var(--color-muted)", color: "#fff" }}>
                    {money(d.pricePaid, { short: true })}
                  </span>
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 4 }}>
                  W{d.week} · {d.structure} · {d.premiumMultiple.toFixed(2)}× fair {money(d.fairValuation, { short: true })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AdvanceButton />
      <TabBar />
    </main>
  );
}

function stagePillColor(stage: Competitor["stage"]): string {
  switch (stage) {
    case "scrappy":   return "var(--color-muted)";
    case "growth":    return "var(--color-good)";
    case "mature":    return "var(--color-warn)";
    case "declining": return "var(--color-bad)";
    case "acquired":  return "var(--color-ink-2)";
    case "dead":      return "var(--color-ink-2)";
    default:          return "var(--color-muted)";
  }
}

function CompetitorRow({ c, first, cash }: { c: Competitor; first: boolean; cash: number }) {
  const [open, setOpen] = useState(false);
  const attempt = useGame(s => s.attemptAcquisition);
  const state = useGame(s => s.state);
  const acquirable = isAcquirable(c);
  const onCooldown = !!(c.rejectedOfferUntil && state && state.week < c.rejectedOfferUntil);
  const fairVal = acquirable ? competitorValuation(c, state?.economy) : 0;
  const runway = acquirable ? competitorRunway(c) : 0;
  const users = c.users ?? 0;
  const mrr = c.mrr ?? 0;
  const stage = c.stage ?? "scrappy";
  const stageLabel = stage.charAt(0).toUpperCase() + stage.slice(1);

  return (
    <div style={{
      padding: "12px 14px", borderTop: first ? 0 : "2px dashed var(--color-line)",
      opacity: acquirable ? 1 : 0.55,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700 }}>{c.name}</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
            {c.category} · strength {Math.round(c.strength)} · share {(c.marketShare * 100).toFixed(1)}%
          </div>
        </div>
        <span className="themed-pill" style={{ background: stagePillColor(stage), color: "#fff" }}>
          {stageLabel}
        </span>
      </div>

      {acquirable && (
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6 }}>
          {users.toLocaleString()} users · MRR {money(mrr, { short: true })} · runway {isFinite(runway) ? `${Math.round(runway)}w` : "∞"} · fair {money(fairVal, { short: true })}
        </div>
      )}

      {acquirable && (
        <div style={{ marginTop: 8 }}>
          {!open ? (
            <button
              className="themed-btn"
              style={{ fontSize: 12, padding: "6px 10px" }}
              onClick={() => setOpen(true)}
              disabled={onCooldown}
            >
              {onCooldown ? `Cooling off until W${c.rejectedOfferUntil}` : "Attempt acquisition"}
            </button>
          ) : (
            <div style={{
              marginTop: 4, padding: 10, border: "2px dashed var(--color-line)",
              borderRadius: 8, display: "grid", gap: 6,
            }}>
              {(["lowball", "fair", "premium"] as OfferTier[]).map(tier => {
                const preview = state ? previewOffer(state, c.id, tier) : null;
                if (!preview) return null;
                const canSubmit = preview.affordable && !preview.blockedReason;
                return (
                  <div key={tier} style={{
                    display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center",
                    padding: "6px 8px", background: "var(--color-muted-2, rgba(0,0,0,0.03))",
                    borderRadius: 6,
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, textTransform: "capitalize" }}>
                        {tier} · {money(preview.price, { short: true })}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 2 }}>
                        {(preview.premiumMultiple).toFixed(2)}× fair · {Math.round(preview.estimatedAcceptance * 100)}% accept
                        {!preview.affordable ? " · insufficient cash" : ""}
                      </div>
                    </div>
                    <button
                      className="themed-btn"
                      style={{
                        fontSize: 12, padding: "5px 10px",
                        background: canSubmit
                          ? (tier === "premium" ? "var(--color-good)" : tier === "lowball" ? "var(--color-warn)" : undefined)
                          : "var(--color-muted)",
                        color: canSubmit && (tier === "premium" || tier === "lowball") ? "#fff" : undefined,
                      }}
                      disabled={!canSubmit}
                      onClick={() => {
                        attempt(c.id, tier);
                        setOpen(false);
                      }}
                    >
                      Bid
                    </button>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)" }}>
                  Your cash: {money(cash, { short: true })}
                </div>
                <button
                  className="themed-btn"
                  style={{ fontSize: 11, padding: "4px 8px", background: "transparent" }}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!acquirable && stage === "acquired" && (
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6 }}>
          Acquired W{c.acquiredWeek} {c.acquiredBy === "player" ? "(by you)" : ""}
        </div>
      )}
      {!acquirable && stage === "dead" && (
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6 }}>
          Shut down.
        </div>
      )}
    </div>
  );
}
