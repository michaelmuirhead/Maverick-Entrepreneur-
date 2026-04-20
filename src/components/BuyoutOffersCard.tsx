"use client";
import { useState } from "react";
import { useGame } from "@/game/store";
import { money } from "@/lib/format";
import type { BuyoutOffer } from "@/game/types";

/**
 * Banner that surfaces incoming buyout offers targeting the player. Renders
 * nothing if there are no active offers. Each offer has accept/decline buttons
 * — Accept is guarded behind a confirm step because it ends the run. The
 * component reads state via the store so it can live on any page (HQ, Market).
 */
export function BuyoutOffersCard({ compact = false }: { compact?: boolean }) {
  const state = useGame(s => s.state);
  const offers = state?.buyoutOffers ?? [];
  if (!state || offers.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 8, marginTop: compact ? 8 : 12 }}>
      {offers.map(o => (
        <BuyoutOfferRow key={o.id} offer={o} week={state.week} compact={compact} />
      ))}
    </div>
  );
}

function BuyoutOfferRow({ offer, week, compact }: {
  offer: BuyoutOffer;
  week: number;
  compact: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const accept = useGame(s => s.acceptBuyoutOffer);
  const decline = useGame(s => s.declineBuyoutOffer);
  const weeksLeft = Math.max(0, offer.expiresWeek - week);
  const premiumPct = Math.round((offer.premiumMultiple - 1) * 100);

  return (
    <div className="themed-card" style={{
      padding: "12px 14px",
      borderColor: "var(--color-accent)",
      borderWidth: 4,
      display: "grid", gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: compact ? 13 : 14 }}>
            📨 Buyout offer · {offer.acquirerName}
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
            W{offer.week} · expires W{offer.expiresWeek} ({weeksLeft}w left)
          </div>
        </div>
        <span className="themed-pill" style={{ background: "var(--color-accent)", color: "#fff" }}>
          +{premiumPct}%
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Metric label="Price" value={money(offer.price, { short: true })} strong />
        <Metric label="Fair" value={money(offer.fairValuation, { short: true })} />
        <Metric label="Multiple" value={`${offer.premiumMultiple.toFixed(2)}×`} />
        <Metric label="Window" value={`${weeksLeft}w`} />
      </div>

      {!compact && (
        <div style={{ fontSize: 12, color: "var(--color-ink-2)", lineHeight: 1.45 }}>
          {offer.narrative} Accepting ends the run with a game-over-via-success banner and the cash is recorded to your portfolio.
        </div>
      )}

      {!confirming ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            className="themed-btn"
            style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700 }}
            onClick={() => decline(offer.id)}
          >
            Decline
          </button>
          <button
            className="themed-btn"
            style={{
              padding: "8px 12px", fontSize: 13, fontWeight: 700,
              background: "var(--color-good)", color: "#fff",
            }}
            onClick={() => setConfirming(true)}
          >
            Accept offer
          </button>
        </div>
      ) : (
        <div style={{
          padding: 10, border: "2px dashed var(--color-accent)", borderRadius: 8,
          background: "var(--color-surface-2)", display: "grid", gap: 6,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            Sell for {money(offer.price, { short: true })} and end the run?
          </div>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
            This is irreversible. You'll see an exit banner and the game will stop
            advancing. Your exit is a win — but the keys belong to {offer.acquirerName}.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
            <button
              className="themed-btn"
              style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700 }}
              onClick={() => setConfirming(false)}
            >
              Wait
            </button>
            <button
              className="themed-btn"
              style={{
                padding: "8px 12px", fontSize: 13, fontWeight: 700,
                background: "var(--color-good)", color: "#fff",
              }}
              onClick={() => accept(offer.id)}
            >
              Yes, sell the company
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>{label}</div>
      <div className="mono" style={{ fontSize: strong ? 16 : 13, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
