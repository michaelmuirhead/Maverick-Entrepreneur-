"use client";
import { useMemo, useState } from "react";
import { useGame } from "@/game/store";
import {
  contractTypeLabel, DEFAULT_STUDIO_REPUTATION,
} from "@/game/studio/contracts";
import type { StudioContract } from "@/game/studio/types";

/**
 * Contracts board — shows open offers (with a staffing picker) and in-flight
 * active contracts (with progress + deadline). Sits on the studio HQ page.
 *
 * Hidden entirely if the studio has no offers and no active contracts, so new
 * studios don't get a third empty card cluttering the dashboard.
 */
export function StudioContractsCard() {
  const contracts = useGame(s => s.activeStudioVenture?.contracts ?? []);
  const employees = useGame(s => s.activeStudioVenture?.employees ?? []);
  const week = useGame(s => s.activeStudioVenture?.week ?? 0);
  const reputation = useGame(s => s.activeStudioVenture?.studioReputation ?? DEFAULT_STUDIO_REPUTATION);
  const acceptContract = useGame(s => s.acceptStudioContract);
  const declineContract = useGame(s => s.declineStudioContract);

  const open = useMemo(
    () => contracts.filter(c => c.status === "offered" && c.expiresWeek > week),
    [contracts, week],
  );
  const active = useMemo(
    () => contracts.filter(c => c.status === "active"),
    [contracts],
  );

  if (open.length === 0 && active.length === 0) return null;

  return (
    <div className="themed-card" style={{ padding: "12px 14px", display: "grid", gap: 12, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 11, color: "var(--color-accent)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
          📇 Contracts
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600 }}>
          Rep {Math.round(reputation)}/100
        </div>
      </div>

      {open.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {open.map(c => (
            <ContractOfferRow
              key={c.id}
              contract={c}
              employees={employees}
              week={week}
              onAccept={(engIds, desIds) => acceptContract(c.id, engIds, desIds)}
              onDecline={() => declineContract(c.id)}
            />
          ))}
        </div>
      )}

      {active.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>
            In flight
          </div>
          {active.map(c => (
            <ContractActiveRow key={c.id} contract={c} week={week} employees={employees} />
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================================
// Open-offer row (with inline staffing picker)
// =====================================================================================

function ContractOfferRow({
  contract: c,
  employees,
  week,
  onAccept,
  onDecline,
}: {
  contract: StudioContract;
  employees: { id: string; name: string; role: string; level: number }[];
  week: number;
  onAccept: (engineerIds: string[], designerIds: string[]) => void;
  onDecline: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedEng, setSelectedEng] = useState<Set<string>>(new Set());
  const [selectedDes, setSelectedDes] = useState<Set<string>>(new Set());

  const engineers = employees.filter(e => e.role === "engineer" || e.role === "founder");
  const designers = employees.filter(e => e.role === "designer");

  const toggleEng = (id: string) => {
    setSelectedEng(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleDes = (id: string) => {
    setSelectedDes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const canAccept =
    selectedEng.size >= c.requiredEngineers
    && selectedDes.size >= c.requiredDesigners;

  const upfront = Math.round(c.payout * c.upfrontFraction);

  return (
    <div style={{ display: "grid", gap: 6, paddingBottom: 10, borderBottom: "1px dashed var(--color-border-subtle, rgba(0,0,0,.08))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {c.title}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", whiteSpace: "nowrap" }}>
          exp W{c.expiresWeek}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
        {c.clientName} · {contractTypeLabel(c.type)} · {c.durationWeeks} wk · ${c.payout.toLocaleString()} total (${upfront.toLocaleString()} upfront)
      </div>
      <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
        Needs {c.requiredEngineers} eng{c.requiredDesigners > 0 ? ` + ${c.requiredDesigners} designer${c.requiredDesigners > 1 ? "s" : ""}` : ""}
      </div>

      {!expanded && (
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          <button onClick={() => setExpanded(true)} style={acceptBtnStyle}>Accept…</button>
          <button onClick={onDecline} style={declineBtnStyle}>Decline</button>
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 4, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 11, color: "var(--color-ink-2)", fontStyle: "italic" }}>
            {c.description}
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>
              Assign engineers ({selectedEng.size}/{c.requiredEngineers} min)
            </div>
            {engineers.length === 0
              ? <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>No engineers on staff.</div>
              : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {engineers.map(e => (
                    <button
                      key={e.id}
                      onClick={() => toggleEng(e.id)}
                      style={pickerChipStyle(selectedEng.has(e.id))}
                    >
                      {e.name} · L{e.level}{e.role === "founder" ? " ★" : ""}
                    </button>
                  ))}
                </div>
              )
            }
          </div>

          {c.requiredDesigners > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-ink-2)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>
                Assign designers ({selectedDes.size}/{c.requiredDesigners} min)
              </div>
              {designers.length === 0
                ? <div style={{ fontSize: 11, color: "var(--color-ink-2)" }}>No designers on staff.</div>
                : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {designers.map(e => (
                      <button
                        key={e.id}
                        onClick={() => toggleDes(e.id)}
                        style={pickerChipStyle(selectedDes.has(e.id))}
                      >
                        {e.name} · L{e.level}
                      </button>
                    ))}
                  </div>
                )
              }
            </div>
          )}

          <div style={{ fontSize: 10, color: "var(--color-ink-2)" }}>
            Deadline: week {week + c.durationWeeks + Math.max(2, Math.ceil(c.durationWeeks * 0.25))} (incl. grace). Missing it: partial pay, rep -{c.repOnFailure}, morale hit on assigned staff.
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => onAccept(Array.from(selectedEng), Array.from(selectedDes))}
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
// Active-contract row (progress + deadline)
// =====================================================================================

function ContractActiveRow({
  contract: c,
  week,
  employees,
}: {
  contract: StudioContract;
  week: number;
  employees: { id: string; name: string }[];
}) {
  const pct = Math.round(c.progress * 100);
  const weeksLeft = c.deadlineWeek != null ? Math.max(0, c.deadlineWeek - week) : 0;
  const presentEng = c.assignedEngineerIds.filter(id => employees.some(e => e.id === id)).length;
  const presentDes = c.assignedDesignerIds.filter(id => employees.some(e => e.id === id)).length;
  const understaffed = presentEng < c.requiredEngineers || presentDes < c.requiredDesigners;

  const statusColor = understaffed
    ? "var(--color-warn)"
    : weeksLeft < 3
      ? "var(--color-warn)"
      : "var(--color-ink-2)";

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{c.title}</div>
        <div className="mono" style={{ fontSize: 11, color: statusColor, whiteSpace: "nowrap" }}>
          {understaffed ? "⚠ understaffed" : `${weeksLeft} wk left`}
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--color-ink-2)" }}>
        {c.clientName} · {pct}% · ${c.payout.toLocaleString()} total
      </div>
      <div style={{
        height: 4, background: "var(--color-surface-2, rgba(0,0,0,.06))", borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: understaffed ? "var(--color-warn)" : "var(--color-accent)",
          transition: "width .3s",
        }} />
      </div>
    </div>
  );
}

// =====================================================================================
// Styles
// =====================================================================================

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
const pickerChipStyle = (selected: boolean): React.CSSProperties => ({
  background: selected ? "var(--color-accent)" : "var(--color-surface-2, rgba(0,0,0,.04))",
  color: selected ? "#fff" : "var(--color-ink)",
  border: "var(--border-card)", borderRadius: "var(--radius-card)",
  padding: "4px 8px", fontSize: 10, fontWeight: 600,
});
