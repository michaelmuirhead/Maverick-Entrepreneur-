"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { OFFICE_TIERS } from "@/game/office";
import { REGION_INFO } from "@/game/portfolio";
import { money } from "@/lib/format";

interface HubCard {
  href: string;
  title: string;
  glyph: string;
  /** Short pitch for what this section does. */
  blurb: string;
  /** A one-liner live status rendered on the card. */
  status: string;
  /** Optional CTA tag. */
  tag?: string;
}

export default function GrowthHub() {
  const state = useGame(s => s.state);
  const hydrated = useGame(s => s.hydrated);
  const hydrate = useGame(s => s.hydrate);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) {
    return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;
  }

  const officeTier = state.office?.tier ?? "garage";
  const officePending = state.office?.pendingUpgrade;
  const perksCount = state.culture?.perks.length ?? 0;
  const cultureScore = state.culture?.cultureScore ?? 40;
  const liveCampaigns = (state.campaigns ?? []).filter(c => state.week - c.startedWeek < c.durationWeeks).length;
  const regionsCount = (state.regions ?? []).length;
  const govCount = (state.govContracts ?? []).length;
  const patentsCount = (state.patents ?? []).length;
  const partnershipsCount = (state.partnerships ?? []).length;
  const ossCount = (state.openSource ?? []).length;
  const ipoStage = state.ipo?.stage ?? "none";
  const support = state.support?.quality ?? 80;

  const cards: HubCard[] = [
    {
      href: "/office",
      title: "Office",
      glyph: "🏢",
      blurb: "Upgrade your workspace. Bigger digs = higher capacity, morale, and prestige.",
      status: officePending
        ? `Moving to ${OFFICE_TIERS[officePending.toTier].label} in ${Math.max(0, officePending.readyWeek - state.week)} wk`
        : OFFICE_TIERS[officeTier].label,
      tag: officePending ? "build-out" : undefined,
    },
    {
      href: "/culture",
      title: "Culture & perks",
      glyph: "🎁",
      blurb: "Stack perks to lift morale, cut attrition, and improve recruiting appeal.",
      status: `${perksCount} perks active · score ${cultureScore}`,
    },
    {
      href: "/campaigns",
      title: "Marketing campaigns",
      glyph: "📣",
      blurb: "Fire off discrete campaigns on top of your ongoing ad spend. Hit or miss.",
      status: liveCampaigns > 0 ? `${liveCampaigns} campaign${liveCampaigns === 1 ? "" : "s"} running` : "No active campaigns",
    },
    {
      href: "/support",
      title: "Support",
      glyph: "🎧",
      blurb: "Ops + PM + founder time keeps users happy. Drop below 50 and churn spikes.",
      status: `Quality ${support}/100`,
    },
    {
      href: "/regions",
      title: "Regional expansion",
      glyph: "🌐",
      blurb: "Open EMEA, APAC, LATAM offices. Localization takes time but lifts global signups.",
      status: `${regionsCount} / 4 regions live`,
    },
    {
      href: "/patents",
      title: "Patents & IP",
      glyph: "📜",
      blurb: "File patents to slow down feature-clone attacks from AI competitors.",
      status: `${patentsCount} on file`,
    },
    {
      href: "/oss",
      title: "Open source",
      glyph: "🐙",
      blurb: "Sponsor popular libraries. Burn cash, get recruiting love from engineers.",
      status: ossCount > 0 ? `${ossCount} project${ossCount === 1 ? "" : "s"} sponsored` : "None yet",
    },
    {
      href: "/partnerships",
      title: "Partnerships",
      glyph: "🤝",
      blurb: "Co-market, integrate, resell. Small signup lifts; big narrative boost.",
      status: `${partnershipsCount} active`,
    },
    {
      href: "/gov-contracts",
      title: "Government contracts",
      glyph: "🏛️",
      blurb: "Lumpy, prestigious, slow-paying. Security-IT & finance-ops shine here.",
      status: govCount > 0 ? `${govCount} contract${govCount === 1 ? "" : "s"}` : "None yet",
    },
    {
      href: "/ipo",
      title: "IPO",
      glyph: "📈",
      blurb: "Series B + $2M MRR opens the path. Exploring → Filed → Roadshow → Public.",
      status: ipoStage === "none" ? "Not started" : `Stage: ${ipoStage}`,
      tag: ipoStage === "public" ? "trading" : undefined,
    },
  ];

  // Cheap at-a-glance KPI bar
  const mrrStr = money(state.finance.mrr ?? 0, { short: true });
  const cashStr = money(state.finance.cash, { short: true });
  const regionFlags = (state.regions ?? []).map(r => REGION_INFO[r.region].label.slice(0, 4).toUpperCase()).join(" · ");

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Growth</h1>
      <div className="themed-card" style={{ padding: 14, display: "grid", gap: 4 }}>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)" }}>
          Cash {cashStr} · MRR {mrrStr} · Week {state.week}
        </div>
        {regionFlags && (
          <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
            Regions: {regionFlags}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {cards.map(c => (
          <Link key={c.href} href={c.href} className="themed-card" style={{
            padding: 14, display: "grid", gridTemplateColumns: "44px 1fr auto", alignItems: "center",
            gap: 10, textDecoration: "none",
          }}>
            <div style={{ fontSize: 28, lineHeight: 1 }}>{c.glyph}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 2 }}>{c.blurb}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 4 }}>{c.status}</div>
            </div>
            {c.tag && <span className="themed-pill" style={{ fontSize: 10 }}>{c.tag}</span>}
          </Link>
        ))}
      </div>

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
