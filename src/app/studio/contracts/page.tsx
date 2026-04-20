"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGame } from "@/game/store";
import { StudioTabBar } from "@/components/StudioTabBar";
import { StudioAdvanceButton } from "@/components/StudioAdvanceButton";
import {
  contractTypeLabel, DEFAULT_STUDIO_REPUTATION,
} from "@/game/studio/contracts";
import type {
  ContractStatus, ContractType, StudioContract,
} from "@/game/studio/types";

/**
 * Studio / Contracts — full-page contract management.
 *
 * Three sections:
 *   1. Open offers (inline accept / decline with engineer picker)
 *   2. Active contracts (progress, deadline, assigned staff)
 *   3. History (completed / failed / declined / cancelled, grouped)
 *
 * The StudioContractsCard on the HQ page is a condensed version; this page
 * shows everything with more detail, including offers that have expired and
 * contracts that have already wrapped up. Useful for scanning your track
 * record and understanding why your reputation is where it is.
 */
export default function StudioContractsPage() {
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

  const contracts = s.contracts ?? [];
  const rep = s.studioReputation ?? DEFAULT_STUDIO_REPUTATION;

  // Segment by status. Offered but past expiresWeek count as "historical expired"
  // (visually grouped with declined so the player can see what they let slip).
  const currentWeek = s.week;
  const open = contracts.filter(c => c.status === "offered" && c.expiresWeek > currentWeek);
  const active = contracts.filter(c => c.status === "active");
  const completed = contracts.filter(c => c.status === "completed");
  const failed = contracts.filter(c => c.status === "failed");
  const cancelled = contracts.filter(c => c.status === "cancelled");
  const declined = contracts.filter(c =>
    c.status === "declined"
    || (c.status === "offered" && c.expiresWeek <= currentWeek)
  );

  const totalEarned = [...completed, ...failed].reduce((sum, c) => sum + c.paidToDate, 0);
  const totalDelivered = completed.length;
  const totalFailed = failed.length + cancelled.length;

  return (
    <main className="app-shell">
      <header style={{ paddingTop: `calc(12px + var(--safe-top))`, marginBottom: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "6px 4px", fontFamily: "var(--font-display)" }}>Contracts</h1>
        <div style={{ color: "var(--color-ink-2)", fontSize: 12, margin: "0 4px" }}>
          Reputation {Math.round(rep)}/100 · {totalDelivered} delivered · {totalFailed} blown · ${totalEarned.toLocaleString()} lifetime
        </div>
      </header>

      <ReputationHint rep={rep} />

      {open.length === 0 && active.length === 0 && contracts.length === 0 && (
        <div className="themed-card" style={{ padding: 16, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>No contract work yet</div>
          <div style={{ fontSize: 12, color: "var(--color-ink-2)" }}>
            Outside studios and publishers reach out with work-for-hire offers as your reputation grows. Consulting gigs are available to anyone; port work, co-dev, and full publisher specs unlock at higher rep.
          </div>
        </div>
      )}

      {open.length > 0 && (
        <Section title="Open offers" count={open.length}>
          <div style={{ display: "grid", gap: 10 }}>
            {open.map(c => <OpenOfferCard key={c.id} contract={c} week={currentWeek} employees={s.employees} />)}
          </div>
        </Section>
      )}

      {active.length > 0 && (
        <Section title="In flight" count={active.length}>
          <div style={{ display: "grid", gap: 10 }}>
            {active.map(c => <ActiveContractCard key={c.id} contract={c} week={currentWeek} employees={s.employees} />)}
          </div>
        </Section>
      )}

      {(completed.length > 0 || failed.length > 0 || cancelled.length > 0 || declined.length > 0) && (
        <Section title="History" count={completed.length + failed.length + cancelled.length + declined.length}>
          <HistoryList
            completed={completed}
            failed={failed}
            cancelled={cancelled}
            declined={declined}
          />
        </Section>
      )}

      <StudioAdvanceButton />
      <StudioTabBar />
    </main>
  );
}

// =====================================================================================
// Section header
// =====================================================================================

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <>
      <h2 className="sec-head" style={{ marginTop: 18 }}>
        {title}{count != null && <span className="tag">{count}</span>}
      </h2>
      {children}
    </>
  );
}

// =====================================================================================
// Reputation hint strip
// =====================================================================================

function ReputationHint({ rep }: { rep: number }) {
  const next = rep < 30 ? { at: 30, label: "port work", delta: 30 - rep }
    : rep < 45 ? { at: 45, label: "co-dev gigs", delta: 45 - rep }
    : rep < 65 ? { at: 65, label: "publisher-spec contracts", delta: 65 - rep }
    : null;

  if (!next) {
    return (
      <div className="themed-card" style={{ padding: "10px 14px", fontSize: 12, color: "var(--color-ink-2)", marginTop: 8 }}>
        Marquee status — every contract type is on the table. Deliver to keep the pipeline flowing.
      </div>
    );
  }

  return (
    <div className="themed-card" style={{ padding: "10px 14px", fontSize: 12, color: "var(--color-ink-2)", marginTop: 8 }}>
      Next tier unlocks at <strong style={{ color: "var(--color-ink)" }}>{next.at}</strong> rep (+{Math.ceil(next.delta)}) — access to <strong style={{ color: "var(--color-ink)" }}>{next.label}</strong>.
    </div>
  );
}

// =====================================================================================
// Open-offer card (fuller detail than the HQ strip)
// =====================================================================================

function OpenOfferCard({
  contract: c, week, employees,
}: {
  contract: StudioContract;
  week: number;
  employees: { id: string; name: string; role: string; level: number }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedEng, setSelectedEng] = useState<Set<string>>(new Set());
  const [selectedDes, setSelectedDes] = useState<Set<string>>(new Set());
  const acceptContract = useGame(s => s.acceptStudioContract);
  const declineContract = useGame(s => s.declineStudioContract);

  const engineers = employees.filter(e => e.role === "engineer" || e.role === "founder");
  const designers = employees.filter(e => e.role === "designer");

  const toggleEng = (id: string) => {
    setSelectedEng(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleDes = (id: string) => {
    setSelectedDes(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const canAccept =
    selectedEng.size >= c.requiredEngineers
    && selectedDes.size >= c.requiredDesigners;
  const upfront = Math.round(c.payout * c.upfrontFraction);
  const projectedDeadline = week + c.durationWeeks + Math.max(2, Math.ceil(c.durationWeeks * 0.25));

  return (
    <div className="themed-card" style={{ padding: "12px 14px", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{c.title}</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", whiteSpace: "nowrap" }}>
          expires W{c.expiresWeek}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
        <strong style={{ color: "var(--color-ink)" }}>{c.clientName}</strong> · {contractTypeLabel(c.type)}
      </div>

      <div style={{ fontSize: 12, color: "var(--color-ink-2)", lineHeight: 1.4 }}>
        {c.description}
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
        paddingTop: 6, borderTop: "1px dashed var(--color-line, rgba(0,0,0,.08))",
      }}>
        <Stat label="Payout" value={`$${c.payout.toLocaleString()}`} sub={`$${upfront.toLocaleString()} upfront`} />
        <Stat label="Duration" value={`${c.durationWeeks} wk`} sub={`deadline ~W${projectedDeadline}`} />
        <Stat label="Staff" value={`${c.requiredEngineers} eng${c.requiredDesigners > 0 ? ` + ${c.requiredDesigners} des` : ""}`} />
        <Stat label="Reputation" value={`+${c.repOnSuccess} / -${c.repOnFailure}`} sub="success / fail" />
      </div>

      {!expanded && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <button onClick={() => setExpanded(true)} style={acceptBtnStyle}>Accept…</button>
          <button onClick={() => declineContract(c.id)} style={declineBtnStyle}>Decline</button>
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 4, display: "grid", gap: 8 }}>
          <div>
            <div style={pickerHeaderStyle}>
              Assign engineers ({selectedEng.size}/{c.requiredEngineers} min)
            </div>
            {engineers.length === 0
              ? <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>No engineers on staff.</div>
              : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {engineers.map(e => (
                    <button key={e.id} onClick={() => toggleEng(e.id)} style={pickerChipStyle(selectedEng.has(e.id))}>
                      {e.name} · L{e.level}{e.role === "founder" ? " ★" : ""}
                    </button>
                  ))}
                </div>
              )
            }
          </div>

          {c.requiredDesigners > 0 && (
            <div>
              <div style={pickerHeaderStyle}>
                Assign designers ({selectedDes.size}/{c.requiredDesigners} min)
              </div>
              {designers.length === 0
                ? <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>No designers on staff.</div>
                : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {designers.map(e => (
                      <button key={e.id} onClick={() => toggleDes(e.id)} style={pickerChipStyle(selectedDes.has(e.id))}>
                        {e.name} · L{e.level}
                      </button>
                    ))}
                  </div>
                )
              }
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button
              onClick={() => acceptContract(c.id, Array.from(selectedEng), Array.from(selectedDes))}
              disabled={!canAccept}
              style={{ ...acceptBtnStyle, opacity: canAccept ? 1 : 0.5, cursor: canAccept ? "pointer" : "not-allowed" }}
            >
              Sign contract
            </button>
            <button onClick={() => setExpanded(false)} style={declineBtnStyle}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================================
// Active contract card (full detail)
// =====================================================================================

function ActiveContractCard({
  contract: c, week, employees,
}: {
  contract: StudioContract;
  week: number;
  employees: { id: string; name: string }[];
}) {
  const pct = Math.round(c.progress * 100);
  const weeksLeft = c.deadlineWeek != null ? Math.max(0, c.deadlineWeek - week) : 0;
  const presentEng = c.assignedEngineerIds.filter(id => employees.some(e => e.id === id));
  const presentDes = c.assignedDesignerIds.filter(id => employees.some(e => e.id === id));
  const understaffed = presentEng.length < c.requiredEngineers || presentDes.length < c.requiredDesigners;

  return (
    <div className="themed-card" style={{ padding: "12px 14px", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{c.title}</div>
        <div className="mono" style={{
          fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
          color: understaffed || weeksLeft < 3 ? "var(--color-warn)" : "var(--color-ink-2)",
        }}>
          {understaffed ? "⚠ understaffed" : `${weeksLeft} wk left`}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
        {c.clientName} · {contractTypeLabel(c.type)} · ${c.payout.toLocaleString()} total · ${c.paidToDate.toLocaleString()} paid
      </div>

      <div>
        <div style={{
          height: 6, background: "var(--color-surface-2, rgba(0,0,0,.06))",
          borderRadius: 3, overflow: "hidden",
        }}>
          <div style={{
            width: `${pct}%`, height: "100%",
            background: understaffed ? "var(--color-warn)" : "var(--color-accent)",
            transition: "width .3s",
          }} />
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 3, fontWeight: 600 }}>
          {pct}% complete{c.weeksUnderstaffed > 0 ? ` · ${c.weeksUnderstaffed} wk understaffed` : ""}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
        <strong style={{ color: "var(--color-ink)" }}>Assigned:</strong>{" "}
        {presentEng.length === 0 && presentDes.length === 0
          ? <span style={{ color: "var(--color-warn)" }}>nobody present</span>
          : (
            <>
              {presentEng.length > 0 && `${presentEng.length} eng`}
              {presentEng.length > 0 && presentDes.length > 0 && " + "}
              {presentDes.length > 0 && `${presentDes.length} des`}
            </>
          )
        }
        {(c.requiredEngineers > presentEng.length || c.requiredDesigners > presentDes.length) && (
          <span style={{ color: "var(--color-warn)", marginLeft: 6 }}>
            (need {c.requiredEngineers} eng{c.requiredDesigners > 0 ? ` + ${c.requiredDesigners} des` : ""})
          </span>
        )}
      </div>
    </div>
  );
}

// =====================================================================================
// History list
// =====================================================================================

function HistoryList({
  completed, failed, cancelled, declined,
}: {
  completed: StudioContract[];
  failed: StudioContract[];
  cancelled: StudioContract[];
  declined: StudioContract[];
}) {
  // Combine, stamp with display category, and sort newest-first by resolvedWeek.
  const rows = useMemo(() => {
    type Row = { c: StudioContract; outcome: "completed" | "failed" | "cancelled" | "declined" };
    const all: Row[] = [
      ...completed.map(c => ({ c, outcome: "completed" as const })),
      ...failed.map(c => ({ c, outcome: "failed" as const })),
      ...cancelled.map(c => ({ c, outcome: "cancelled" as const })),
      ...declined.map(c => ({ c, outcome: "declined" as const })),
    ];
    all.sort((a, b) => (b.c.resolvedWeek ?? 0) - (a.c.resolvedWeek ?? 0));
    return all;
  }, [completed, failed, cancelled, declined]);

  return (
    <div className="themed-card" style={{ padding: 0 }}>
      {rows.map((row, i) => (
        <HistoryRow key={row.c.id} contract={row.c} outcome={row.outcome} first={i === 0} />
      ))}
    </div>
  );
}

function HistoryRow({
  contract: c, outcome, first,
}: {
  contract: StudioContract;
  outcome: "completed" | "failed" | "cancelled" | "declined";
  first: boolean;
}) {
  const outcomeDisplay = OUTCOME_DISPLAY[outcome];
  return (
    <div style={{ padding: "10px 14px", borderTop: first ? 0 : "2px dashed var(--color-line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{c.title}</div>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
          color: outcomeDisplay.color, textTransform: "uppercase", letterSpacing: ".05em",
        }}>
          {outcomeDisplay.icon} {outcomeDisplay.label}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
        {c.clientName} · {contractTypeLabel(c.type)}
        {c.resolvedWeek != null && ` · W${c.resolvedWeek}`}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
        {outcome === "completed" && `Paid $${c.paidToDate.toLocaleString()} of $${c.payout.toLocaleString()} · rep +${c.repOnSuccess}`}
        {outcome === "failed" && `Paid $${c.paidToDate.toLocaleString()} of $${c.payout.toLocaleString()} at ${Math.round(c.progress * 100)}% · rep -${c.repOnFailure}`}
        {outcome === "cancelled" && `Cancelled mid-flight · paid $${c.paidToDate.toLocaleString()}`}
        {outcome === "declined" && `Offer passed · $${c.payout.toLocaleString()} value`}
      </div>
    </div>
  );
}

const OUTCOME_DISPLAY: Record<"completed" | "failed" | "cancelled" | "declined", {
  label: string; icon: string; color: string;
}> = {
  completed: { label: "delivered", icon: "✓", color: "var(--color-good, #2e7d32)" },
  failed:    { label: "failed",    icon: "✗", color: "var(--color-bad)" },
  cancelled: { label: "cancelled", icon: "—", color: "var(--color-warn)" },
  declined:  { label: "passed",    icon: "·", color: "var(--color-ink-2)" },
};

// =====================================================================================
// Small bits
// =====================================================================================

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

const acceptBtnStyle: React.CSSProperties = {
  background: "var(--color-accent)", color: "#fff",
  border: "var(--border-card)", borderRadius: "var(--radius-card)",
  padding: "8px 14px", fontWeight: 700, fontSize: 13,
};
const declineBtnStyle: React.CSSProperties = {
  background: "var(--color-surface)", color: "var(--color-ink)",
  border: "var(--border-card)", borderRadius: "var(--radius-card)",
  padding: "8px 14px", fontWeight: 700, fontSize: 13,
};
const pickerHeaderStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "var(--color-ink-2)",
  textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4,
};
const pickerChipStyle = (selected: boolean): React.CSSProperties => ({
  background: selected ? "var(--color-accent)" : "var(--color-surface-2, rgba(0,0,0,.04))",
  color: selected ? "#fff" : "var(--color-ink)",
  border: "var(--border-card)", borderRadius: "var(--radius-card)",
  padding: "4px 8px", fontSize: 10, fontWeight: 600,
});
