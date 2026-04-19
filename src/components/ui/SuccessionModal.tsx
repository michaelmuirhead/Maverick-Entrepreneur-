import { useGame } from "@/app/store/useGame";
import { Icon, IconChip } from "@/components/ui/Icon";
import { formatMoney } from "@/engine/simulation";
import type { Heir, PendingSuccession } from "@/types";

// Full-screen modal that takes over when a PendingSuccession exists.
// Blocks all other interaction until the player acknowledges.
// Shows: what happened, who takes over, estate tax impact, preview of defecting heirs.
export function SuccessionModal() {
  const { pendingSuccession, heirs, cash, acknowledgeSuccession } = useGame();

  if (!pendingSuccession) return null;

  const successor = pendingSuccession.successorId
    ? heirs.find((h) => h.id === pendingSuccession.successorId) ?? null
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-fade">
      <div className="bg-white rounded-card w-full max-w-[430px] max-h-[92vh] overflow-y-auto rise-in">
        {successor ? (
          <TransitionView
            pending={pendingSuccession}
            successor={successor}
            cash={cash}
            onAcknowledge={acknowledgeSuccession}
          />
        ) : (
          <EndOfDynastyView
            pending={pendingSuccession}
            onAcknowledge={acknowledgeSuccession}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Transition — there is a successor
// ============================================================

function TransitionView({
  pending,
  successor,
  cash,
  onAcknowledge,
}: {
  pending: PendingSuccession;
  successor: Heir;
  cash: number;
  onAcknowledge: () => { ok: boolean; message: string };
}) {
  const taxAmount = Math.round(cash * pending.estateTaxRate);
  const cashAfterTax = cash - taxAmount;
  const isDeath = pending.kind === "death";

  return (
    <>
      {/* Hero banner — dark for death, warmer for step-down */}
      <div
        className="relative h-36 p-5 text-white flex flex-col justify-end rounded-t-card"
        style={{
          background: isDeath
            ? "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)"
            : "linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)",
        }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-widest opacity-85">
          {isDeath ? "In memoriam" : "Handoff"}
        </div>
        <div className="text-[24px] font-extrabold tracking-tight leading-tight mt-1">
          {pending.founderNameAtTransition}
        </div>
        <div className="text-[13px] opacity-85">
          Age {pending.founderAgeAtTransition} · {isDeath ? "died" : "stepped down"}
        </div>
      </div>

      <div className="p-5">
        <p className="text-[14px] italic text-ink2 leading-relaxed">{pending.reason}</p>

        {/* Successor card */}
        <div className="flex items-center gap-2.5 mt-5 mb-2">
          <IconChip icon="crown" variant="yellow" size="sm" />
          <h2 className="text-[18px] font-extrabold tracking-tight">New Founder</h2>
        </div>

        <div className="card">
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 rounded-full bg-ink text-white flex items-center justify-center font-extrabold text-[18px] flex-shrink-0">
              {initials(successor.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-[16px] leading-tight truncate">
                {successor.name}
              </div>
              <div className="text-[12px] text-muted font-medium">
                Age {successor.age}
              </div>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {successor.traits.map((t) => (
                  <span
                    key={t.kind}
                    className={`pill ${
                      t.polarity === "positive"
                        ? "!bg-green-soft !text-green"
                        : t.polarity === "negative"
                        ? "!bg-red-soft !text-red"
                        : "!bg-surface !text-ink2"
                    }`}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[13px] text-ink2 italic leading-snug mt-3">{successor.bio}</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <StatMini label="Aptitude" value={successor.aptitude} />
            <StatMini label="Loyalty" value={successor.loyalty} />
            <StatMini label="Appeal" value={successor.publicAppeal} />
          </div>
        </div>

        {/* Estate tax breakdown */}
        <div className="flex items-center gap-2.5 mt-5 mb-2">
          <IconChip icon="file" variant="red" size="sm" />
          <h2 className="text-[18px] font-extrabold tracking-tight">Estate Taxes</h2>
        </div>
        <div className="card-flat">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-ink2">Cash before</span>
            <span className="font-bold text-[14px]">{formatMoney(cash)}</span>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[13px] text-ink2">
              Tax ({Math.round(pending.estateTaxRate * 100)}%)
            </span>
            <span className="font-bold text-[14px] text-red">
              -{formatMoney(taxAmount)}
            </span>
          </div>
          <div className="border-t border-line mt-2 pt-2 flex items-center justify-between">
            <span className="text-[13px] font-bold">Cash after</span>
            <span className="font-extrabold text-[18px]">{formatMoney(cashAfterTax)}</span>
          </div>
          <p className="text-[11px] text-muted mt-2 leading-snug">
            Properties and companies transfer at current value. Taxes apply only to
            liquid cash.
          </p>
        </div>

        {/* Acknowledge */}
        <button
          onClick={() => onAcknowledge()}
          className="btn-primary mt-5"
          style={{
            background: isDeath ? "#0b0e14" : "#3b82f6",
            boxShadow: isDeath ? "none" : undefined,
          }}
        >
          Take the reins
        </button>
        <p className="text-[11px] text-muted mt-2 text-center px-4 leading-snug">
          Any passed-over adult heirs will react — some stay loyal, some leave, a few
          may found their own rival companies.
        </p>
      </div>
    </>
  );
}

// ============================================================
// End of dynasty — no successor
// ============================================================

function EndOfDynastyView({
  pending,
  onAcknowledge,
}: {
  pending: PendingSuccession;
  onAcknowledge: () => { ok: boolean; message: string };
}) {
  return (
    <>
      <div
        className="relative h-36 p-5 text-white flex flex-col justify-end rounded-t-card"
        style={{ background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)" }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-widest opacity-85">
          The dynasty ends
        </div>
        <div className="text-[24px] font-extrabold tracking-tight leading-tight mt-1">
          {pending.founderNameAtTransition}
        </div>
        <div className="text-[13px] opacity-85">Age {pending.founderAgeAtTransition}</div>
      </div>

      <div className="p-5">
        <p className="text-[14px] italic text-ink2 leading-relaxed">{pending.reason}</p>
        <div className="card-flat mt-5 text-center">
          <div className="w-14 h-14 rounded-full bg-red-soft text-red mx-auto mb-3 flex items-center justify-center">
            <Icon name="x-circle" size={28} />
          </div>
          <div className="font-extrabold text-[16px]">No eligible heir</div>
          <p className="text-[12px] text-ink2 mt-2 leading-snug px-2">
            The empire fractures without an adult heir to inherit. Companies will be
            sold, properties liquidated, the name will survive only in memory.
          </p>
        </div>
        <button onClick={() => onAcknowledge()} className="btn-secondary mt-5 !py-3">
          Accept the end
        </button>
      </div>
    </>
  );
}

// ============================================================
// Helpers
// ============================================================

function StatMini({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value);
  const tone = pct >= 70 ? "text-green" : pct >= 40 ? "text-yellow-deep" : "text-red";
  return (
    <div className="bg-surface rounded-chip p-1.5 text-center">
      <div className="text-[9px] text-muted font-bold uppercase tracking-wider">{label}</div>
      <div className={`font-extrabold text-[15px] leading-none mt-0.5 ${tone}`}>{pct}</div>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "—"
  );
}
