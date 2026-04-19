import { useState } from "react";
import { Link } from "react-router-dom";
import { useGame } from "@/app/store/useGame";
import { formatDailyMoney } from "@/engine/simulation";
import { CITIES, CITY_MAP } from "@/data/cities";
import { INDUSTRIES } from "@/data/industries";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Icon, IconChip, type ChipVariant, type IconName } from "@/components/ui/Icon";
import type { Company, IndustryId } from "@/types";

type PropertyFilter = "all" | "retail" | "office";

export function Empire() {
  const { companies, properties } = useGame();
  const [segment, setSegment] = useState<"active" | "vacant">("active");
  const [filter, setFilter] = useState<PropertyFilter>("all");

  const activeCount = companies.length;
  const vacantCount = properties.filter((p) => p.usage.kind === "vacant").length;

  // Determine which cities have activity
  const cityUsage = new Map<string, number>();
  for (const c of companies) {
    for (const loc of c.locations) {
      cityUsage.set(loc.cityId, (cityUsage.get(loc.cityId) ?? 0) + 1);
    }
  }

  // Cities to show in the scroller: active ones first, then a few "explore" options
  const activeCityIds = Array.from(cityUsage.keys());
  const exploreCityIds = CITIES
    .filter((c) => !activeCityIds.includes(c.id))
    .slice(0, 3)
    .map((c) => c.id);
  const scrollerCityIds = [...activeCityIds, ...exploreCityIds];

  // Filter companies by type for the list
  const filtered = companies.filter((c) => {
    if (filter === "all") return true;
    const info = industryTypeInfo(c.industry);
    return info.category === filter;
  });

  return (
    <>
      <PageHeader
        title="My Empire"
        subtitle="Manage your businesses & explore cities"
        rightSlot={
          <div className="flex gap-2 mt-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip font-bold text-sm bg-blue-soft text-blue">
              <Icon name="building" size={14} strokeWidth={2.2} />
              {activeCount}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip font-bold text-sm bg-purple-soft text-purple">
              <Icon name="map" size={14} strokeWidth={2.2} />
              {activeCityIds.length}
            </span>
          </div>
        }
      />

      {/* Cities scroller */}
      <SectionHeader
        icon="map"
        variant="purple"
        title="Cities"
        meta={`${activeCityIds.length} active · ${exploreCityIds.length} to explore`}
      />

      <div className="scroll-x -mx-5 px-5 pb-2">
        <div className="flex gap-3">
          {scrollerCityIds.map((cityId) => {
            const city = CITY_MAP[cityId];
            if (!city) return null;
            const businessCount = cityUsage.get(cityId) ?? 0;
            return <CityCard key={cityId} cityId={cityId} name={city.name} businessCount={businessCount} />;
          })}
        </div>
      </div>

      {/* Business list */}
      <SectionHeader
        icon="building"
        variant="blue"
        title="Your Businesses"
        meta={`${activeCount} Active · ${vacantCount} Vacant`}
      />

      <div className="flex gap-0 bg-surface p-1 rounded-tile mb-3.5">
        <button
          onClick={() => setSegment("active")}
          className={`flex-1 py-2.5 rounded-chip font-semibold text-[13px] flex items-center justify-center gap-1.5 transition-all ${
            segment === "active"
              ? "bg-green text-white shadow-sm"
              : "text-ink2"
          }`}
        >
          <Icon name="check" size={14} strokeWidth={2.5} />
          Active ({activeCount})
        </button>
        <button
          onClick={() => setSegment("vacant")}
          className={`flex-1 py-2.5 rounded-chip font-semibold text-[13px] flex items-center justify-center gap-1.5 transition-all ${
            segment === "vacant"
              ? "bg-green text-white shadow-sm"
              : "text-ink2"
          }`}
        >
          <Icon name="home" size={14} strokeWidth={2.2} />
          Vacant ({vacantCount})
        </button>
      </div>

      <div className="text-[10px] font-bold text-muted tracking-widest uppercase mb-2.5">
        Filter by Type
      </div>
      <div className="flex gap-2 mb-4">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          icon="grid"
          label="All"
        />
        <FilterChip
          active={filter === "retail"}
          onClick={() => setFilter("retail")}
          icon="cart"
          label="Retail"
          count={companies.filter((c) => industryTypeInfo(c.industry).category === "retail").length}
        />
        <FilterChip
          active={filter === "office"}
          onClick={() => setFilter("office")}
          icon="briefcase"
          label="Office"
          count={companies.filter((c) => industryTypeInfo(c.industry).category === "office").length}
        />
      </div>

      {segment === "active" && filtered.length === 0 && (
        <div className="card-flat text-center text-muted text-sm py-10 italic">
          No businesses yet in this category.
        </div>
      )}

      {segment === "vacant" && (
        <div className="card-flat text-center text-muted text-sm py-10 italic">
          No vacant properties. Tap a business to see its real estate.
        </div>
      )}

      {segment === "active" && (
        <div className="space-y-2.5">
          {filtered.map((c) => (
            <BusinessTile key={c.id} company={c} />
          ))}
        </div>
      )}

      <div className="h-6" />
    </>
  );
}

// ==================== City card ====================

function CityCard({
  cityId,
  name,
  businessCount,
}: {
  cityId: string;
  name: string;
  businessCount: number;
}) {
  // Map city → gradient style (stand-in for illustrated hero)
  const gradient = CITY_GRADIENTS[cityId] ?? CITY_GRADIENTS.default;
  return (
    <Link
      to="/empire"
      className="flex-shrink-0 w-[260px] h-[180px] rounded-card relative overflow-hidden"
      style={{ background: gradient }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(0deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.05) 100%)",
        }}
      />
      <div className="absolute bottom-3.5 left-3.5 right-3.5 text-white">
        <div className="text-[22px] font-extrabold tracking-tight leading-none">
          {name}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 text-[12px] font-semibold opacity-95">
          <Icon name="building" size={12} strokeWidth={2} />
          {businessCount} {businessCount === 1 ? "Business" : "Businesses"}
        </div>
      </div>
    </Link>
  );
}

// Placeholder gradient per city — replaces hero illustrations for Phase 4.1
const CITY_GRADIENTS: Record<string, string> = {
  nyc: "linear-gradient(135deg, #c48f3b 0%, #8b5a1a 50%, #2d1f14 100%)",
  boston: "linear-gradient(135deg, #b74242 0%, #6d2828 50%, #2a1010 100%)",
  sf: "linear-gradient(135deg, #e89b5a 0%, #a55a2e 50%, #3a1f10 100%)",
  chicago: "linear-gradient(135deg, #5b85b8 0%, #2e4a6e 50%, #111f35 100%)",
  austin: "linear-gradient(135deg, #b9884f 0%, #7a5432 50%, #3d2a19 100%)",
  denver: "linear-gradient(135deg, #5a7a5e 0%, #334a38 50%, #161f18 100%)",
  miami: "linear-gradient(135deg, #5ec5c8 0%, #2e8488 50%, #10363a 100%)",
  seattle: "linear-gradient(135deg, #567b8c 0%, #2e4a57 50%, #111f27 100%)",
  phoenix: "linear-gradient(135deg, #c97842 0%, #8a4a22 50%, #3a1d0a 100%)",
  nashville: "linear-gradient(135deg, #9b6f3f 0%, #6a4828 50%, #2a1a0e 100%)",
  default: "linear-gradient(135deg, #6b7280 0%, #374151 50%, #111827 100%)",
};

// ==================== Business tile ====================

function BusinessTile({ company }: { company: Company }) {
  const industry = INDUSTRIES[company.industry];
  const info = industryTypeInfo(company.industry);
  const primaryLocation = company.locations[0];
  const city = primaryLocation ? CITY_MAP[primaryLocation.cityId] : null;
  const dailyProfit = formatDailyMoney(
    company.locations.reduce((sum, l) => sum + l.monthlyProfit, 0)
  );

  // Law firms get the orange-highlighted treatment as a signature visual
  const isHighlighted = company.industry === "law";

  const monogram = (company.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3) || "CO").toUpperCase();

  return (
    <Link
      to={`/business/${company.id}`}
      className={`list-card !rounded-tile ${
        isHighlighted
          ? "!border-orange !bg-gradient-to-b !from-[#fff7eb] !to-white"
          : ""
      }`}
    >
      <div
        className="w-[58px] h-[58px] rounded-tile flex items-center justify-center text-white font-extrabold text-[12px] flex-shrink-0"
        style={{ background: monoGradient(company.industry) }}
      >
        {monogram}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-[15px] tracking-tight truncate">
            {company.name}
          </div>
          <span className="pill pill-active"><span className="pill-dot" />ACTIVE</span>
        </div>
        <div className="text-[12px] text-muted font-medium mt-0.5">
          {city ? city.name : "—"} · {city?.state ?? ""}
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-[12px] font-semibold text-ink2">
          <Icon name={info.icon} size={14} className="text-blue" />
          {industry.name}
          <span className="ml-auto flex items-center gap-1 text-ink">
            <span className="w-[18px] h-[18px] bg-green-soft text-green rounded-[4px] inline-flex items-center justify-center text-[10px] font-bold">$</span>
            <span className="font-bold">${dailyProfit.toLocaleString()}</span>
          </span>
        </div>
      </div>
    </Link>
  );
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

// ==================== Filter chip ====================

function FilterChip({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2.5 rounded-tile flex items-center gap-1.5 font-semibold text-[13px] transition-colors ${
        active ? "bg-blue-soft text-blue" : "bg-surface text-ink2"
      }`}
    >
      <Icon name={icon} size={14} />
      {label}
      {count !== undefined && (
        <span
          className={`px-1.5 py-px rounded-full text-[11px] font-bold ${
            active ? "bg-blue/15 text-blue" : "bg-black/8 text-ink2"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ==================== Industry type metadata ====================

interface IndustryTypeInfo {
  icon: IconName;
  variant: ChipVariant;
  category: "office" | "retail";
}

function industryTypeInfo(id: IndustryId): IndustryTypeInfo {
  const map: Record<IndustryId, IndustryTypeInfo> = {
    coffee: { icon: "coffee", variant: "yellow", category: "retail" },
    ecommerce: { icon: "cart", variant: "green", category: "retail" },
    software: { icon: "building-2", variant: "blue", category: "office" },
    fastfood: { icon: "truck", variant: "red", category: "retail" },
    construction: { icon: "wrench", variant: "orange", category: "office" },
    law: { icon: "briefcase", variant: "purple", category: "office" },
  };
  return map[id];
}
