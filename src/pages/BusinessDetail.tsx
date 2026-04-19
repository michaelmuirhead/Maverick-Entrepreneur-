import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useGame } from "@/app/store/useGame";
import { formatDailyMoney, formatMoney } from "@/engine/simulation";
import { CITY_MAP } from "@/data/cities";
import { INDUSTRIES } from "@/data/industries";
import {
  MARKETING_PRESETS,
  MARKETING_MAX_SPEND,
  STAFF_TIERS,
  locationUpgradeCost,
  locationUpgradeEffects,
} from "@/data/operations";
import { Icon, IconChip, type ChipVariant, type IconName } from "@/components/ui/Icon";
import type { Company, Location, IndustryId, StaffTier } from "@/types";

export function BusinessDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const state = useGame();
  const {
    companies,
    cash,
    setStaffTier,
    setMarketingSpend,
    upgradeLocation,
  } = state;

  const company = companies.find((c) => c.id === id);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);

  if (!company) {
    return (
      <div className="mt-8 text-center">
        <h1 className="text-[24px] font-bold">Business not found</h1>
        <button onClick={() => navigate("/empire")} className="btn-secondary mt-6 !w-auto inline-flex">
          <Icon name="arrow-left" size={16} />
          Back to Empire
        </button>
      </div>
    );
  }

  const industry = INDUSTRIES[company.industry];
  const info = industryTypeInfo(company.industry);
  const currentTier = STAFF_TIERS[company.staffTier];
  const nextTier =
    company.staffTier < 4 ? STAFF_TIERS[(company.staffTier + 1) as StaffTier] : null;
  const prevTier =
    company.staffTier > 1 ? STAFF_TIERS[(company.staffTier - 1) as StaffTier] : null;

  const monthlyRevenue = company.locations.reduce((s, l) => s + l.monthlyRevenue, 0);
  const monthlyProfit = company.locations.reduce((s, l) => s + l.monthlyProfit, 0);
  const dailyRevenue = formatDailyMoney(monthlyRevenue);
  const dailyProfit = formatDailyMoney(monthlyProfit);

  const spend = company.marketingSpend;
  const dailySpend = Math.round(spend / 30);
  const maxDailySpend = Math.round(MARKETING_MAX_SPEND / 30);
  const spendPct = (spend / MARKETING_MAX_SPEND) * 100;

  const primaryCity = company.locations[0] ? CITY_MAP[company.locations[0].cityId] : null;

  return (
    <div className="-mx-5">
      {/* Hero */}
      <div
        className="relative h-[180px] rounded-card mx-5 overflow-hidden"
        style={{ background: monoGradient(company.industry) }}
      >
        <button
          onClick={() => navigate("/empire")}
          className="absolute top-3.5 left-3.5 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center backdrop-blur-sm z-10"
          aria-label="Back"
        >
          <Icon name="arrow-left" size={18} strokeWidth={2.5} />
        </button>
        <div className="absolute top-3.5 right-3.5 z-10">
          <span className="pill pill-active"><span className="pill-dot" />ACTIVE</span>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 p-4 text-white"
          style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.75) 0%, transparent 100%)" }}
        >
          <div className="flex items-center gap-1.5 text-[12px] font-semibold opacity-90 mb-1">
            <Icon name={info.icon} size={13} strokeWidth={2} />
            {industry.name}
          </div>
          <div className="text-[24px] font-extrabold tracking-tight leading-tight">
            {company.name}
          </div>
          <div className="text-[13px] font-medium opacity-90 mt-0.5">
            {primaryCity ? primaryCity.name : "—"} · {company.locations.length}{" "}
            location{company.locations.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <div className="px-5 pt-5">
        {feedback && (
          <div className="card-flat mb-4 text-sm italic text-ink2 fade-up">{feedback}</div>
        )}

        {/* Top metrics row */}
        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          <MetricCard
            label="Daily Revenue"
            value={`$${dailyRevenue.toLocaleString()}`}
            delta={`$${formatMoney(monthlyRevenue)}/mo`}
          />
          <MetricCard
            label="Daily Profit"
            value={`$${dailyProfit.toLocaleString()}`}
            valueTone={dailyProfit >= 0 ? "green" : "red"}
            delta={`$${formatMoney(monthlyProfit)}/mo`}
            deltaTone={dailyProfit >= 0 ? "green" : "red"}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <MetricBar
            label="Brand"
            value={company.brandStrength}
            tone="yellow"
          />
          <MetricBar
            label="Morale"
            value={company.morale}
            cap={currentTier.moraleCap}
            tone="green"
          />
        </div>

        {/* Staff tier panel */}
        <div className="card-flat mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[16px] tracking-tight">Staff Tier</div>
            <span className="px-2.5 py-1 rounded-full bg-red-soft text-red text-[11px] font-bold">
              -${Math.round(currentTier.monthlySalaryDelta / 30).toLocaleString()}/day
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {([1, 2, 3, 4] as StaffTier[]).map((t) => {
              const tInfo = STAFF_TIERS[t];
              const isCurrent = t === company.staffTier;
              const isLocked = company.locations.length < tInfo.minLocations;
              const canAfford = cash >= tInfo.upgradeSigningBonus || t <= company.staffTier;

              return (
                <button
                  key={t}
                  onClick={() => {
                    if (!isLocked && canAfford && !isCurrent) {
                      const r = setStaffTier(company.id, t);
                      setFeedback(r.message);
                    }
                  }}
                  disabled={isLocked || (!canAfford && !isCurrent)}
                  className={`relative p-3 text-center rounded-tile border-2 transition-colors ${
                    isCurrent
                      ? "border-blue bg-blue-soft"
                      : isLocked
                      ? "border-line opacity-40 cursor-not-allowed"
                      : "border-line bg-white active:bg-surface"
                  }`}
                >
                  <div
                    className={`font-extrabold text-[18px] leading-none ${
                      isCurrent ? "text-blue" : "text-muted"
                    }`}
                  >
                    {toRoman(t)}
                  </div>
                  <div className="text-[13px] font-bold mt-1">{tInfo.name}</div>
                  <div className="text-[10px] text-muted font-medium mt-0.5">
                    {t === 1
                      ? "base"
                      : `+$${Math.round(tInfo.monthlySalaryDelta / 30)}/d`}
                  </div>
                  {isCurrent && (
                    <span className="absolute -top-1.5 -right-1.5 bg-blue text-white text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded-full">
                      CURRENT
                    </span>
                  )}
                  {isLocked && t > 1 && (
                    <div className="text-[9px] text-red font-semibold mt-0.5">
                      {tInfo.minLocations}+ loc
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 p-3 bg-white rounded-chip text-[12px] leading-snug">
            <span className="font-bold">{currentTier.name} · </span>
            {currentTier.description}
            <div className="flex gap-3 mt-2 flex-wrap text-[11px]">
              <span className="text-green font-bold">
                REV ×{currentTier.revenueMultiplier.toFixed(2)}
              </span>
              <span className="text-green font-bold">MORALE CAP {currentTier.moraleCap}</span>
              <span className="font-bold">TALENT +{currentTier.talentScore}</span>
            </div>
          </div>

          {(nextTier || prevTier) && (
            <div className="flex gap-2 mt-3">
              {nextTier && company.locations.length >= nextTier.minLocations && (
                <button
                  onClick={() => {
                    const r = setStaffTier(company.id, nextTier.tier);
                    setFeedback(r.message);
                  }}
                  disabled={cash < nextTier.upgradeSigningBonus}
                  className="flex-1 bg-ink text-white py-2.5 px-3 rounded-chip font-bold text-[11px] tracking-wide uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Upgrade · {formatMoney(nextTier.upgradeSigningBonus)}
                </button>
              )}
              {prevTier && (
                <button
                  onClick={() => {
                    const r = setStaffTier(company.id, prevTier.tier);
                    setFeedback(r.message);
                  }}
                  className="px-3 py-2.5 border-2 border-red text-red rounded-chip font-bold text-[11px] tracking-wide uppercase"
                >
                  Downgrade
                </button>
              )}
            </div>
          )}
        </div>

        {/* Marketing spend panel */}
        <div className="card-flat mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[16px] tracking-tight">Marketing Spend</div>
            <span className="px-2.5 py-1 rounded-full bg-red-soft text-red text-[11px] font-bold">
              -${dailySpend.toLocaleString()}/day
            </span>
          </div>

          <div className="relative h-9 rounded-chip overflow-hidden"
            style={{
              background: "linear-gradient(to right, rgba(0,0,0,0.05) 0%, rgba(16,185,129,0.3) 50%, rgba(239,68,68,0.3) 100%)"
            }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 bg-ink/80"
              style={{ width: `${spendPct}%` }}
            />
            <div
              className="absolute top-1/2 w-6 h-6 bg-white border-[3px] border-ink rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${spendPct}%` }}
            />
            <input
              type="range"
              min={0}
              max={MARKETING_MAX_SPEND}
              step={500}
              value={spend}
              onChange={(e) => {
                const r = setMarketingSpend(company.id, Number(e.target.value));
                setFeedback(r.message);
              }}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
          </div>

          <div className="flex justify-between mt-1.5 text-[11px] font-semibold text-muted">
            <span>$0</span>
            <span>${Math.round(maxDailySpend / 2)}/d</span>
            <span>${maxDailySpend}/d</span>
          </div>

          <div className="flex items-baseline justify-between mt-3">
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wide">
              Today
            </span>
            <span className="text-[22px] font-extrabold text-red">
              ${dailySpend}
            </span>
          </div>

          <div className="flex gap-1.5 mt-3 overflow-x-auto scroll-x pb-1">
            {MARKETING_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  const r = setMarketingSpend(company.id, p.spend);
                  setFeedback(r.message);
                }}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full border text-[12px] font-semibold ${
                  spend === p.spend
                    ? "bg-ink text-white border-ink"
                    : "bg-white border-line"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Locations */}
        <div className="flex items-center gap-2.5 mt-6 mb-3">
          <IconChip icon="map" variant="purple" size="sm" />
          <h2 className="text-[18px] font-extrabold tracking-tight">
            Locations ({company.locations.length})
          </h2>
        </div>

        <div className="space-y-2">
          {company.locations.map((loc) => {
            const city = CITY_MAP[loc.cityId];
            const isMax = loc.qualityTier >= 3;
            const upgradeCostValue = !isMax
              ? locationUpgradeCost(
                  loc.qualityTier,
                  city?.rentIndex ?? 1,
                  industry.startingCost
                )
              : null;
            const isDrawerOpen = activeDrawer === loc.id;
            const effects = isMax ? null : locationUpgradeEffects(loc.qualityTier);

            return (
              <div key={loc.id}>
                <div className="list-card !rounded-tile !p-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-extrabold flex-shrink-0"
                    style={{
                      background: "var(--tw-bg-opacity, #ffedd5)",
                      color: "#f97316",
                    }}
                  >
                    <IconChip
                      icon="building-2"
                      variant="orange"
                      size="sm"
                      round
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[14px] leading-tight">
                      {city?.name ?? loc.cityId}
                      {loc.qualityTier === 3 && (
                        <span className="text-[11px] font-semibold text-orange ml-1">
                          · flagship
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted font-medium mt-0.5 flex items-center gap-1.5">
                      <span>Tier {toRoman(loc.qualityTier)}</span>
                      {loc.streetDetail && (
                        <>
                          <span>·</span>
                          <span className="italic truncate">{loc.streetDetail}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-[13px]">
                      ${formatDailyMoney(loc.monthlyRevenue).toLocaleString()}/d
                    </div>
                    <div
                      className={`text-[11px] font-semibold ${
                        loc.monthlyProfit >= 0 ? "text-green" : "text-red"
                      }`}
                    >
                      {loc.monthlyProfit >= 0 ? "+" : ""}${formatDailyMoney(loc.monthlyProfit).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveDrawer(isDrawerOpen ? null : loc.id)}
                    disabled={isMax}
                    className={`px-2 py-1.5 rounded-chip text-[10px] font-bold uppercase tracking-wide border whitespace-nowrap flex-shrink-0 ml-1 ${
                      isMax
                        ? "border-line text-muted cursor-not-allowed"
                        : "border-ink text-ink"
                    }`}
                  >
                    {isMax ? "Max" : "Upgrade"}
                  </button>
                </div>

                {isDrawerOpen && effects && !isMax && upgradeCostValue && (
                  <div className="p-4 bg-surface2 rounded-tile mt-1.5 fade-up">
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="font-bold text-[14px]">
                        Upgrade to Tier {toRoman(loc.qualityTier + 1)}
                        {loc.qualityTier + 1 === 3 && " · Flagship"}
                      </div>
                      <div className="font-extrabold text-[15px] text-red">
                        {formatMoney(upgradeCostValue)}
                      </div>
                    </div>
                    <p className="text-[12px] leading-relaxed text-ink2 mb-2.5">
                      {loc.qualityTier === 1
                        ? `Refine the ${city?.name} location. Better finishes, a proper signage package. Permanent revenue lift.`
                        : `Rebuild as a flagship. Expanded footprint, a reception space worth photographing. The location becomes a destination.`}
                    </p>
                    <div className="flex flex-wrap gap-2 text-[10px] font-bold mb-3">
                      <span className="text-green">REV ×{effects.revenueMultBefore.toFixed(2)} → ×{effects.revenueMultAfter.toFixed(2)}</span>
                      <span className="text-green">MORALE +{effects.moraleBump}</span>
                      <span className="text-green">BRAND +{effects.brandBump}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const r = upgradeLocation(company.id, loc.id);
                          setFeedback(r.message);
                          setActiveDrawer(null);
                        }}
                        disabled={cash < upgradeCostValue}
                        className="btn-secondary !py-2 !text-[12px] disabled:opacity-40"
                      >
                        Commit Upgrade
                      </button>
                      <button
                        onClick={() => setActiveDrawer(null)}
                        className="btn-outline !py-2 !text-[12px]"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}

// ==================== Subcomponents ====================

function MetricCard({
  label,
  value,
  valueTone,
  delta,
  deltaTone,
}: {
  label: string;
  value: string;
  valueTone?: "green" | "red";
  delta: string;
  deltaTone?: "green" | "red";
}) {
  return (
    <div className="bg-surface rounded-tile p-3.5">
      <div className="text-[11px] text-muted font-semibold uppercase tracking-wide">
        {label}
      </div>
      <div
        className={`text-[24px] font-extrabold mt-1 leading-none tracking-tight ${
          valueTone === "green" ? "text-green" : valueTone === "red" ? "text-red" : ""
        }`}
      >
        {value}
      </div>
      <div
        className={`text-[11px] font-semibold mt-0.5 ${
          deltaTone === "green" ? "text-green" : deltaTone === "red" ? "text-red" : "text-muted"
        }`}
      >
        {delta}
      </div>
    </div>
  );
}

function MetricBar({
  label,
  value,
  cap,
  tone,
}: {
  label: string;
  value: number;
  cap?: number;
  tone: "yellow" | "green";
}) {
  const fillColor = tone === "yellow" ? "bg-yellow" : "bg-green";
  return (
    <div className="bg-surface rounded-tile p-3.5">
      <div className="text-[11px] text-muted font-semibold uppercase tracking-wide">
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-1 leading-none">
        <span className="text-[24px] font-extrabold tracking-tight">{Math.round(value)}</span>
        <span className="text-[13px] text-muted">/{cap ?? 100}</span>
      </div>
      <div className="h-1 bg-line rounded-full mt-2 relative">
        <div
          className={`h-full rounded-full ${fillColor}`}
          style={{ width: `${value}%` }}
        />
        {cap !== undefined && cap < 100 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red"
            style={{ left: `${cap}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ==================== Helpers ====================

function toRoman(n: number): string {
  return ["", "I", "II", "III", "IV"][n] ?? `${n}`;
}

function monoGradient(industry: IndustryId): string {
  const map: Record<IndustryId, string> = {
    coffee: "linear-gradient(135deg, #6b3f1f 0%, #2d1810 100%)",
    software: "linear-gradient(135deg, #2f4858 0%, #1a2530 100%)",
    ecommerce: "linear-gradient(135deg, #2f5a3a 0%, #1a3020 100%)",
    fastfood: "linear-gradient(135deg, #8a3a28 0%, #4a1e12 100%)",
    construction: "linear-gradient(135deg, #7a5432 0%, #3d2a19 100%)",
    law: "linear-gradient(135deg, #1c3553 0%, #0a1f3a 100%)",
  };
  return map[industry];
}

interface IndustryTypeInfo {
  icon: IconName;
  variant: ChipVariant;
}

function industryTypeInfo(id: IndustryId): IndustryTypeInfo {
  const map: Record<IndustryId, IndustryTypeInfo> = {
    coffee: { icon: "coffee", variant: "yellow" },
    ecommerce: { icon: "cart", variant: "green" },
    software: { icon: "building-2", variant: "blue" },
    fastfood: { icon: "truck", variant: "red" },
    construction: { icon: "wrench", variant: "orange" },
    law: { icon: "briefcase", variant: "purple" },
  };
  return map[id];
}
