"use client";
import { useGame } from "@/game/store";
import { describePlatformOffer } from "@/game/studio/platforms";
import { money } from "@/lib/format";

/**
 * HQ card for pending platform deal offers + review-bomb crises. The player
 * needs to see these the instant they hit because both are time-sensitive —
 * offers expire, and every week a review bomb lingers costs hype + sales.
 */
export function StudioOffersCard() {
  const offers = useGame(s => s.activeStudioVenture?.platformOffers ?? []);
  const games = useGame(s => s.activeStudioVenture?.games ?? []);
  const week = useGame(s => s.activeStudioVenture?.week ?? 0);

  const acceptOffer = useGame(s => s.acceptStudioPlatformOffer);
  const declineOffer = useGame(s => s.declineStudioPlatformOffer);
  const respondBomb = useGame(s => s.respondToStudioReviewBomb);

  const bombed = games.filter(g => g.reviewBomb);
  const activeOffers = offers.filter(o => o.expiresWeek > week);

  if (activeOffers.length === 0 && bombed.length === 0) return null;

  return (
    <div className="themed-card" style={{ padding: "12px 14px", display: "grid", gap: 10 }}>
      {activeOffers.map(o => {
        const game = games.find(g => g.id === o.targetGameId);
        return (
          <div key={o.id} style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, color: "var(--color-accent)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
              📬 Platform offer · {o.platform}
            </div>
            <div style={{ fontSize: 13 }}>
              <strong>{game?.title ?? "Unknown game"}</strong> · {describePlatformOffer(o)}
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600 }}>
              {money(o.upfrontPayment, { short: true })} upfront · expires W{o.expiresWeek}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
              <button onClick={() => acceptOffer(o.id)} style={acceptBtnStyle}>Accept</button>
              <button onClick={() => declineOffer(o.id)} style={declineBtnStyle}>Decline</button>
            </div>
          </div>
        );
      })}
      {bombed.map(g => (
        <div key={`bomb-${g.id}`} style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 11, color: "var(--color-bad)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
            🚨 Review bomb · {g.title}
          </div>
          <div style={{ fontSize: 13 }}>
            {g.reviewBomb?.reason}. Severity {Math.round((g.reviewBomb?.severity ?? 0) * 100)} / 100.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => respondBomb(g.id, "apology")} style={smallBtnStyle}>Apology · $10k</button>
            <button onClick={() => respondBomb(g.id, "compensation")} style={smallBtnStyle}>Compensation · $75k</button>
            <button onClick={() => respondBomb(g.id, "rollback")} style={smallBtnStyle}>Rollback · $250k</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const acceptBtnStyle: React.CSSProperties = {
  background: "var(--color-accent)", color: "#fff",
  border: "var(--border-card)", borderRadius: "var(--radius-card)",
  padding: "6px 12px", fontWeight: 700, fontSize: 12,
};
const declineBtnStyle: React.CSSProperties = {
  background: "var(--color-surface)", color: "var(--color-ink)",
  border: "var(--border-card)", borderRadius: "var(--radius-card)",
  padding: "6px 12px", fontWeight: 700, fontSize: 12,
};
const smallBtnStyle: React.CSSProperties = {
  background: "var(--color-surface-2)", color: "var(--color-ink)",
  border: "var(--border-card)", borderRadius: "var(--radius-card)",
  padding: "6px 10px", fontWeight: 700, fontSize: 11,
};
