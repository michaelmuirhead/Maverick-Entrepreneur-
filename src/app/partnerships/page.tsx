"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { CATEGORY_INFO } from "@/game/categories";
import { weeklyPartnershipBurn } from "@/game/portfolio";
import type { Partnership, ProductCategory } from "@/game/types";
import { money } from "@/lib/format";

const KINDS: { id: Partnership["kind"]; label: string; blurb: string }[] = [
  { id: "integration",  label: "Integration",   blurb: "Technical tie-in. Small, sticky lift for one category." },
  { id: "reseller",     label: "Reseller",      blurb: "Another sales team pushes your product. Paid per week." },
  { id: "co-marketing", label: "Co-marketing",  blurb: "Joint launches, co-branded content. Usually free." },
  { id: "platform",     label: "Platform",      blurb: "You're listed on a bigger marketplace. Biggest lift." },
];

const KIND_DEFAULTS: Record<Partnership["kind"], { weeklyCost: number; signupMultiplier: number }> = {
  integration:  { weeklyCost: 1_000,  signupMultiplier: 1.05 },
  reseller:     { weeklyCost: 4_000,  signupMultiplier: 1.08 },
  "co-marketing": { weeklyCost: 0,    signupMultiplier: 1.04 },
  platform:     { weeklyCost: 2_500,  signupMultiplier: 1.12 },
};

export default function PartnershipsPage() {
  const state = useGame(s => s.state);
  const hydrated = useGame(s => s.hydrated);
  const hydrate = useGame(s => s.hydrate);
  const sign = useGame(s => s.signPartnership);
  const end = useGame(s => s.endPartnership);
  const [partnerName, setPartnerName] = useState("");
  const [kind, setKind] = useState<Partnership["kind"]>("integration");
  const [category, setCategory] = useState<ProductCategory>("application");
  const [weeklyCost, setWeeklyCost] = useState<number>(KIND_DEFAULTS.integration.weeklyCost);
  const [signupMultiplier, setSignupMultiplier] = useState<number>(KIND_DEFAULTS.integration.signupMultiplier);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);

  // When kind changes, reseed defaults so the user doesn't have to reason about it.
  useEffect(() => {
    const d = KIND_DEFAULTS[kind];
    setWeeklyCost(d.weeklyCost);
    setSignupMultiplier(d.signupMultiplier);
  }, [kind]);

  if (!state) return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;

  const partnerships = state.partnerships ?? [];
  const weeklyBurn = weeklyPartnershipBurn(partnerships);
  const kindInfo = KINDS.find(k => k.id === kind)!;

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <Link href="/growth" className="mono" style={{ color: "var(--color-ink-2)", fontSize: 12 }}>← Growth</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Partnerships</h1>

      <div className="themed-card" style={{ padding: 14 }}>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)" }}>
          Active · {partnerships.length} · Burn {money(weeklyBurn, { short: true })}/wk
        </div>
        <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 4 }}>
          Multiple partnerships in the same category stack with diminishing returns
          (70% on each successive one).
        </div>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Sign a partnership</h2>
      <div className="themed-card" style={{ padding: 14, display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Partner name</span>
          <input value={partnerName} onChange={e => setPartnerName(e.target.value)} placeholder="e.g. Stripe, Shopify, HubSpot"
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }} />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Kind</span>
          <select value={kind} onChange={e => setKind(e.target.value as Partnership["kind"])}
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }}>
            {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "var(--color-ink-2)" }}>{kindInfo.blurb}</span>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Benefits category</span>
          <select value={category} onChange={e => setCategory(e.target.value as ProductCategory)}
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }}>
            {Object.values(CATEGORY_INFO).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Weekly cost</span>
          <input type="number" min={0} value={weeklyCost}
            onChange={e => setWeeklyCost(Math.max(0, Number(e.target.value) || 0))}
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }} />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Signup multiplier</span>
          <input type="number" step={0.01} min={1} max={1.25} value={signupMultiplier}
            onChange={e => setSignupMultiplier(Math.max(1, Math.min(1.25, Number(e.target.value) || 1)))}
            style={{ padding: "8px 10px", border: "var(--border-card)", borderRadius: 8, background: "var(--color-bg)", color: "inherit" }} />
          <span className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
            ×{signupMultiplier.toFixed(2)} on {category} signups · +{Math.round((signupMultiplier - 1) * 100)}%
          </span>
        </label>

        <button
          onClick={() => {
            sign({ partnerName, kind, weeklyCost, signupMultiplier, benefitsCategory: category });
            setPartnerName("");
          }}
          className="themed-pill"
          style={{ padding: "10px 14px", fontSize: 14, background: "var(--color-accent)", color: "#fff", cursor: "pointer" }}
        >
          Sign partnership
        </button>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Active partnerships <span className="tag">{partnerships.length}</span></h2>
      {partnerships.length === 0 && (
        <div className="themed-card" style={{ padding: 14, color: "var(--color-ink-2)", fontSize: 13 }}>
          No partnerships yet. Pair up with a complementary company for incremental signups.
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {partnerships.map(p => (
          <div key={p.id} className="themed-card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{p.partnerName}</div>
              <span className="themed-pill" style={{ fontSize: 10 }}>{p.kind}</span>
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6, display: "grid", gap: 2 }}>
              <div>Benefits · {p.benefitsCategory} · ×{p.signupMultiplier.toFixed(2)}</div>
              <div>Since wk {p.startedWeek} · {p.weeklyCost > 0 ? `${money(p.weeklyCost, { short: true })}/wk` : "no cost"}</div>
            </div>
            <button
              onClick={() => end(p.id)}
              className="themed-pill"
              style={{
                marginTop: 10, padding: "6px 10px", fontSize: 12, cursor: "pointer",
                background: "var(--color-bad)", color: "#fff",
              }}
            >
              End partnership
            </button>
          </div>
        ))}
      </div>

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
