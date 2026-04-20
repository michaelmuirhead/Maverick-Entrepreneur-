"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/game/store";
import { StudioTabBar } from "@/components/StudioTabBar";
import { StudioAdvanceButton } from "@/components/StudioAdvanceButton";
import { FounderSalaryCard } from "@/components/FounderSalaryCard";
import { money } from "@/lib/format";
import { weeklyPayroll } from "@/game/team";
import { isInDev, hasLaunched } from "@/game/studio/games";

/**
 * Studio Finance page. Mirror of the SaaS /finance page but scoped to the
 * active studio venture. Studio fundraising is light-touch (no pitch / round
 * loop like SaaS), so this page leans readout-focused: cash / runway up top,
 * revenue + burn trend, round history from any angel money the player
 * started with, and the founder's weekly draw.
 *
 * No investor pitching UI — studios raise capital through platform deals and
 * publisher contracts, which live on their own pages.
 */
export default function StudioFinancePage() {
  const router = useRouter();
  const { activeStudioVenture, hydrated, hydrate, entrepreneur, state } = useGame();

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  useEffect(() => {
    if (!hydrated) return;
    if (!entrepreneur) { router.replace("/new-game"); return; }
    if (state && !activeStudioVenture) router.replace("/");
  }, [hydrated, entrepreneur, state, activeStudioVenture, router]);

  const s = activeStudioVenture;
  if (!s) {
    return (
      <main className="app-shell" style={{ display: "grid", placeItems: "center", paddingTop: 80 }}>
        <div style={{ color: "var(--color-ink-2)" }}>Loading…</div>
      </main>
    );
  }

  const burnHistory = s.finance.weeklyBurnHistory ?? [];
  const revenueHistory = s.finance.weeklyRevenueHistory ?? [];

  // Burn = trailing 4-week average of actual weekly spend, or fall back to
  // payroll-only when we don't have history yet (fresh save).
  const recentBurn = burnHistory.length > 0
    ? burnHistory.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, burnHistory.length)
    : weeklyPayroll(s.employees);
  const recentRevenue = revenueHistory.length > 0
    ? revenueHistory.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, revenueHistory.length)
    : 0;

  const monthlyBurn = recentBurn * 4.33;
  const monthlyRev = recentRevenue * 4.33;
  const netWeekly = recentRevenue - recentBurn;
  const runwayMo = recentBurn > 0 ? (s.finance.cash / recentBurn) / 4.33 : Infinity;
  const runwayLabel = !isFinite(runwayMo) ? "∞" : `${runwayMo.toFixed(1)} mo`;

  const payroll = weeklyPayroll(s.employees);
  const inDevCount = s.games.filter(isInDev).length;
  const liveCount = s.games.filter(hasLaunched).length;

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Finance</h1>

      {/* Cash + runway banner */}
      <div className="themed-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>Cash on hand</div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, marginTop: 4 }}>{money(s.finance.cash)}</div>
          </div>
          <span className="themed-pill" style={{ background: isFinite(runwayMo) && runwayMo < 6 ? "var(--color-bad)" : "var(--color-good)" }}>
            {runwayLabel} runway
          </span>
        </div>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 10 }}>
          Rev ~{money(monthlyRev, { short: true })}/mo · Payroll {money(payroll * 4.33, { short: true })}/mo · Burn ~{money(monthlyBurn, { short: true })}/mo
        </div>
      </div>

      <FounderSalaryCard />

      {/* Revenue + burn chart */}
      <h2 className="sec-head" style={{ marginTop: 18 }}>Revenue vs. burn</h2>
      <StudioRevenueBurnChart revenue={revenueHistory} burn={burnHistory} />

      {/* Quick breakdown of where the numbers come from */}
      <h2 className="sec-head" style={{ marginTop: 18 }}>This week</h2>
      <div className="themed-card" style={{ padding: 14, display: "grid", gap: 8 }}>
        <Row label="Weekly revenue" value={money(recentRevenue, { short: true })} sub="4-week trailing avg" />
        <Row label="Weekly burn" value={money(recentBurn, { short: true })} sub="payroll + dev + live-ops" />
        <Row
          label="Net / week"
          value={`${netWeekly >= 0 ? "+" : ""}${money(netWeekly, { short: true })}`}
          sub={netWeekly >= 0 ? "profitable" : "losing money"}
          bad={netWeekly < 0}
          good={netWeekly > 0}
        />
        <Row label="Payroll" value={money(payroll, { short: true })} sub={`${s.employees.length} on staff`} />
        <Row label="Projects" value={`${inDevCount} in dev`} sub={`${liveCount} launched`} />
      </div>

      {/* Round history — studios usually have 0 or 1 of these, but we still show
          the block so angel-backed starts have somewhere to see their round. */}
      <h2 className="sec-head" style={{ marginTop: 18 }}>Round history</h2>
      <div className="themed-card">
        {s.finance.rounds.length === 0 ? (
          <div style={{ padding: 14, color: "var(--color-ink-2)", fontSize: 12 }}>
            No outside capital yet. Studio revenue comes from shipped games, live-service DLC, and work-for-hire contracts.
          </div>
        ) : s.finance.rounds.map((r, i) => (
          <div key={i} style={{
            padding: "12px 14px", borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
            display: "grid", gridTemplateColumns: "1fr auto", gap: 10,
          }}>
            <div>
              <div style={{ fontWeight: 700 }}>{r.label}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
                Week {r.week} · {money(r.postMoney, { short: true })} post
              </div>
            </div>
            <div className="mono" style={{ fontWeight: 700 }}>{money(r.amount, { short: true })}</div>
          </div>
        ))}
      </div>

      <StudioAdvanceButton />
      <StudioTabBar />
    </main>
  );
}

/** Single KPI row used in the breakdown card. Kept compact for mobile. */
function Row({ label, value, sub, bad, good }: {
  label: string; value: string; sub?: string; bad?: boolean; good?: boolean;
}) {
  const valueColor = bad ? "var(--color-bad)" : good ? "var(--color-good)" : undefined;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "baseline",
    }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 2 }}>{sub}</div>}
      </div>
      <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: valueColor }}>{value}</div>
    </div>
  );
}

/**
 * Inline SVG chart plotting revenue (accent line) and burn (muted line) over
 * the last ~16 weeks. We can't reuse MrrChart — that's SaaS-scoped and reads
 * from `s.state`. Keeping this inline avoids cross-vertical coupling in a
 * shared component.
 */
function StudioRevenueBurnChart({ revenue, burn }: { revenue: number[]; burn: number[] }) {
  const windowSize = 16;
  const rev = revenue.slice(-windowSize);
  const brn = burn.slice(-windowSize);
  const n = Math.max(rev.length, brn.length);
  const max = Math.max(1, ...rev, ...brn, 100);
  const w = 400, h = 100;

  const toPoints = (series: number[]): string => {
    if (series.length === 0) return `0,${h - 4} ${w},${h - 4}`;
    return series.map((v, i) => {
      const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
      const y = h - 4 - (v / max) * (h - 12);
      return `${x},${y}`;
    }).join(" ");
  };

  const revPts = toPoints(rev);
  const brnPts = toPoints(brn);

  const lastRev = rev[rev.length - 1] ?? 0;
  const lastBrn = brn[brn.length - 1] ?? 0;

  return (
    <div className="themed-card" style={{ padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6, gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--color-accent)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
            Revenue
          </div>
          <div className="num" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, lineHeight: 1, color: "var(--color-accent)" }}>
            {money(lastRev)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "var(--color-bad)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
            Burn
          </div>
          <div className="num" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, lineHeight: 1, color: "var(--color-bad)" }}>
            {money(lastBrn)}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
        <g stroke="var(--color-line)" strokeOpacity="0.15" strokeDasharray="2 4">
          <line x1={0} y1={h * 0.25} x2={w} y2={h * 0.25} />
          <line x1={0} y1={h * 0.5}  x2={w} y2={h * 0.5}  />
          <line x1={0} y1={h * 0.75} x2={w} y2={h * 0.75} />
        </g>
        <polyline points={brnPts} fill="none" stroke="var(--color-bad)" strokeWidth="2" strokeLinejoin="round" strokeOpacity="0.7" strokeDasharray="4 3" />
        <polyline points={revPts} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      {n === 0 && (
        <div style={{ fontSize: 11, color: "var(--color-ink-2)", textAlign: "center", marginTop: 6 }}>
          No tick history yet — advance a week to start tracking.
        </div>
      )}
    </div>
  );
}
