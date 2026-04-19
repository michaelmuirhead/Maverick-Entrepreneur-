import { useState } from "react";
import { useGame } from "@/app/store/useGame";
import { formatDateWithDay, formatMoney, totalDays } from "@/engine/simulation";
import { computeLegacyScore, LEGACY_TIER_DESCRIPTORS } from "@/engine/legacy";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Icon, IconChip } from "@/components/ui/Icon";

export function Settings() {
  const state = useGame();
  const { month, dayInMonth, startYear, companies, heirs, founder, generation, endDynasty, reset } = state;
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const currentDay = totalDays(month, dayInMonth);
  const date = formatDateWithDay(month, dayInMonth + 1, startYear);
  const legacy = computeLegacyScore(state);

  return (
    <>
      <PageHeader title="Settings" subtitle="Preferences, saves, and support" />

      {/* Run summary */}
      <SectionHeader icon="info" variant="blue" title="This Run" />
      <div className="card-flat space-y-2.5">
        <SettingRow label="Founder" value={founder.name || "—"} />
        <SettingRow label="Today" value={date} />
        <SettingRow label="Day counter" value={`Day ${currentDay}`} />
        <SettingRow label="Generation" value={`${generation}`} />
        <SettingRow label="Businesses" value={String(companies.length)} />
        <SettingRow label="Heirs" value={String(heirs.length)} />
      </div>

      {/* Legacy projection — Phase 3.3 */}
      <SectionHeader
        icon="crown"
        variant="yellow"
        title="Legacy Projection"
        meta="If the dynasty ended today"
      />
      <div
        className="rounded-card p-5 text-white"
        style={{ background: "linear-gradient(135deg, #0b0e14 0%, #1f2937 100%)" }}
      >
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest opacity-70">
              Current Score
            </div>
            <div className="text-[36px] font-extrabold tracking-tight leading-none mt-1">
              {legacy.total}
              <span className="text-[14px] font-semibold opacity-60"> / 1000</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold opacity-70 uppercase tracking-wider">
              Tier
            </div>
            <div className="text-[13px] font-bold mt-1">{legacy.tierLabel}</div>
          </div>
        </div>
        <p className="text-[12px] opacity-75 italic mt-3 leading-snug">
          {LEGACY_TIER_DESCRIPTORS[legacy.tier]}
        </p>
      </div>

      <div className="card-flat mt-3 space-y-1">
        <ScoreLine label="Financial" value={legacy.components.financial} max={200} />
        <ScoreLine label="Brand" value={legacy.components.brand} max={100} />
        <ScoreLine label="Rivals outlasted" value={legacy.components.rivals} max={80} />
        <ScoreLine label="Political reach" value={legacy.components.political} max={80} />
        <ScoreLine label="Generations" value={legacy.components.generational} max={200} />
        <ScoreLine label="Dignity" value={legacy.components.dignity} max={80} />
        <ScoreLine label="Breadth" value={legacy.components.breadth} max={100} />
        <ScoreLine label="Succession" value={legacy.components.succession} max={60} />
      </div>

      <div className="card-flat mt-3">
        <SettingRow label="Peak net worth" value={formatMoney(state.peakNetWorth)} />
        <SettingRow label="Industries entered" value={String(state.industriesEntered.length)} />
        <SettingRow label="Cities entered" value={String(state.citiesEntered.length)} />
        <SettingRow label="Rivals outlasted" value={String(state.rivalsDefeated.length)} />
      </div>

      {/* Danger Zone */}
      <SectionHeader icon="warning" variant="red" title="Danger Zone" />

      {/* End dynasty */}
      {!confirmEnd ? (
        <button
          onClick={() => setConfirmEnd(true)}
          className="list-card !rounded-tile w-full !border-yellow/40"
          style={{ background: "rgba(254, 243, 199, 0.5)" }}
        >
          <IconChip icon="crown" variant="yellow" size="md" />
          <div className="flex-1 text-left">
            <div className="font-bold text-[15px]">End the dynasty</div>
            <div className="text-[12px] text-ink2 mt-0.5">
              Close the books now. See the eulogy and final Legacy Score.
            </div>
          </div>
          <Icon name="chevron-right" size={18} className="text-muted" />
        </button>
      ) : (
        <div className="card border-2" style={{ borderColor: "#eab308" }}>
          <div className="font-bold text-[15px] mb-1">End the dynasty?</div>
          <p className="text-[13px] text-ink2 leading-relaxed mb-4">
            Your save stays intact and a gravestone is archived. You'll see the full eulogy
            screen — the Legacy Score, reign history, and the narrative of what you built.
            Use this when you're ready to close a chapter.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmEnd(false)} className="btn-outline flex-1">
              Cancel
            </button>
            <button
              onClick={() => {
                endDynasty();
                setConfirmEnd(false);
              }}
              className="flex-1 bg-yellow-deep text-white py-3 px-4 rounded-chip font-bold text-[13px]"
            >
              End dynasty
            </button>
          </div>
        </div>
      )}

      {/* Reset */}
      {!confirmReset ? (
        <button
          onClick={() => setConfirmReset(true)}
          className="list-card !rounded-tile w-full !border-red/30 mt-2"
          style={{ background: "rgba(254, 226, 226, 0.4)" }}
        >
          <IconChip icon="x-circle" variant="red" size="md" />
          <div className="flex-1 text-left">
            <div className="font-bold text-[15px]">Reset game</div>
            <div className="text-[12px] text-ink2 mt-0.5">
              Wipe this save and start a new founder.
            </div>
          </div>
          <Icon name="chevron-right" size={18} className="text-muted" />
        </button>
      ) : (
        <div className="card !border-red mt-2">
          <div className="font-bold text-[15px] mb-1">Are you sure?</div>
          <p className="text-[13px] text-ink2 leading-relaxed mb-4">
            This wipes the active save — founder, heirs, companies, real estate. No eulogy,
            no gravestone. There is no undo. Past gravestones are preserved.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmReset(false)} className="btn-outline flex-1">
              Cancel
            </button>
            <button
              onClick={() => {
                reset();
                setConfirmReset(false);
              }}
              className="flex-1 bg-red text-white py-3 px-4 rounded-chip font-bold text-[13px]"
            >
              Yes, reset
            </button>
          </div>
        </div>
      )}

      {/* About */}
      <SectionHeader icon="info" variant="purple" title="About" />
      <div className="card-flat">
        <div className="font-bold text-[15px] leading-tight">Maverick Entrepreneur</div>
        <div className="text-[12px] text-muted mt-0.5">
          A dynasty business simulator
        </div>
        <p className="text-[13px] text-ink2 leading-relaxed mt-3">
          Build a company. Forge an empire. Hand it to your heirs. Generational business
          strategy with rivals, politics, and real estate — rendered as a daily-tick
          mobile game.
        </p>
      </div>

      <div className="h-6" />
    </>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-muted font-medium">{label}</span>
      <span className="text-[14px] font-bold">{value}</span>
    </div>
  );
}

function ScoreLine({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-ink2 font-medium">{label}</span>
        <span className="text-[12px] font-bold">
          {value}
          <span className="text-muted font-normal"> / {max}</span>
        </span>
      </div>
      <div className="h-1 bg-line rounded-full overflow-hidden mt-1">
        <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
