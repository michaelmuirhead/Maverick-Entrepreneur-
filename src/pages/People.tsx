import { useState } from "react";
import { useGame } from "@/app/store/useGame";
import { BACKGROUNDS } from "@/data/backgrounds";
import {
  lifeRiskLevel,
  pickDoctorsNote,
  LIFE_RISK_LABELS,
  MAX_HEIRS,
} from "@/data/dynasty";
import { DYNASTY_COSTS } from "@/engine/dynasty";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Icon, IconChip, type ChipVariant } from "@/components/ui/Icon";
import type { Heir } from "@/types";

export function People() {
  const state = useGame();
  const { founder, heirs, cash, companies, generation, tutorHeir, mentorHeir, publicizeHeir, requestStepDown } = state;
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmStepDown, setConfirmStepDown] = useState(false);

  const bg = BACKGROUNDS.find((b) => b.id === founder.background);
  const ctx = {
    age: founder.age,
    health: founder.health,
    stress: founder.stress,
    companyCount: companies.length,
  };
  const risk = lifeRiskLevel(ctx);
  const riskInfo = LIFE_RISK_LABELS[risk];
  const note = pickDoctorsNote(ctx, founder.name);

  const adults = heirs.filter((h) => h.status !== "child");
  const children = heirs.filter((h) => h.status === "child");

  const riskColorClass =
    risk === "dangerous"
      ? "text-red"
      : risk === "elevated" || risk === "watchful"
      ? "text-yellow-deep"
      : "text-green";

  const riskBgClass =
    risk === "dangerous"
      ? "bg-red-soft"
      : risk === "elevated" || risk === "watchful"
      ? "bg-yellow-soft"
      : "bg-green-soft";

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Founder, heirs, and the dynasty you're building"
        rightSlot={
          generation > 1 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip font-bold text-sm bg-yellow-soft text-yellow-deep">
              <Icon name="crown" size={14} strokeWidth={2.2} />
              Gen {generation}
            </span>
          ) : null
        }
      />

      {feedback && (
        <div className="card-flat mb-4 text-sm italic text-ink2 fade-up">{feedback}</div>
      )}

      <SectionHeader icon="user" variant="blue" title="Founder" />

      <div className="card">
        <div className="flex items-start gap-3">
          <div className="w-16 h-16 rounded-full bg-ink text-white flex items-center justify-center font-extrabold text-[20px] flex-shrink-0">
            {initials(founder.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[18px] tracking-tight truncate">
              {founder.name}
            </div>
            <div className="text-[12px] text-muted font-medium">
              {bg?.name ?? "Founder"} · age {founder.age}
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {founder.traits.map((t) => (
                <span key={t} className="pill !bg-blue-soft !text-blue">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <FounderStat label="Energy" value={founder.energy} tone="blue" />
          <FounderStat label="Health" value={founder.health} tone="green" />
          <FounderStat label="Stress" value={founder.stress} tone="red" inverse />
        </div>

        {risk !== "none" && (
          <div className={`mt-4 p-3 rounded-tile ${riskBgClass}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon name="heart" size={15} className={riskColorClass} strokeWidth={2.2} />
              <span className={`text-[11px] font-bold uppercase tracking-wider ${riskColorClass}`}>
                Life Risk · {riskInfo.label}
              </span>
            </div>
            <div className="text-[13px] text-ink2 leading-snug italic">{note}</div>
          </div>
        )}
      </div>

      {/* Step Down — gated by age >= 60, requires an eligible adult heir */}
      {founder.age >= 60 && adults.length > 0 && !confirmStepDown && (
        <button
          onClick={() => setConfirmStepDown(true)}
          className="w-full mt-3 p-4 rounded-tile border-2 border-yellow-soft bg-yellow-soft/40 text-left"
        >
          <div className="flex items-center gap-3">
            <IconChip icon="crown" variant="yellow" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[15px]">Step down voluntarily</div>
              <div className="text-[12px] text-ink2 mt-0.5">
                Hand the empire to your top heir. Half the estate tax of dying in the chair.
              </div>
            </div>
            <Icon name="chevron-right" size={18} className="text-muted" />
          </div>
        </button>
      )}

      {confirmStepDown && (
        <div className="card mt-3 border-2 !border-yellow">
          <div className="font-bold text-[16px]">Step down?</div>
          <p className="text-[13px] text-ink2 leading-snug mt-1.5">
            Your top heir from the succession order will take over. Estate tax applies to
            liquid cash only. Passed-over adult heirs will react — some loyally, some not.
            This cannot be undone.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              onClick={() => setConfirmStepDown(false)}
              className="btn-outline"
            >
              Not yet
            </button>
            <button
              onClick={() => {
                const r = requestStepDown();
                setFeedback(r.message);
                setConfirmStepDown(false);
              }}
              className="bg-yellow text-white font-bold text-[13px] py-3 px-4 rounded-chip"
            >
              Step down
            </button>
          </div>
        </div>
      )}

      <SectionHeader
        icon="users"
        variant="purple"
        title="Heirs"
        meta={`${adults.length} adult · ${children.length} child${children.length === 1 ? "" : "ren"} · ${heirs.length}/${MAX_HEIRS}`}
      />

      {heirs.length === 0 && (
        <div className="card-flat text-center py-10">
          <div className="text-[14px] font-semibold text-ink2">No heirs yet.</div>
          <div className="text-[12px] text-muted mt-1">
            As time passes, your dynasty will grow.
          </div>
        </div>
      )}

      {adults.length > 0 && (
        <div className="space-y-2.5">
          {adults.map((h) => (
            <HeirCard
              key={h.id}
              heir={h}
              cash={cash}
              founderEnergy={founder.energy}
              onTutor={() => {
                const r = tutorHeir(h.id);
                setFeedback(r.message);
              }}
              onMentor={() => {
                const r = mentorHeir(h.id);
                setFeedback(r.message);
              }}
              onPublicize={() => {
                const r = publicizeHeir(h.id);
                setFeedback(r.message);
              }}
            />
          ))}
        </div>
      )}

      {children.length > 0 && (
        <>
          <div className="mt-4 text-[10px] font-bold text-muted tracking-widest uppercase mb-2.5">
            Children · Not Yet Of Age
          </div>
          <div className="space-y-2">
            {children.map((h) => (
              <div key={h.id} className="list-card !rounded-tile opacity-75">
                <IconChip icon="user" variant="surface" round />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[14px]">{h.name}</div>
                  <div className="text-[12px] text-muted">Age {h.age} · child</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {founder.age >= 45 && adults.length > 0 && (
        <>
          <SectionHeader
            icon="crown"
            variant="yellow"
            title="Succession Order"
            meta="Who takes the reins when you step down"
          />
          <div className="card-flat">
            {state.successionOrder.length === 0 ? (
              <div className="text-center text-muted text-[13px] italic py-4">
                No succession order drafted. The board will pick for you.
              </div>
            ) : (
              <div className="space-y-2">
                {state.successionOrder.map((heirId, i) => {
                  const h = heirs.find((x) => x.id === heirId);
                  if (!h) return null;
                  return (
                    <div
                      key={heirId}
                      className="flex items-center gap-3 p-2.5 bg-white rounded-chip border border-line"
                    >
                      <div className="w-7 h-7 rounded-full bg-yellow-soft text-yellow-deep font-extrabold text-[13px] flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[14px] truncate">{h.name}</div>
                        <div className="text-[11px] text-muted">
                          Apt {Math.round(h.aptitude)} · Loy {Math.round(h.loyalty)} · Pub {Math.round(h.publicAppeal)}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-muted uppercase">
                        {i === 0 ? "Heir" : i === 1 ? "Spare" : `#${i + 1}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <div className="h-6" />
    </>
  );
}

function FounderStat({
  label,
  value,
  tone,
  inverse,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "red";
  inverse?: boolean;
}) {
  const displayValue = Math.round(value);
  const pct = Math.min(100, Math.max(0, value));
  const fillClass = { blue: "bg-blue", green: "bg-green", red: "bg-red" }[tone];
  const displayTone = inverse
    ? value > 60
      ? "text-red"
      : value > 30
      ? "text-yellow-deep"
      : "text-green"
    : value < 30
    ? "text-red"
    : value < 60
    ? "text-yellow-deep"
    : "text-green";

  return (
    <div className="bg-surface rounded-tile p-2.5">
      <div className="text-[10px] text-muted font-semibold uppercase tracking-wide">
        {label}
      </div>
      <div className={`text-[20px] font-extrabold leading-none mt-1 ${displayTone}`}>
        {displayValue}
      </div>
      <div className="h-1 bg-line rounded-full mt-2">
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function HeirCard({
  heir,
  cash,
  founderEnergy,
  onTutor,
  onMentor,
  onPublicize,
}: {
  heir: Heir;
  cash: number;
  founderEnergy: number;
  onTutor: () => void;
  onMentor: () => void;
  onPublicize: () => void;
}) {
  const canTutor = heir.status === "adult" && cash >= DYNASTY_COSTS.TUTORING;
  const canMentor = heir.status === "adult" && founderEnergy >= 8;
  const canPublicize = heir.status === "adult" && cash >= DYNASTY_COSTS.PUBLIC_ROLE;

  const dominant = heir.traits[0];
  const variant: ChipVariant =
    dominant?.polarity === "positive"
      ? "green"
      : dominant?.polarity === "negative"
      ? "red"
      : "blue";

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <IconChip icon="user" variant={variant} round />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px] tracking-tight truncate">{heir.name}</div>
          <div className="text-[11px] text-muted font-medium">
            Age {heir.age} · {heir.status}
          </div>
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {heir.traits.map((t) => (
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

      <p className="text-[13px] text-ink2 leading-snug mt-2.5 italic">{heir.bio}</p>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <HeirStat label="Aptitude" value={heir.aptitude} />
        <HeirStat label="Loyalty" value={heir.loyalty} />
        <HeirStat label="Appeal" value={heir.publicAppeal} />
      </div>

      {heir.status === "adult" && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <InvestButton
            label="Tutor"
            sub={`$${(DYNASTY_COSTS.TUTORING / 1000).toFixed(0)}K`}
            count={heir.investmentCount.tutoring}
            onClick={onTutor}
            disabled={!canTutor}
          />
          <InvestButton
            label="Mentor"
            sub="8 energy"
            count={heir.investmentCount.mentorship}
            onClick={onMentor}
            disabled={!canMentor}
          />
          <InvestButton
            label="Public"
            sub={`$${(DYNASTY_COSTS.PUBLIC_ROLE / 1000).toFixed(0)}K`}
            count={heir.investmentCount.publicRole}
            onClick={onPublicize}
            disabled={!canPublicize}
          />
        </div>
      )}
    </div>
  );
}

function HeirStat({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value);
  const tone = pct >= 70 ? "text-green" : pct >= 40 ? "text-yellow-deep" : "text-red";
  return (
    <div className="bg-surface rounded-chip p-2 text-center">
      <div className="text-[9px] text-muted font-bold uppercase tracking-wider">{label}</div>
      <div className={`font-extrabold text-[16px] leading-none mt-0.5 ${tone}`}>{pct}</div>
    </div>
  );
}

function InvestButton({
  label,
  sub,
  count,
  onClick,
  disabled,
}: {
  label: string;
  sub: string;
  count: number;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-ink text-white py-2 px-1 rounded-chip disabled:opacity-40 disabled:cursor-not-allowed text-center relative"
    >
      <div className="font-bold text-[11px] uppercase tracking-wide leading-tight">{label}</div>
      <div className="text-[9px] opacity-70 mt-0.5">{sub}</div>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 bg-white text-ink text-[9px] font-extrabold rounded-full w-4 h-4 flex items-center justify-center border border-ink">
          {count}
        </span>
      )}
    </button>
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
