import { type ReactNode } from "react";
import { IconChip, type ChipVariant } from "./Icon";
import type { IconName } from "./Icon";

// Large page title — used at the top of a screen
export function PageHeader({
  title,
  subtitle,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5 mt-2">
      <div className="min-w-0">
        <h1 className="text-[34px] font-extrabold tracking-tight leading-none">{title}</h1>
        {subtitle && <p className="text-[15px] text-ink2 mt-1 leading-tight">{subtitle}</p>}
      </div>
      {rightSlot && <div className="flex-shrink-0">{rightSlot}</div>}
    </div>
  );
}

// Section header — used within a page for a subsection
export function SectionHeader({
  icon,
  variant = "blue",
  title,
  meta,
  rightSlot,
}: {
  icon: IconName;
  variant?: ChipVariant;
  title: string;
  meta?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 mt-6 mb-3">
      <IconChip icon={icon} variant={variant} size="sm" />
      <div className="flex-1 min-w-0">
        <h2 className="text-[22px] font-extrabold tracking-tight leading-tight">{title}</h2>
        {meta && <div className="text-[13px] text-muted font-medium leading-tight">{meta}</div>}
      </div>
      {rightSlot && <div className="flex-shrink-0">{rightSlot}</div>}
    </div>
  );
}

// Stat pills (shown in top-right of page headers)
export function StatPill({
  icon,
  value,
  variant = "blue",
}: {
  icon: IconName;
  value: string | number;
  variant?: "blue" | "purple";
}) {
  const bg = variant === "purple" ? "bg-purple-soft text-purple" : "bg-blue-soft text-blue";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip font-bold text-sm ${bg}`}
    >
      <span className="inline-flex items-center">
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* placeholder stroked icon content — the IconChip below is preferred */}
        </svg>
      </span>
      {value}
    </span>
  );
}
