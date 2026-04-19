import { useState } from "react";
import { useGame } from "@/app/store/useGame";
import { DAYS_PER_MONTH, totalDays } from "@/engine/simulation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon, IconChip, type ChipVariant } from "@/components/ui/Icon";
import type { GameEvent, EventChoice, RivalMove, RealEstateAction } from "@/types";

export function Messages() {
  const { events, rivalMoves, realEstateActions, resolveEvent, month, dayInMonth } = useGame();
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);

  const currentDay = totalDays(month, dayInMonth);
  const feed = buildFeed(events, rivalMoves, realEstateActions, currentDay);
  const unresolved = events.filter((e) => !e.resolved);

  const openEvent = openEventId ? events.find((e) => e.id === openEventId) ?? null : null;

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle="Events, decisions, and market activity"
        rightSlot={
          unresolved.length > 0 ? (
            <span className="pill pill-warn">{unresolved.length} pending</span>
          ) : null
        }
      />

      {resolution && (
        <div className="card-flat mb-3 text-sm italic text-ink2 fade-up">{resolution}</div>
      )}

      {unresolved.length > 0 && (
        <div className="mb-5">
          <div className="text-[10px] font-bold text-muted tracking-widest uppercase mb-2">
            Awaiting Your Decision
          </div>
          <div className="space-y-2.5">
            {unresolved.map((e) => (
              <button
                key={e.id}
                onClick={() => setOpenEventId(e.id)}
                className="list-card !rounded-tile !border-orange !bg-orange-soft/40 w-full text-left"
              >
                <IconChip icon="warning" variant="orange" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[14px] leading-tight">{e.headline}</div>
                  <div className="text-[12px] text-muted mt-0.5">Tap to decide</div>
                </div>
                <Icon name="chevron-right" size={18} className="text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] font-bold text-muted tracking-widest uppercase mb-2">Feed</div>

      {feed.length === 0 ? (
        <div className="card-flat text-center py-10">
          <div className="text-[14px] font-semibold text-ink2">No messages yet.</div>
          <div className="text-[12px] text-muted mt-1">
            Activity from your empire will show up here.
          </div>
        </div>
      ) : (
        <div className="card-flat !p-0 px-4">
          {feed.map((item, idx) => (
            <FeedRow
              key={item.id}
              item={item}
              isLast={idx === feed.length - 1}
              onClick={item.kind === "event" ? () => setOpenEventId(item.rawId) : undefined}
            />
          ))}
        </div>
      )}

      <div className="h-6" />

      {openEvent && (
        <EventModal
          event={openEvent}
          onClose={() => setOpenEventId(null)}
          onResolve={(choice) => {
            resolveEvent(openEvent.id, choice);
            setResolution(choice.resultText);
            setOpenEventId(null);
          }}
        />
      )}
    </>
  );
}

interface FeedItem {
  id: string;
  rawId: string;
  kind: "event" | "rival" | "realestate";
  icon: "warning" | "building-2" | "package" | "x-circle" | "cart";
  variant: ChipVariant;
  headline: string;
  body: string;
  daysAgo: number;
  isUnresolved?: boolean;
}

function buildFeed(
  events: GameEvent[],
  rivalMoves: RivalMove[],
  reActions: RealEstateAction[],
  currentDay: number
): FeedItem[] {
  const items: FeedItem[] = [];

  for (const e of events.slice(-20).reverse()) {
    items.push({
      id: `ev_${e.id}`,
      rawId: e.id,
      kind: "event",
      icon: "warning",
      variant: e.resolved ? "surface" : "orange",
      headline: e.headline,
      body: e.body,
      daysAgo: Math.max(0, currentDay - e.month * DAYS_PER_MONTH),
      isUnresolved: !e.resolved,
    });
  }

  for (const m of rivalMoves.slice(-15).reverse()) {
    items.push({
      id: `rv_${m.id}`,
      rawId: m.id,
      kind: "rival",
      icon: "building-2",
      variant: m.tone === "hostile" || m.tone === "threat" ? "red" : "blue",
      headline: m.headline,
      body: m.body,
      daysAgo: Math.max(0, currentDay - m.month * DAYS_PER_MONTH),
    });
  }

  for (const a of reActions.slice(-10).reverse()) {
    items.push({
      id: `re_${a.id}`,
      rawId: a.id,
      kind: "realestate",
      icon: "building-2",
      variant: "green",
      headline: a.headline,
      body: a.detail,
      daysAgo: Math.max(0, currentDay - a.month * DAYS_PER_MONTH),
    });
  }

  items.sort((a, b) => a.daysAgo - b.daysAgo);
  return items.slice(0, 30);
}

function formatDaysAgo(days: number): string {
  if (days === 0) return "now";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function FeedRow({
  item,
  isLast,
  onClick,
}: {
  item: FeedItem;
  isLast: boolean;
  onClick?: () => void;
}) {
  const isClickable = !!onClick;
  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={`flex gap-3 py-3 w-full text-left ${
        !isLast ? "border-b border-line" : ""
      } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
    >
      <IconChip icon={item.icon} variant={item.variant} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-[14px] leading-tight flex-1 min-w-0">
            {item.headline}
          </div>
          <div className="text-[12px] text-muted font-medium whitespace-nowrap">
            {formatDaysAgo(item.daysAgo)}
          </div>
        </div>
        <div className="text-[13px] text-ink2 mt-0.5 leading-snug line-clamp-2">{item.body}</div>
        {item.isUnresolved && (
          <div className="text-[11px] font-bold text-orange uppercase tracking-wide mt-1">
            Tap to decide ›
          </div>
        )}
      </div>
    </button>
  );
}

function EventModal({
  event,
  onClose,
  onResolve,
}: {
  event: GameEvent;
  onClose: () => void;
  onResolve: (choice: EventChoice) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 bg-black/50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-[24px] md:rounded-card w-full max-w-[430px] max-h-[85vh] overflow-y-auto fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-line sticky top-0 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-orange uppercase tracking-wider mb-1">
                {event.category}
              </div>
              <h2 className="text-[22px] font-extrabold leading-tight tracking-tight">
                {event.headline}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-surface flex items-center justify-center flex-shrink-0"
              aria-label="Close"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>
        <div className="p-5">
          <p className="text-[15px] text-ink2 leading-relaxed italic">{event.body}</p>
          <div className="mt-5 space-y-2">
            {(event.choices ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => onResolve(c)}
                className="w-full text-left p-4 rounded-tile border-2 border-line hover:border-blue hover:bg-blue-soft/40 transition-colors"
              >
                <div className="font-bold text-[14px]">{c.label}</div>
                <div className="flex gap-3 mt-2 flex-wrap text-[11px] font-semibold">
                  {c.effect.cash !== undefined && (
                    <span className={c.effect.cash >= 0 ? "text-green" : "text-red"}>
                      {c.effect.cash >= 0 ? "+" : ""}${c.effect.cash.toLocaleString()}
                    </span>
                  )}
                  {c.effect.reputation !== undefined && (
                    <span className={c.effect.reputation >= 0 ? "text-green" : "text-red"}>
                      REP {c.effect.reputation >= 0 ? "+" : ""}
                      {c.effect.reputation}
                    </span>
                  )}
                  {c.effect.morale !== undefined && (
                    <span className={c.effect.morale >= 0 ? "text-green" : "text-red"}>
                      MORALE {c.effect.morale >= 0 ? "+" : ""}
                      {c.effect.morale}
                    </span>
                  )}
                  {c.effect.brand !== undefined && (
                    <span className={c.effect.brand >= 0 ? "text-green" : "text-red"}>
                      BRAND {c.effect.brand >= 0 ? "+" : ""}
                      {c.effect.brand}
                    </span>
                  )}
                  {c.effect.stress !== undefined && (
                    <span className={c.effect.stress <= 0 ? "text-green" : "text-red"}>
                      STRESS {c.effect.stress >= 0 ? "+" : ""}
                      {c.effect.stress}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
