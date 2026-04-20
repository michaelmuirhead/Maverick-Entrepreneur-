"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { CHANNELS, campaignMultiplierNow } from "@/game/campaigns";
import type { MarketingChannel, ProductCategory } from "@/game/types";
import { money } from "@/lib/format";

export default function CampaignsPage() {
  const state = useGame(s => s.state);
  const hydrated = useGame(s => s.hydrated);
  const hydrate = useGame(s => s.hydrate);
  const launch = useGame(s => s.launchCampaign);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<MarketingChannel>("social");
  const [productId, setProductId] = useState<string>("");
  const [budget, setBudget] = useState<number>(20_000);

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  useEffect(() => {
    if (!productId && state?.products[0]) setProductId(state.products[0].id);
  }, [state, productId]);

  const product = useMemo(
    () => state?.products.find(p => p.id === productId),
    [state, productId],
  );

  if (!state) return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;

  const channelInfo = CHANNELS[channel];
  const channelFits: ProductCategory[] = channelInfo.goodFor;
  const live = (state.campaigns ?? []).filter(c => state.week - c.startedWeek < c.durationWeeks);
  const canAfford = state.finance.cash >= budget;
  const belowMin = budget < channelInfo.minBudget;

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <Link href="/growth" className="mono" style={{ color: "var(--color-ink-2)", fontSize: 12 }}>← Growth</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Marketing campaigns</h1>

      <h2 className="sec-head">Launch a campaign</h2>
      <div className="themed-card" style={{ padding: 14, display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Spring launch push"
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }} />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Channel</span>
          <select value={channel} onChange={e => setChannel(e.target.value as MarketingChannel)}
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }}>
            {Object.values(CHANNELS).map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "var(--color-ink-2)" }}>{channelInfo.blurb}</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
            Min budget {money(channelInfo.minBudget, { short: true })} · Duration {channelInfo.duration[0]}–{channelInfo.duration[1]} wk
          </span>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Product</span>
          <select value={productId} onChange={e => setProductId(e.target.value)}
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }}>
            {state.products.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
            ))}
          </select>
          {product && !channelFits.includes(product.category) && (
            <span style={{ fontSize: 11, color: "var(--color-warn, #b86b00)" }}>
              ⚠️ {channel} is typically off-fit for {product.category}. Expect reduced lift.
            </span>
          )}
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Total budget</span>
          <input type="number" min={0} value={budget} onChange={e => setBudget(Math.max(0, Number(e.target.value) || 0))}
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }} />
          <span className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>Cash available: {money(state.finance.cash, { short: true })}</span>
          {belowMin && <span style={{ fontSize: 11, color: "var(--color-warn, #b86b00)" }}>Below channel minimum — mostly wasted spend.</span>}
          {!canAfford && <span style={{ fontSize: 11, color: "var(--color-bad)" }}>Not enough cash.</span>}
        </label>

        <button
          onClick={() => {
            if (!productId) return;
            const id = launch({ name, channel, productId, budget });
            if (id) { setName(""); }
          }}
          disabled={!canAfford || budget <= 0 || !productId}
          className="themed-pill"
          style={{
            padding: "10px 14px", fontSize: 14, cursor: "pointer",
            background: (!canAfford || budget <= 0) ? "var(--color-muted)" : "var(--color-accent)",
            color: "#fff",
          }}
        >
          Launch campaign
        </button>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Active campaigns <span className="tag">{live.length}</span></h2>
      {live.length === 0 && <div className="themed-card" style={{ padding: 14, color: "var(--color-ink-2)", fontSize: 13 }}>No active campaigns.</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {live.map(c => {
          const mult = campaignMultiplierNow(c, state.week);
          const age = state.week - c.startedWeek;
          const p = state.products.find(x => x.id === c.productId);
          return (
            <div key={c.id} className="themed-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <span className="themed-pill" style={{ fontSize: 10 }}>{c.channel}</span>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6, display: "grid", gap: 2 }}>
                <div>On: {p?.name ?? "—"} · Week {age + 1}/{c.durationWeeks}</div>
                <div>Current lift ×{mult.toFixed(2)} · Peak ×{c.peakMultiplier.toFixed(2)}</div>
                <div>Spend/wk {money(c.budget / c.durationWeeks, { short: true })} · Total {money(c.budget, { short: true })}</div>
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
