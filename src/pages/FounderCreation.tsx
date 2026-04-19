import { useState, useMemo } from "react";
import { BACKGROUNDS, TRAITS } from "@/data/backgrounds";
import { INDUSTRY_LIST } from "@/data/industries";
import { CITIES } from "@/data/cities";
import { useGame } from "@/app/store/useGame";
import { formatMoney } from "@/engine/simulation";
import { loadGravestones } from "@/engine/legacy";
import { Icon, IconChip } from "@/components/ui/Icon";
import type { BackgroundId, Gravestone } from "@/types";

export function FounderCreation() {
  const createFounder = useGame((s) => s.createFounder);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState(28);
  const [background, setBackground] = useState<BackgroundId>("developer");
  const [traits, setTraits] = useState<string[]>([]);
  const [startingCity, setStartingCity] = useState(CITIES[0].id);
  const [startingIndustry, setStartingIndustry] = useState(INDUSTRY_LIST[0].id);
  const [companyName, setCompanyName] = useState("");

  const bg = BACKGROUNDS.find((b) => b.id === background)!;
  const industry = INDUSTRY_LIST.find((i) => i.id === startingIndustry)!;
  const remainingCash = bg.startingCash - industry.startingCost;

  const canAdvanceStep1 = name.trim().length > 0;
  const canAdvanceStep2 = traits.length > 0 && traits.length <= 2;
  const canStart =
    canAdvanceStep1 && canAdvanceStep2 && companyName.trim().length > 0 && remainingCash >= 0;

  function toggleTrait(id: string) {
    setTraits((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : prev.length < 2 ? [...prev, id] : prev
    );
  }

  function begin() {
    createFounder({
      name: name.trim(),
      age,
      background,
      traits,
      startingCity,
      startingIndustry,
      companyName: companyName.trim(),
    });
  }

  return (
    <div className="app-shell !p-0">
      <div className="px-5 pt-8 pb-24">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step ? "w-8 bg-ink" : s < step ? "w-1.5 bg-ink" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="fade-up">
            <PastDynastiesSection />
            <h1 className="text-[34px] font-extrabold leading-none tracking-tight">
              Found your empire
            </h1>
            <p className="text-[15px] text-ink2 mt-2 leading-snug">
              A dynasty begins with a name. Tell us yours.
            </p>

            <div className="mt-8 space-y-5">
              <div>
                <label className="input-label">Your name</label>
                <input
                  className="input-field text-[18px] font-semibold"
                  placeholder="Amelia Hart"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="input-label">Starting age</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={22}
                    max={45}
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="flex-1 accent-blue"
                  />
                  <div className="w-14 text-center font-bold text-[18px]">{age}</div>
                </div>
                <div className="text-[12px] text-muted mt-1">
                  Younger starts give you more time. Older starts give you more capital.
                </div>
              </div>

              <div>
                <label className="input-label">Background</label>
                <div className="space-y-2">
                  {BACKGROUNDS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setBackground(b.id)}
                      className={`w-full text-left p-4 rounded-tile border-2 transition-colors ${
                        background === b.id
                          ? "border-blue bg-blue-soft"
                          : "border-line bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-[15px]">{b.name}</div>
                          <div className="text-[12px] text-ink2 mt-0.5 leading-snug">
                            {b.description}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold text-[15px] text-green">
                            {formatMoney(b.startingCash)}
                          </div>
                          <div className="text-[10px] text-muted font-medium">starting cash</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!canAdvanceStep1}
              className="btn-primary mt-8"
            >
              Continue
              <Icon name="arrow-right" size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="fade-up">
            <h1 className="text-[34px] font-extrabold leading-none tracking-tight">
              Who are you?
            </h1>
            <p className="text-[15px] text-ink2 mt-2 leading-snug">
              Pick one or two traits that shape how you operate.
            </p>

            <div className="mt-6 space-y-2">
              {TRAITS.map((t) => {
                const selected = traits.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTrait(t.id)}
                    className={`w-full text-left p-4 rounded-tile border-2 transition-colors ${
                      selected ? "border-blue bg-blue-soft" : "border-line bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          selected ? "border-blue bg-blue" : "border-line"
                        }`}
                      >
                        {selected && <Icon name="check" size={14} strokeWidth={3} className="text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[15px]">{t.name}</div>
                        <div className="text-[12px] text-ink2 mt-0.5 leading-snug">
                          {t.description}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="text-[12px] text-muted mt-3 text-center">
              {traits.length} of 2 selected
            </div>

            <div className="grid grid-cols-2 gap-3 mt-8">
              <button onClick={() => setStep(1)} className="btn-outline">
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canAdvanceStep2}
                className="btn-primary !p-3 !rounded-tile !text-sm"
                style={{ boxShadow: "none" }}
              >
                Continue
                <Icon name="arrow-right" size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="fade-up">
            <h1 className="text-[34px] font-extrabold leading-none tracking-tight">
              First venture
            </h1>
            <p className="text-[15px] text-ink2 mt-2 leading-snug">
              Every empire starts with a single company.
            </p>

            <div className="mt-6 space-y-5">
              <div>
                <label className="input-label">Company name</label>
                <input
                  className="input-field text-[18px] font-semibold"
                  placeholder="Hart & Company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>

              <div>
                <label className="input-label">Industry</label>
                <div className="space-y-2">
                  {INDUSTRY_LIST.map((i) => (
                    <button
                      key={i.id}
                      onClick={() => setStartingIndustry(i.id)}
                      className={`w-full text-left p-3 rounded-tile border-2 transition-colors flex items-center gap-3 ${
                        startingIndustry === i.id
                          ? "border-blue bg-blue-soft"
                          : "border-line bg-white"
                      }`}
                    >
                      <IconChip
                        icon={industryIcon(i.id)}
                        variant={industryVariant(i.id)}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[14px]">{i.name}</div>
                        <div className="text-[11px] text-ink2 leading-tight">
                          {i.tagline}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-[13px] text-red">
                          -{formatMoney(i.startingCost)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="input-label">Starting city</label>
                <select
                  className="input-field text-[15px] font-semibold"
                  value={startingCity}
                  onChange={(e) => setStartingCity(e.target.value)}
                >
                  {CITIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}, {c.state}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="card-flat mt-6 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">
                  Cash after launch
                </div>
                <div
                  className={`text-[24px] font-extrabold ${
                    remainingCash >= 0 ? "text-green" : "text-red"
                  }`}
                >
                  {formatMoney(remainingCash)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-muted">Starting cash</div>
                <div className="font-bold text-[14px]">{formatMoney(bg.startingCash)}</div>
                <div className="text-[11px] text-muted">Launch cost</div>
                <div className="font-bold text-[14px] text-red">
                  -{formatMoney(industry.startingCost)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-8">
              <button onClick={() => setStep(2)} className="btn-outline">
                Back
              </button>
              <button onClick={begin} disabled={!canStart} className="btn-primary !p-3 !rounded-tile !text-sm">
                Launch
                <Icon name="arrow-right" size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Map industry id → icon + chip variant for visual consistency
function industryIcon(id: string): "coffee" | "cart" | "building-2" | "wrench" | "briefcase" | "truck" {
  const map: Record<string, "coffee" | "cart" | "building-2" | "wrench" | "briefcase" | "truck"> = {
    coffee: "coffee",
    ecommerce: "cart",
    software: "building-2",
    fastfood: "truck",
    construction: "wrench",
    law: "briefcase",
  };
  return map[id] ?? "building-2";
}

function industryVariant(
  id: string
): "blue" | "green" | "pink" | "purple" | "yellow" | "orange" | "red" {
  const map: Record<string, "blue" | "green" | "pink" | "purple" | "yellow" | "orange" | "red"> = {
    coffee: "yellow",
    ecommerce: "green",
    software: "blue",
    fastfood: "red",
    construction: "orange",
    law: "purple",
  };
  return map[id] ?? "blue";
}

// ============================================================
// Phase 3.3 — Past Dynasties section
// Shows gravestones from prior playthroughs saved to localStorage.
// Tapping a gravestone opens a read-only eulogy modal.
// ============================================================
function PastDynastiesSection() {
  const gravestones = useMemo(() => {
    // Newest first
    return [...loadGravestones()].reverse();
  }, []);
  const [selected, setSelected] = useState<Gravestone | null>(null);

  if (gravestones.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <IconChip icon="crown" variant="yellow" size="sm" />
        <div>
          <div className="text-[18px] font-extrabold tracking-tight leading-none">
            Past Dynasties
          </div>
          <div className="text-[11px] text-muted font-medium">
            {gravestones.length} saved · tap to read the eulogy
          </div>
        </div>
      </div>
      <div className="-mx-5 px-5 overflow-x-auto scroll-x">
        <div className="flex gap-3 pb-2" style={{ width: "max-content" }}>
          {gravestones.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelected(g)}
              className="flex-shrink-0 w-[220px] text-left rounded-card p-4 text-white"
              style={{ background: "linear-gradient(135deg, #0b0e14 0%, #1f2937 100%)" }}
            >
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                The {g.surname}s
              </div>
              <div className="text-[20px] font-extrabold leading-tight mt-1 tracking-tight">
                {g.legacy.total}
                <span className="text-[12px] font-semibold opacity-60"> / 1000</span>
              </div>
              <div className="text-[11px] font-semibold opacity-80 mt-0.5">
                {g.legacy.tierLabel}
              </div>
              <div className="mt-3 pt-3 border-t border-white/15 text-[11px] opacity-70 leading-snug">
                {g.yearFounded}–{g.yearEnded} · {g.generations} gen
                {g.generations > 1 ? "s" : ""}
              </div>
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <GravestoneViewer g={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function GravestoneViewer({ g, onClose }: { g: Gravestone; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-[440px] max-h-[90vh] overflow-y-auto rounded-t-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-line px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-widest text-yellow-deep">
              Gravestone
            </div>
            <h2 className="text-[22px] font-extrabold tracking-tight leading-[1.15]">
              The {g.surname} Dynasty
            </h2>
            <p className="text-[12px] text-muted mt-0.5">
              {g.yearFounded}–{g.yearEnded} · {g.generations} generation
              {g.generations > 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface flex items-center justify-center flex-shrink-0"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="px-5 py-5">
          <div
            className="rounded-card p-5 text-white text-center"
            style={{ background: "linear-gradient(135deg, #0b0e14 0%, #1f2937 100%)" }}
          >
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">
              Legacy Score
            </div>
            <div className="text-[48px] font-extrabold leading-none mt-1 tracking-tight">
              {g.legacy.total}
            </div>
            <div className="text-[13px] opacity-85 font-semibold mt-2">
              {g.legacy.tierLabel}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2">
              The Eulogy
            </div>
            <div className="space-y-3">
              {g.eulogyParagraphs.map((p, i) => (
                <p key={i} className="text-[14px] text-ink2 leading-relaxed italic">
                  {p}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2">
              The Reigns
            </div>
            <div className="space-y-1.5">
              {g.reignSummaries.map((s, i) => (
                <div
                  key={i}
                  className="text-[12px] text-ink2 bg-surface rounded-chip px-3 py-2"
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
