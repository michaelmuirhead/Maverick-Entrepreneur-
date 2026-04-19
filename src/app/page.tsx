"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/game/store";
import { HqHeader } from "@/components/HqHeader";
import { KpiGrid } from "@/components/KpiGrid";
import { MrrChart } from "@/components/MrrChart";
import { ProductList } from "@/components/ProductList";
import { EventLog } from "@/components/EventLog";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";

export default function HQPage() {
  const router = useRouter();
  const { state, hydrated, hydrate } = useGame();

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  useEffect(() => {
    if (hydrated && !state) router.replace("/new-game");
  }, [hydrated, state, router]);

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
      <h2 className="sec-head" style={{ marginTop: 18 }}>MRR — last 12 weeks <span className="tag">billing</span></h2>
      <MrrChart />
      <h2 className="sec-head">Your products <span className="tag">{state.products.length}</span></h2>
      <ProductList limit={4} />
      <h2 className="sec-head">This week at the office <span className="tag">{state.events.slice(0, 8).length}</span></h2>
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
