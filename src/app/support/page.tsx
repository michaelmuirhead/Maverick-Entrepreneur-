"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useGame } from "@/game/store";
import { TabBar } from "@/components/TabBar";
import { AdvanceButton } from "@/components/AdvanceButton";
import { supportChurnMultiplier } from "@/game/support";

export default function SupportPage() {
  const state = useGame(s => s.state);
  const hydrated = useGame(s => s.hydrated);
  const hydrate = useGame(s => s.hydrate);
  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);
  if (!state) return <main className="app-shell" style={{ padding: 40 }}>Loading…</main>;

  const support = state.support ?? { quality: 80, ticketsThisWeek: 0, complaintsRecent: 0 };
  const churnMult = supportChurnMultiplier(support);
  const opsHeads = state.employees.filter(e => e.role === "ops").length;
  const pmHeads = state.employees.filter(e => e.role === "pm").length;
  const founderHeads = state.employees.filter(e => e.role === "founder").length;
  const supportUnits = opsHeads + pmHeads * 0.3 + founderHeads * 0.2;
  const totalUsers = state.products.reduce(
    (s, p) => s + p.users.enterprise + p.users.smb + p.users.selfServe, 0,
  );
  const usersPerRep = supportUnits > 0 ? Math.round(totalUsers / supportUnits) : totalUsers;

  const verdict = support.quality >= 85
    ? { tone: "good" as const, copy: "Customers rave. Low ticket load, fast responses." }
    : support.quality >= 60
      ? { tone: "ok" as const, copy: "Fine. Not great, not a disaster. Tickets handled." }
      : support.quality >= 30
        ? { tone: "warn" as const, copy: "Users are noticing. Expect elevated churn." }
        : { tone: "bad" as const, copy: "Support is collapsing. Users are leaving in droves." };
  const toneColor = verdict.tone === "good" ? "var(--color-good)"
    : verdict.tone === "ok" ? "var(--color-muted)"
      : verdict.tone === "warn" ? "var(--color-warn, #b86b00)"
        : "var(--color-bad)";

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <Link href="/growth" className="mono" style={{ color: "var(--color-ink-2)", fontSize: 12 }}>← Growth</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Customer support</h1>

      <div className="themed-card" style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>Quality</div>
            <div className="mono" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, marginTop: 4 }}>{support.quality}<span style={{ fontSize: 14, color: "var(--color-ink-2)" }}>/100</span></div>
          </div>
          <span className="themed-pill" style={{ background: toneColor, color: "#fff", fontSize: 11 }}>
            churn ×{churnMult.toFixed(2)}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 8 }}>{verdict.copy}</div>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>This week</h2>
      <div className="themed-card" style={{ padding: 14, display: "grid", gap: 4 }}>
        <div className="mono" style={{ fontSize: 12 }}>
          Tickets · {support.ticketsThisWeek.toLocaleString()}
        </div>
        <div className="mono" style={{ fontSize: 12 }}>
          Complaints (rolling) · {support.complaintsRecent.toFixed(1)}
        </div>
        <div className="mono" style={{ fontSize: 12 }}>
          Users per rep · {usersPerRep.toLocaleString()}
        </div>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Staffing breakdown</h2>
      <div className="themed-card" style={{ padding: 14, display: "grid", gap: 4 }}>
        <div className="mono" style={{ fontSize: 12 }}>Ops (full weight) · {opsHeads}</div>
        <div className="mono" style={{ fontSize: 12 }}>PM (0.3 weight) · {pmHeads}</div>
        <div className="mono" style={{ fontSize: 12 }}>Founders (0.2 weight) · {founderHeads}</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--color-ink-2)", marginTop: 6 }}>
          Total effective support headcount · {supportUnits.toFixed(1)}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 6 }}>
          Heuristic: ~800 users per effective rep keeps quality around 60. Hire Ops from
          the Team page to boost this number quickly.
        </div>
      </div>

      <AdvanceButton />
      <TabBar />
    </main>
  );
}
