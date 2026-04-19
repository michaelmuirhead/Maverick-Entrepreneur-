import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGame } from "@/app/store/useGame";
import {
  DAYS_PER_MONTH,
  formatDailyMoney,
  formatDateWithDay,
  totalDays,
  weekdayIndex,
} from "@/engine/simulation";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Icon, IconChip } from "@/components/ui/Icon";

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export function Home() {
  const state = useGame();
  const {
    month,
    dayInMonth,
    startYear,
    cash,
    companies,
    founder,
    events,
    rivalMoves,
    realEstateActions,
    advanceDay,
  } = state;

  const navigate = useNavigate();
  const [lastHeadline, setLastHeadline] = useState<string | null>(null);

  const currentDay = totalDays(month, dayInMonth);
  const wd = weekdayIndex(dayInMonth, month);
  const today = formatDateWithDay(month, dayInMonth + 1, startYear);

  // Energy as 10h-style display (0-100 energy → 0-10h left)
  const hoursLeft = Math.round(founder.energy / 10);

  // Build the "Market News" feed by interleaving recent events, rival moves, RE actions
  const feed = buildFeed(state);

  const handleSimulate = () => {
    const result = advanceDay();
    if (result.headline) {
      setLastHeadline(result.headline);
    }
    if (result.newEventId) {
      // TODO wire to Messages / event modal in Phase 4.2
    }
  };

  const mainCompany = companies[0];
  const firstName = founder.name.split(" ")[0] || "Founder";

  return (
    <>
      {/* Greeting + stats row */}
      <div className="flex items-start justify-between gap-4 mt-2 mb-5">
        <div>
          <div className="text-[28px] font-extrabold tracking-tight leading-none">
            Welcome back,
          </div>
          <div className="text-[28px] font-extrabold tracking-tight leading-none text-ink2">
            {firstName}
          </div>
        </div>
        <div className="flex gap-2 mt-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip font-bold text-sm bg-blue-soft text-blue">
            <Icon name="bolt" size={14} strokeWidth={2.2} />
            {currentDay}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip font-bold text-sm bg-purple-soft text-purple">
            <Icon name="clock" size={14} strokeWidth={2.2} />
            {hoursLeft}h
          </span>
        </div>
      </div>

      {/* Simulate Day CTA */}
      <button onClick={handleSimulate} className="btn-primary">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/25">
          <Icon name="arrow-right" size={14} strokeWidth={2.5} />
        </span>
        Simulate Day {currentDay + 1}
      </button>

      {/* Last advance message */}
      {lastHeadline && (
        <div className="card-flat mt-3 text-sm italic text-ink2 fade-up">
          {lastHeadline}
        </div>
      )}

      {/* Week strip */}
      <div className="flex justify-between items-center py-4 px-1">
        {WEEKDAY_LABELS.map((label, idx) => (
          <div
            key={idx}
            className={`w-8 h-8 flex items-center justify-center text-[13px] font-semibold rounded-full ${
              idx === wd ? "bg-blue text-white" : "text-muted"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Finances */}
      <SectionHeader
        icon="dollar"
        variant="green"
        title="Finances"
        meta={today}
      />
      <Link to="/bank" className="card-flat block">
        <div className="text-[13px] font-semibold text-ink2">Bank Balance</div>
        <div className="text-[36px] font-extrabold tracking-tight leading-tight mt-1">
          ${cash.toLocaleString()}
        </div>
        {mainCompany && (
          <div className="text-[12px] text-muted mt-1 font-medium">
            ~${formatDailyMoney(
              companies.reduce(
                (sum, c) => sum + c.locations.reduce((s, l) => s + l.monthlyProfit, 0),
                0
              )
            ).toLocaleString()}/day in profit
          </div>
        )}
      </Link>

      {/* Market News */}
      <SectionHeader
        icon="file"
        variant="orange"
        title="Market News"
        meta="Latest business updates"
        rightSlot={
          <button
            className="w-8 h-8 rounded-chip border border-orange bg-white text-orange flex items-center justify-center"
            aria-label="Filter news"
          >
            <Icon name="list" size={14} />
          </button>
        }
      />
      {feed.length === 0 ? (
        <div className="card-flat text-center text-muted text-sm py-6 italic">
          No news yet. Advance a few days to see activity.
        </div>
      ) : (
        <div className="card-flat !p-0 px-4">
          {feed.map((item, idx) => (
            <FeedItem key={item.id} item={item} isLast={idx === feed.length - 1} />
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <SectionHeader
        icon="bolt"
        variant="purple"
        title="Quick Actions"
        meta="Manage your operations"
      />
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <QuickAction
          tone="peach"
          icon="plus"
          iconColor="#f97316"
          title="Open Business"
          sub="Start a new venture"
          onClick={() => navigate("/empire")}
        />
        <QuickAction
          tone="sky"
          icon="users"
          iconColor="#3b82f6"
          title="Services"
          sub="Banks & agencies"
          onClick={() => navigate("/services")}
        />
        {state.founder.age >= 45 && (
          <QuickAction
            tone="lavender"
            icon="user-plus"
            iconColor="#8b5cf6"
            title="Succession"
            sub="Heirs & planning"
            onClick={() => navigate("/people")}
          />
        )}
        <QuickAction
          tone="mint"
          icon="building-2"
          iconColor="#10b981"
          title="Real Estate"
          sub="Portfolio & listings"
          onClick={() => navigate("/real-estate")}
        />
      </div>

      <div className="h-6" />
    </>
  );
}

// ==================== Feed helpers ====================

interface FeedItem {
  id: string;
  iconName: "cart" | "building-2" | "x-circle" | "package" | "warning" | "crown";
  iconVariant: "blue" | "green" | "pink" | "purple" | "yellow" | "orange" | "red";
  headline: string;
  sub: string;
  daysAgo: number;
}

function buildFeed(state: ReturnType<typeof useGame.getState>): FeedItem[] {
  const items: FeedItem[] = [];
  const currentDay = totalDays(state.month, state.dayInMonth);

  // Recent events
  for (const e of state.events.slice(-4).reverse()) {
    items.push({
      id: `ev_${e.id}`,
      iconName: "warning",
      iconVariant: "orange",
      headline: e.headline,
      sub: e.body.slice(0, 90) + (e.body.length > 90 ? "..." : ""),
      daysAgo: Math.max(0, currentDay - e.month * DAYS_PER_MONTH),
    });
  }

  // Recent rival moves
  for (const m of state.rivalMoves.slice(-3).reverse()) {
    items.push({
      id: `rv_${m.id}`,
      iconName: "building-2",
      iconVariant: m.tone === "hostile" || m.tone === "threat" ? "red" : "blue",
      headline: m.headline,
      sub: m.body.slice(0, 90) + (m.body.length > 90 ? "..." : ""),
      daysAgo: Math.max(0, currentDay - m.month * DAYS_PER_MONTH),
    });
  }

  // Recent real estate
  for (const a of state.realEstateActions.slice(-2).reverse()) {
    items.push({
      id: `re_${a.id}`,
      iconName: "building-2",
      iconVariant: "green",
      headline: a.headline,
      sub: a.detail.slice(0, 90) + (a.detail.length > 90 ? "..." : ""),
      daysAgo: Math.max(0, currentDay - a.month * DAYS_PER_MONTH),
    });
  }

  // Sort by recency and take top 5
  items.sort((a, b) => a.daysAgo - b.daysAgo);
  return items.slice(0, 5);
}

function formatDaysAgo(days: number): string {
  if (days === 0) return "now";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function FeedItem({ item, isLast }: { item: FeedItem; isLast: boolean }) {
  return (
    <div
      className={`flex gap-3 py-3 ${!isLast ? "border-b border-line" : ""}`}
    >
      <IconChip icon={item.iconName} variant={item.iconVariant} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-[14px] leading-tight">{item.headline}</div>
          <div className="text-[12px] text-muted font-medium whitespace-nowrap">
            {formatDaysAgo(item.daysAgo)}
          </div>
        </div>
        <div className="text-[13px] text-ink2 mt-0.5 leading-snug">{item.sub}</div>
      </div>
    </div>
  );
}

// ==================== Quick Action tile ====================

function QuickAction({
  tone,
  icon,
  iconColor,
  title,
  sub,
  onClick,
}: {
  tone: "peach" | "sky" | "lavender" | "mint";
  icon: "plus" | "users" | "user-plus" | "building-2";
  iconColor: string;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  const bgClass = {
    peach: "bg-orange-soft",
    sky: "bg-blue-soft",
    lavender: "bg-purple-soft",
    mint: "bg-green-soft",
  }[tone];

  return (
    <button
      onClick={onClick}
      className={`rounded-card p-4 min-h-[96px] text-left transition-transform active:scale-[0.98] ${bgClass}`}
    >
      <div className="w-8 h-8 rounded-full bg-white/70 flex items-center justify-center mb-2">
        <Icon name={icon} size={16} strokeWidth={2.2} style={{ color: iconColor }} />
      </div>
      <div className="font-bold text-[14px] text-ink">{title}</div>
      <div className="text-[11px] text-ink2 mt-0.5">{sub}</div>
    </button>
  );
}
