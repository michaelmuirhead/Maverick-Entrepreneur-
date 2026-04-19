import { useEffect, useRef, useState } from "react";
import { useGame } from "@/app/store/useGame";
import {
  computeLegacyScore,
  generateEulogyParagraphs,
  buildGravestone,
  saveGravestone,
  LEGACY_TIER_DESCRIPTORS,
} from "@/engine/legacy";
import { formatMoney } from "@/engine/simulation";
import { Icon } from "@/components/ui/Icon";
import type { Gravestone } from "@/types";

// Small hook: ease a number from 0 to `target` over `duration` ms.
// Uses easeOutCubic so the climb feels confident at the start and
// settles gently — the opposite of a scoreboard ding.
function useCountUp(target: number, duration = 1400): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ============================================================
// Phase 3.3 — Dynasty Eulogy Screen
// ============================================================
// Shown when dynastyEnded is true. Full-screen takeover (no tab bar,
// no AppShell). Shows the Legacy Score, narrative paragraphs, reign
// history, and a CTA to start a new dynasty. Saves a gravestone to
// localStorage on first mount.

export function DynastyEnded() {
  const state = useGame();
  const { reset } = state;
  const savedRef = useRef<Gravestone | null>(null);

  // Compute once — the state is frozen at this point
  const legacy = computeLegacyScore(state);
  const eulogy = generateEulogyParagraphs(state, legacy);
  const animatedScore = useCountUp(legacy.total, 1600);

  // Save a gravestone on mount (only once). We build it inside useEffect so
  // the gravestone carries a timestamp that reflects when the dynasty actually
  // ended, not when the component first ran during SSR.
  useEffect(() => {
    if (savedRef.current) return;
    const endReason: Gravestone["endReason"] =
      state.heirs.filter((h) => h.status !== "child").length === 0
        ? "no_heirs"
        : "last_founder_died";
    const g = buildGravestone(state, endReason);
    saveGravestone(g);
    savedRef.current = g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstFounder = state.dynastyHistory[0]?.founderName ?? state.founder.name;
  const surname = extractSurname(firstFounder);
  const yearFounded = state.startYear;
  const yearEnded = state.startYear + Math.floor(state.month / 12);

  return (
    <div className="app-shell !pb-0" style={{ minHeight: "100vh" }}>
      <div className="px-6 pt-12 pb-12">
        {/* Crown + tier headline */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-ink text-white mx-auto mb-5 flex items-center justify-center">
            <Icon name="crown" size={36} />
          </div>
          <div className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2">
            The {surname} Dynasty
          </div>
          <h1 className="text-[30px] font-extrabold tracking-tight leading-[1.05] px-2">
            {legacy.tierLabel}
          </h1>
          <p className="text-[13px] text-muted mt-2 italic leading-snug px-3">
            {LEGACY_TIER_DESCRIPTORS[legacy.tier]}
          </p>
        </div>

        {/* Legacy Score big number */}
        <div
          className="rounded-card p-6 mt-6 text-center text-white"
          style={{ background: "linear-gradient(135deg, #0b0e14 0%, #1f2937 100%)" }}
        >
          <div className="text-[11px] font-bold uppercase tracking-widest opacity-70">
            Legacy Score
          </div>
          <div className="text-[56px] font-extrabold leading-none mt-2 tracking-tight tabular-nums">
            {animatedScore}
          </div>
          <div className="text-[12px] opacity-65 mt-1">out of 1,000</div>
        </div>

        {/* Eulogy narrative */}
        <div className="mt-8">
          <div className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3 text-center">
            The Eulogy
          </div>
          <div className="space-y-3 reveal-cascade">
            {eulogy.map((p, i) => (
              <p
                key={i}
                className="text-[14px] text-ink2 leading-relaxed italic"
              >
                {p}
              </p>
            ))}
          </div>
        </div>

        {/* Score breakdown */}
        <div className="mt-8">
          <div className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3 text-center">
            The Breakdown
          </div>
          <div className="card-flat">
            <ScoreRow label="Financial" value={legacy.components.financial} max={200} />
            <ScoreRow label="Brand" value={legacy.components.brand} max={100} />
            <ScoreRow label="Rivals outlasted" value={legacy.components.rivals} max={80} />
            <ScoreRow label="Political reach" value={legacy.components.political} max={80} />
            <ScoreRow label="Generations" value={legacy.components.generational} max={200} />
            <ScoreRow label="Dignity" value={legacy.components.dignity} max={80} />
            <ScoreRow label="Breadth" value={legacy.components.breadth} max={100} />
            <ScoreRow label="Succession clarity" value={legacy.components.succession} max={60} />
          </div>
        </div>

        {/* Reign history */}
        {state.dynastyHistory.length > 0 && (
          <div className="mt-8">
            <div className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3 text-center">
              The Reigns
            </div>
            <div className="space-y-2">
              {state.dynastyHistory.map((r) => (
                <div
                  key={`${r.generation}-${r.founderName}`}
                  className="card-flat flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-yellow-soft text-yellow-deep font-extrabold text-[13px] flex items-center justify-center flex-shrink-0">
                    {r.generation}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[14px] truncate">{r.founderName}</div>
                    <div className="text-[11px] text-muted">
                      {r.endReason === "died" ? "died" : "stepped down"} at {r.ageAtEnd} · peak{" "}
                      {formatMoney(r.peakCash)}
                    </div>
                  </div>
                </div>
              ))}
              {/* final founder */}
              <div className="card-flat flex items-center gap-3 border-2 border-ink !bg-white">
                <div className="w-8 h-8 rounded-full bg-ink text-white font-extrabold text-[13px] flex items-center justify-center flex-shrink-0">
                  {state.generation}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[14px] truncate">{state.founder.name}</div>
                  <div className="text-[11px] text-muted">
                    the last reign · died at {state.founder.age}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Span card */}
        <div className="mt-6 card-flat text-center">
          <div className="text-[11px] text-muted font-semibold uppercase tracking-wider">
            The Span
          </div>
          <div className="text-[20px] font-extrabold mt-1">
            {yearFounded} – {yearEnded}
          </div>
          <div className="text-[12px] text-muted">
            {yearEnded - yearFounded} years · {state.generation} generation
            {state.generation > 1 ? "s" : ""}
          </div>
        </div>

        {/* Start new dynasty */}
        <button
          onClick={() => reset()}
          className="btn-primary mt-10"
          style={{ background: "#0b0e14", boxShadow: "none" }}
        >
          Start a new dynasty
        </button>
        <p className="text-[11px] text-muted mt-3 text-center leading-snug px-4">
          A fresh founder, a blank ledger. Every empire starts the same way.
        </p>

        <p className="text-[10px] text-muted mt-6 text-center italic px-4">
          This dynasty has been saved to your gravestone collection.
        </p>
      </div>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] font-medium text-ink2">{label}</span>
        <span className="text-[13px] font-bold">
          {value}
          <span className="text-muted font-normal"> / {max}</span>
        </span>
      </div>
      <div className="h-1.5 bg-line rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-ink"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function extractSurname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}
