"use client";
import { useGame } from "@/game/store";
import { money } from "@/lib/format";

const TONE: Record<string, string> = {
  good: "var(--color-good)",
  warn: "var(--color-warn)",
  bad:  "var(--color-bad)",
  info: "var(--color-ink-2)",
};

export function EventLog({ limit = 8 }: { limit?: number }) {
  const events = useGame(s => s.state?.events ?? []);
  const recent = events.slice(0, limit);
  if (recent.length === 0) return null;

  return (
    <div className="themed-card">
      {recent.map((e, i) => (
        <div key={e.id} style={{
          display: "grid",
          gridTemplateColumns: "16px 1fr auto",
          gap: 10,
          padding: "10px 14px",
          borderTop: i === 0 ? 0 : "2px dashed var(--color-line)",
          alignItems: "center",
        }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: TONE[e.severity], marginTop: 6, display: "inline-block" }} />
          <div style={{ fontSize: 13, lineHeight: 1.3 }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", fontWeight: 600, display: "block", marginBottom: 2 }}>W{e.week}</span>
            {e.message}
          </div>
          {e.amount !== undefined && (
            <span className="mono" style={{ fontWeight: 700, color: e.severity === "bad" ? "var(--color-bad)" : "var(--color-good)", fontSize: 12 }}>
              {money(e.amount, { sign: true, short: true })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
