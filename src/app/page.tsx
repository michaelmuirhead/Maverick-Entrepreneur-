"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "@/game/store";
import { HqHeader } from "@/components/HqHeader";
import { KpiGrid } from "@/components/KpiGrid";
import { MrrChart } from "@/components/MrrChart";
import { ProductList } from "@/components/ProductList";
import { EventLog } from "@/components/EventLog";
import { WeekRecap } from "@/components/WeekRecap";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { NextMilestone } from "@/components/NextMilestone";
import { MacroStrip } from "@/components/MacroStrip";

export default function HQPage() {
  const router = useRouter();
  const { state, activeStudioVenture, entrepreneur, hydrated, hydrate } = useGame();

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  useEffect(() => {
    if (!hydrated) return;
    if (!entrepreneur) { router.replace("/new-game"); return; }
    // Active venture is a studio — bounce to /studio. `/` stays the SaaS HQ.
    if (activeStudioVenture && !state) router.replace("/studio");
  }, [hydrated, entrepreneur, state, activeStudioVenture, router]);

  if (!state) {
    return (
      <main className="app-shell" style={{ display: "grid", placeItems: "center", paddingTop: 80 }}>
        <div style={{ color: "var(--color-ink-2)" }}>Loading…</div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <HqHeader />
      <KpiGrid />
      <MacroStrip />
      <NextMilestone />
      <Link href="/growth" className="themed-card" style={{
        display: "grid", gridTemplateColumns: "32px 1fr auto", alignItems: "center", gap: 10,
        padding: "10px 14px", marginTop: 12, textDecoration: "none",
      }}>
        <div style={{ fontSize: 22, lineHeight: 1 }}>🚀</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Growth hub</div>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 1 }}>
            Office · Culture · Campaigns · Support · Regions · Patents · OSS · Partnerships · IPO
          </div>
        </div>
        <span className="mono" style={{ fontSize: 14, color: "var(--color-ink-2)" }}>›</span>
      </Link>
      <h2 className="sec-head" style={{ marginTop: 18 }}>MRR — last 12 weeks <span className="tag">billing</span></h2>
      <MrrChart />
      <h2 className="sec-head">Your products <span className="tag">{state.products.length}</span></h2>
      <ProductList limit={4} />
      <h2 className="sec-head">This week at the office <span className="tag">{state.events.filter(e => e.week === state.week).length}</span></h2>
      <WeekRecap />
      <EventLog limit={6} />

      {state.gameOver && (
        <div className="themed-card" style={{ padding: 16, marginTop: 18, borderColor: "var(--color-bad)" }}>
          <div style={{ fontWeight: 700, color: "var(--color-bad)", fontSize: 16 }}>Game over: {state.gameOver.reason}</div>
          <div style={{ marginTop: 6, color: "var(--color-ink-2)" }}>{state.gameOver.narrative}</div>
        </div>
      )}

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
